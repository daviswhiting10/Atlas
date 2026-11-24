import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { resetPlanRows, resetQuestion, sessionsOnPlan } from "./reset-progress";
import { deleteSessionRows } from "@/lib/sessions/delete";

const src = (p: string) => readFileSync(new URL(`../../${p}`, import.meta.url), "utf8");

/** A transaction that records which table each write went to, and with what. */
const fake = (logIds: string[]) => {
  const calls: Array<{ table: string; op: string; args: unknown }> = [];
  const t = (table: string) => ({
    findMany: async (args: unknown) => (calls.push({ table, op: "findMany", args }), logIds.map((id) => ({ id }))),
    deleteMany: async (args: unknown) => (calls.push({ table, op: "deleteMany", args }), { count: table === "setLog" ? 7 : logIds.length }),
    delete: async (args: unknown) => (calls.push({ table, op: "delete", args }), {}),
    updateMany: async (args: unknown) => (calls.push({ table, op: "updateMany", args }), { count: 2 }),
  });
  return { calls, tx: { setLog: t("setLog"), sessionNote: t("sessionNote"), goalCheckIn: t("goalCheckIn"), workoutLog: t("workoutLog"), assignedWorkout: t("assignedWorkout") } };
};

describe("the restart question", () => {
  it("counts the sessions it deletes", () => {
    expect(resetQuestion(12)).toBe("Delete 12 sessions and restart at Week 1 Day 1?");
    expect(resetQuestion(1)).toBe("Delete 1 session and restart at Week 1 Day 1?");
  });
  it("says when there is nothing to delete", () => {
    expect(resetQuestion(0)).toBe("Nothing to delete. You're already at Week 1 Day 1.");
    expect(resetQuestion(0, 3)).toBe("No sessions to delete. Bring back skipped workouts and restart at Week 1 Day 1?");
  });
});

describe("restarting a plan's rows", () => {
  it("takes the sessions on this plan only, for this athlete", () => {
    expect(sessionsOnPlan("pa1", "c1")).toEqual({ clientId: "c1", assignedWorkout: { is: { programAssignmentId: "pa1" } } });
  });

  it("deletes each session the way a single delete does (the same tables, in the same order), then schedules every workout again", async () => {
    const one = fake([]);
    await deleteSessionRows(one.tx as never, "x");
    const single = one.calls.map((c) => c.table);

    const { calls, tx } = fake(["l1", "l2"]);
    const r = await resetPlanRows(tx as never, { assignmentId: "pa1", clientId: "c1" });
    expect(r).toEqual({ sessions: 2, sets: 7, workouts: 2 });
    const writes = calls.filter((c) => c.op !== "findMany");
    expect(writes.slice(0, 4).map((c) => c.table)).toEqual(single);
    expect(writes.slice(0, 3).every((c) => JSON.stringify(c.args) === JSON.stringify({ where: { workoutLogId: { in: ["l1", "l2"] } } }))).toBe(true);
    expect(writes[3].args).toEqual({ where: { id: { in: ["l1", "l2"] }, clientId: "c1" } });
    expect(writes[4]).toEqual({ table: "assignedWorkout", op: "updateMany", args: { where: { programAssignmentId: "pa1", status: { not: "PLANNED" } }, data: { status: "PLANNED" } } });
  });

  it("with no sessions, only brings skipped workouts back", async () => {
    const { calls, tx } = fake([]);
    expect(await resetPlanRows(tx as never, { assignmentId: "pa1", clientId: "c1" })).toEqual({ sessions: 0, sets: 0, workouts: 2 });
    expect(calls.filter((c) => c.op === "deleteMany")).toEqual([]);
  });
});

describe("who can restart", () => {
  const actions = src("lib/actions/athlete.ts");
  const fn = actions.slice(actions.indexOf("async function ownActivePlan"), actions.indexOf("// ── Editing the plan"));
  it("only someone who makes their own plan, not a guest or a demo, on their own active plan, in one transaction", () => {
    expect(fn).toContain("isGuestEmail(");
    expect(fn).toContain('if (!meta) return { ok: false, error: "Your plan is managed by your coach." }');
    expect(fn).toContain("meta.demo === true");
    expect(fn).toContain('where: { clientId, workspaceId, status: "ACTIVE" }');
    expect(fn).toContain("own.assignmentId !== parsed.data.assignmentId");
    expect(fn).toContain("prisma.$transaction((tx) => resetPlanRows(tx,");
  });
  it("is under the Plan ⋯, for a self-serve athlete who isn't a guest or a demo", () => {
    const header = src("components/nav/HeaderActions.tsx");
    expect(header).toContain("Restart plan");
    expect(header).toContain("<RestartPlanSheet");
    expect(src("app/(client)/layout.tsx")).toContain("restartPlan={athlete.selfServe && !athlete.isDemo && !athlete.isGuest}");
    const sheet = src("components/athlete/RestartPlanSheet.tsx");
    expect(sheet).toContain("useSheetLock()");
    expect(sheet).toContain("bg-destructive");
  });
});
