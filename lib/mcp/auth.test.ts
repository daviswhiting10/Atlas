import { describe, expect, it, vi } from "vitest";

// The tool modules import the database client, which insists on a URL at
// import time. Nothing in this file connects: every case below is decided
// before a handler (and so any query) runs.
vi.hoisted(() => {
  process.env.DATABASE_URL ??= "postgresql://test:test@localhost:5432/test";
});

import { resolveClientScope } from "./auth";
import type { McpCaller, McpRole, ScopedClient } from "./context";
import { TOOLS } from "./server";
import { executeTool, type ToolDeps } from "./tool";

const COACHES: McpRole[] = ["TRAINER", "ADMIN"];
const EVERYONE: McpRole[] = ["TRAINER", "ADMIN", "CLIENT"];

/** The permission matrix from the implementation plan. A tool missing here fails the suite. */
const EXPECTED: Record<string, { roles: McpRole[]; permission: string; scope: "client" | "workspace" }> = {
  get_workout_history: { roles: EVERYONE, permission: "read", scope: "client" },
  get_exercise_history: { roles: EVERYONE, permission: "read", scope: "client" },
  analyze_progress: { roles: EVERYONE, permission: "read", scope: "client" },
  get_personal_records: { roles: EVERYONE, permission: "read", scope: "client" },
  detect_plateaus: { roles: EVERYONE, permission: "read", scope: "client" },
  get_training_volume: { roles: EVERYONE, permission: "read", scope: "client" },
  get_active_program: { roles: EVERYONE, permission: "read", scope: "client" },
  get_program_details: { roles: EVERYONE, permission: "read", scope: "workspace" },
  generate_program: { roles: COACHES, permission: "generate", scope: "client" },
  save_program: { roles: COACHES, permission: "write", scope: "workspace" },
  update_program: { roles: COACHES, permission: "write", scope: "workspace" },
  search_exercises: { roles: EVERYONE, permission: "read", scope: "workspace" },
  get_training_recommendations: { roles: EVERYONE, permission: "read", scope: "client" },
  get_user_fitness_profile: { roles: EVERYONE, permission: "read", scope: "client" },
  log_workout: { roles: EVERYONE, permission: "write", scope: "client" },
  // Plan editing: an athlete edits their own plan, a coach any client's in their workspace.
  add_plan_workout: { roles: EVERYONE, permission: "write", scope: "client" },
  remove_plan_workout: { roles: EVERYONE, permission: "write", scope: "client" },
  add_plan_exercise: { roles: EVERYONE, permission: "write", scope: "client" },
  remove_plan_exercise: { roles: EVERYONE, permission: "write", scope: "client" },
  swap_plan_exercise: { roles: EVERYONE, permission: "write", scope: "client" },
  set_plan_exercise_targets: { roles: EVERYONE, permission: "write", scope: "client" },
  set_plan_note: { roles: EVERYONE, permission: "write", scope: "client" },
  set_plan_lighter_weeks: { roles: EVERYONE, permission: "write", scope: "client" },
};

/** Otherwise-valid arguments for tools that require more than a client, so each case fails for the reason under test. */
const VALID: Record<string, Record<string, unknown>> = {
  get_exercise_history: { exerciseId: "ex_1" },
  log_workout: { assignedWorkoutId: "aw_1", sets: [{ exerciseId: "ex_1", setNumber: 1, weight: 100, reps: 8 }] },
  generate_program: { goal: "hypertrophy", durationWeeks: 8, sessionsPerWeek: 3, sessionLength: 60, equipment: "full gym" },
  add_plan_workout: { week: 3, name: "Extra" },
  remove_plan_workout: { assignedWorkoutId: "aw_1" },
  add_plan_exercise: { assignedWorkoutId: "aw_1", slug: "plank" },
  remove_plan_exercise: { planExerciseId: "awe_1" },
  swap_plan_exercise: { planExerciseId: "awe_1", slug: "plank" },
  set_plan_exercise_targets: { planExerciseId: "awe_1", sets: 4 },
  set_plan_note: { text: "Felt strong" },
  set_plan_lighter_weeks: { on: true },
};
const argsFor = (tool: { name: string }, extra: Record<string, unknown> = {}) => ({ ...VALID[tool.name], ...extra });

