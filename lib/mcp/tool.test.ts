import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { hashArgs, type AuditEntry } from "./audit";
import { notFound, type McpCaller, type ScopedClient } from "./context";
import { clientTool, executeTool, workspaceTool, type ToolDeps } from "./tool";

const trainer: McpCaller = { userId: "u_trainer", role: "TRAINER", workspaceId: "ws_1", clientProfileId: null };
const athlete: McpCaller = { userId: "u_client", role: "CLIENT", workspaceId: "ws_1", clientProfileId: "client_1" };

const client: ScopedClient = { id: "client_1", workspaceId: "ws_1", fullName: "Sam", primaryGoal: null, keyLiftIds: [], selfServe: true };

function harness() {
  const rows: AuditEntry[] = [];
  const handler = vi.fn(async () => ({ ok: true }));
  const deps: ToolDeps = {
    transport: "stdio",
    audit: async (e) => void rows.push(e),
    lookupClient: async (id, ws) => (id === "client_1" && ws === "ws_1" ? client : null),
  };
  const read = clientTool({
    name: "read_thing",
    title: "Read",
    description: "",
    permission: "read",
    roles: ["TRAINER", "ADMIN", "CLIENT"],
    input: z.object({ clientId: z.string().optional(), note: z.string().optional(), limit: z.number().int().max(10).default(5) }),
    handler,
  });
  const coachOnly = workspaceTool({
    name: "coach_thing",
    title: "Coach",
    description: "",
    permission: "write",
    roles: ["TRAINER", "ADMIN"],
    input: z.object({ name: z.string().min(1) }),
    handler,
  });
  return { rows, handler, deps, read, coachOnly };
}

describe("executeTool", () => {
  it("runs the handler with parsed arguments and the scoped client", async () => {
    const h = harness();
    const result = await executeTool(h.read, trainer, { clientId: "client_1" }, h.deps);
    expect(result).toEqual({ outcome: "ok", data: { ok: true } });
    expect(h.handler).toHaveBeenCalledWith(expect.objectContaining({ caller: trainer, client }), { clientId: "client_1", limit: 5 });
  });

  it("binds an athlete to their own profile when no clientId is sent", async () => {
    const h = harness();
    expect((await executeTool(h.read, athlete, {}, h.deps)).outcome).toBe("ok");
    expect(h.handler).toHaveBeenCalledWith(expect.objectContaining({ client }), expect.anything());
  });

  it("refuses a role that may not use the tool, before validation or any lookup", async () => {
    const h = harness();
    const lookup = vi.spyOn(h.deps, "lookupClient");
    const result = await executeTool(h.coachOnly, athlete, { name: 42 }, h.deps);
    expect(result.outcome).toBe("forbidden");
    expect(h.handler).not.toHaveBeenCalled();
    expect(lookup).not.toHaveBeenCalled();
  });

  it("rejects invalid arguments before touching the handler", async () => {
    const h = harness();
    const result = await executeTool(h.read, trainer, { clientId: "client_1", limit: 999 }, h.deps);
    expect(result.outcome).toBe("validation_error");
    expect(h.handler).not.toHaveBeenCalled();
  });

  it("answers 'not found' for a client outside the caller's scope, with no record data", async () => {
    const h = harness();
    const otherWorkspace = await executeTool(h.read, { ...trainer, workspaceId: "ws_2" }, { clientId: "client_1" }, h.deps);
    const otherClient = await executeTool(h.read, athlete, { clientId: "client_2" }, h.deps);
    for (const r of [otherWorkspace, otherClient]) {
      expect(r).toEqual({ outcome: "not_found", message: "Not found." });
    }
    expect(h.handler).not.toHaveBeenCalled();
  });

  it("passes through a not-found raised inside a handler", async () => {
    const h = harness();
    h.handler.mockRejectedValueOnce(notFound());
    expect((await executeTool(h.read, trainer, { clientId: "client_1" }, h.deps)).outcome).toBe("not_found");
  });

  it("hides internal errors from the caller", async () => {
    const h = harness();
    const quiet = vi.spyOn(console, "error").mockImplementation(() => {});
    h.handler.mockRejectedValueOnce(new Error('relation "SetLog" does not exist at postgres://user:pw@host'));
    const result = await executeTool(h.read, trainer, { clientId: "client_1" }, h.deps);
    expect(result).toEqual({ outcome: "error", message: "The tool failed. Nothing was changed." });
    quiet.mockRestore();
  });
});

describe("audit trail", () => {
  it("writes exactly one row per call for every outcome", async () => {
    const h = harness();
    const quiet = vi.spyOn(console, "error").mockImplementation(() => {});
    await executeTool(h.read, trainer, { clientId: "client_1" }, h.deps); // ok
    await executeTool(h.read, trainer, { clientId: "client_1", limit: 999 }, h.deps); // validation_error
    await executeTool(h.coachOnly, athlete, { name: "x" }, h.deps); // forbidden
    await executeTool(h.read, athlete, { clientId: "client_2" }, h.deps); // not_found
    h.handler.mockRejectedValueOnce(new Error("boom"));
    await executeTool(h.read, trainer, { clientId: "client_1" }, h.deps); // error
    quiet.mockRestore();

    expect(h.rows.map((r) => r.outcome)).toEqual(["ok", "validation_error", "forbidden", "not_found", "error"]);
    expect(h.rows.every((r) => r.transport === "stdio" && r.latencyMs >= 0)).toBe(true);
  });

  it("records who, what and on whom", async () => {
    const h = harness();
    await executeTool(h.read, trainer, { clientId: "client_1" }, h.deps);
    expect(h.rows[0]).toMatchObject({ workspaceId: "ws_1", actorUserId: "u_trainer", actorRole: "TRAINER", tool: "read_thing", clientId: "client_1" });
  });

  it("does not record a target client when scoping refused the call", async () => {
    const h = harness();
    await executeTool(h.read, athlete, { clientId: "client_2" }, h.deps);
    expect(h.rows[0].clientId).toBeNull();
  });

  it("stores a hash of the arguments and never the arguments themselves", async () => {
    const h = harness();
    const secret = "knee surgery in March, on blood thinners";
    await executeTool(h.read, trainer, { clientId: "client_1", note: secret }, h.deps);
    expect(h.rows[0].argsHash).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(h.rows[0])).not.toContain("knee");
    expect(JSON.stringify(h.rows[0])).not.toContain("blood");
  });

  it("hashes the same arguments the same way regardless of key order", () => {
    expect(hashArgs({ a: 1, b: { c: [1, 2], d: null } })).toBe(hashArgs({ b: { d: null, c: [1, 2] }, a: 1 }));
    expect(hashArgs({ a: 1 })).not.toBe(hashArgs({ a: 2 }));
  });

  it("still returns the tool result when the audit write fails", async () => {
    const h = harness();
    const quiet = vi.spyOn(console, "error").mockImplementation(() => {});
    h.deps.audit = async () => {
      throw new Error("audit table unreachable");
    };
    expect((await executeTool(h.read, trainer, { clientId: "client_1" }, h.deps)).outcome).toBe("ok");
    quiet.mockRestore();
  });
});