// Two workspaces, two clients in the first one.
const CLIENTS: Record<string, ScopedClient> = {
  alice: { id: "alice", workspaceId: "ws_a", fullName: "Alice", primaryGoal: null, keyLiftIds: [], selfServe: false },
  bob: { id: "bob", workspaceId: "ws_a", fullName: "Bob", primaryGoal: null, keyLiftIds: [], selfServe: false },
  zed: { id: "zed", workspaceId: "ws_z", fullName: "Zed", primaryGoal: null, keyLiftIds: [], selfServe: false },
};
const lookup = vi.fn(async (id: string, ws: string) => (CLIENTS[id]?.workspaceId === ws ? CLIENTS[id] : null));

const caller = (role: McpRole, clientProfileId: string | null = null, workspaceId = "ws_a"): McpCaller => ({
  userId: `u_${role}`,
  role,
  workspaceId,
  clientProfileId,
});

const deps: ToolDeps = { transport: "http", audit: async () => {}, lookupClient: lookup };

describe("tool inventory", () => {
  it("exposes exactly the planned tools", () => {
    expect(TOOLS.map((t) => t.name).sort()).toEqual(Object.keys(EXPECTED).sort());
  });

  it.each(TOOLS.map((t) => [t.name, t] as const))("%s has the planned roles, permission and scope", (name, tool) => {
    expect([...tool.roles].sort()).toEqual([...EXPECTED[name].roles].sort());
    expect(tool.permission).toBe(EXPECTED[name].permission);
    expect(tool.scope).toBe(EXPECTED[name].scope);
  });

  it("gives every client-scoped tool a clientId argument, and no tool a workspaceId argument", () => {
    for (const tool of TOOLS) {
      const keys = Object.keys(tool.input.shape);
      if (tool.scope === "client") expect(keys, tool.name).toContain("clientId");
      // The workspace always comes from the caller, never from the request.
      expect(keys, tool.name).not.toContain("workspaceId");
      expect(keys, tool.name).not.toContain("userId");
    }
  });
});

describe("role gate (403)", () => {
  const cases = TOOLS.flatMap((tool) => EVERYONE.map((role) => [tool.name, role, tool] as const));

  it.each(cases.filter(([, role, tool]) => !tool.roles.includes(role)))("%s refuses %s", async (_name, role, tool) => {
    lookup.mockClear();
    const result = await executeTool(tool, caller(role, role === "CLIENT" ? "alice" : null), {}, deps);
    expect(result).toEqual({ outcome: "forbidden", message: "This tool is not available to your role." });
    expect(lookup).not.toHaveBeenCalled();
  });

  it("refuses an athlete only on the coach's program-library tools", () => {
    const refused = TOOLS.filter((t) => !t.roles.includes("CLIENT")).map((t) => t.name).sort();
    expect(refused).toEqual(["generate_program", "save_program", "update_program"]);
  });
});

describe("client scope (404)", () => {
  const scoped = TOOLS.filter((t) => t.scope === "client");

  it.each(scoped.map((t) => [t.name, t] as const))("%s: a coach reaching into another workspace gets 'not found'", async (_n, tool) => {
    for (const role of tool.roles.filter((r) => r !== "CLIENT")) {
      const result = await executeTool(tool, caller(role), argsFor(tool, { clientId: "zed" }), deps);
      expect(result, role).toEqual({ outcome: "not_found", message: "Not found." });
    }
  });

  it.each(scoped.filter((t) => t.roles.includes("CLIENT")).map((t) => [t.name, t] as const))(
    "%s: an athlete naming another client gets 'not found'",
    async (_n, tool) => {
      lookup.mockClear();
      // Same workspace and a different workspace: both must look identical from outside.
      for (const other of ["bob", "zed"]) {
        expect(await executeTool(tool, caller("CLIENT", "alice"), argsFor(tool, { clientId: other }), deps)).toEqual({ outcome: "not_found", message: "Not found." });
      }
      expect(lookup).not.toHaveBeenCalled(); // never even looked the other client up
    }
  );

  it.each(scoped.map((t) => [t.name, t] as const))("%s: a coach must say which client", async (_n, tool) => {
    for (const role of tool.roles.filter((r) => r !== "CLIENT")) {
      expect((await executeTool(tool, caller(role), argsFor(tool), deps)).outcome, role).toBe("validation_error");
    }
  });
});

describe("resolveClientScope", () => {
  it("lets a trainer act on any client in their own workspace", async () => {
    expect(await resolveClientScope(caller("TRAINER"), "alice", lookup)).toBe(CLIENTS.alice);
    expect(await resolveClientScope(caller("TRAINER"), "bob", lookup)).toBe(CLIENTS.bob);
  });

  it("treats an admin like a trainer: own workspace only", async () => {
    expect(await resolveClientScope(caller("ADMIN"), "alice", lookup)).toBe(CLIENTS.alice);
    await expect(resolveClientScope(caller("ADMIN"), "zed", lookup)).rejects.toMatchObject({ outcome: "not_found" });
  });

  it("binds an athlete to their own profile, with or without the argument", async () => {
    expect(await resolveClientScope(caller("CLIENT", "alice"), undefined, lookup)).toBe(CLIENTS.alice);
    expect(await resolveClientScope(caller("CLIENT", "alice"), "alice", lookup)).toBe(CLIENTS.alice);
  });

  it("rejects an athlete with no linked profile", async () => {
    await expect(resolveClientScope(caller("CLIENT", null), undefined, lookup)).rejects.toMatchObject({ outcome: "not_found" });
  });

  it("looks clients up with the caller's workspace, never one from the request", async () => {
    lookup.mockClear();
    await resolveClientScope(caller("TRAINER", null, "ws_a"), "alice", lookup);
    expect(lookup).toHaveBeenCalledWith("alice", "ws_a");
  });

  it("uses 'not found' — not 'forbidden' — for every cross-scope case", async () => {
    const attempts = [
      resolveClientScope(caller("TRAINER"), "zed", lookup),
      resolveClientScope(caller("TRAINER"), "nobody", lookup),
      resolveClientScope(caller("CLIENT", "alice"), "bob", lookup),
      resolveClientScope(caller("CLIENT", "alice"), "zed", lookup),
    ];
    for (const attempt of attempts) await expect(attempt).rejects.toMatchObject({ outcome: "not_found", message: "Not found." });
  });
});

describe("plan editing", () => {
  const editTools = TOOLS.filter((t) => t.name.includes("plan_") && t.permission === "write");

  it("is open to an athlete for their own plan", () => {
    expect(editTools.map((t) => t.name).sort()).toEqual(
      ["add_plan_exercise", "add_plan_workout", "remove_plan_exercise", "remove_plan_workout", "set_plan_exercise_targets", "set_plan_lighter_weeks", "set_plan_note", "swap_plan_exercise"].sort()
    );
    for (const t of editTools) expect(t.roles, t.name).toContain("CLIENT");
  });

  it.each(editTools.map((t) => [t.name, t] as const))("%s: an athlete reaching for another client's plan gets 404, never 403", async (_n, tool) => {
    for (const other of ["bob", "zed"]) {
      const result = await executeTool(tool, caller("CLIENT", "alice"), argsFor(tool, { clientId: other }), deps);
      expect(result).toEqual({ outcome: "not_found", message: "Not found." });
    }
  });

  it.each(editTools.map((t) => [t.name, t] as const))("%s: a coach reaching into another workspace gets 404", async (_n, tool) => {
    expect(await executeTool(tool, caller("TRAINER"), argsFor(tool, { clientId: "zed" }), deps)).toEqual({ outcome: "not_found", message: "Not found." });
  });

  it("writes an audit row for every edit, including refused ones", async () => {
    const rows: string[] = [];
    const audited: ToolDeps = { ...deps, audit: async (e) => void rows.push(`${e.tool}:${e.outcome}`) };
    for (const tool of editTools) await executeTool(tool, caller("CLIENT", "alice"), argsFor(tool, { clientId: "bob" }), audited);
    expect(rows).toEqual(editTools.map((t) => `${t.name}:not_found`));
  });
});
