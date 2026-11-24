/**
 * Restart plan: every session on the plan goes (sets, notes, challenge tags), skipped workouts come back, and up next is
 * Week 1 Day 1 on Today and Plan (the plan overview) and over MCP (get_active_program). An off-plan session stays. Only
 * the athlete's own plan, and only someone who makes their own plan.
 *   set -a; . ./.env.local; set +a; ATLAS_DB_TEST=1 npx vitest run lib/plan/reset-progress.db.test.ts
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const current = vi.hoisted(() => ({ user: null as null | Record<string, unknown> }));
vi.mock("@/lib/auth", () => ({ auth: async () => (current.user ? { user: current.user } : null) }));
vi.mock("next/cache", () => ({ revalidatePath: () => {}, revalidateTag: () => {} }));
vi.mock("next/headers", () => ({ headers: () => new Headers(), cookies: () => ({ get: () => undefined }) }));
vi.mock("react", async (orig) => ({ ...(await orig<typeof import("react")>()), cache: <T,>(fn: T) => fn }));

const DAY = 86_400_000;
type Who = { user: string; client: string; plan: Array<{ id: string; aweId: string }>; assignmentId: string };

describe.skipIf(!process.env.ATLAS_DB_TEST)("restart plan", () => {
  let prisma: typeof import("@/lib/db/client").prisma;
  let ws = "";
  const tag = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
  const people: Record<"a" | "b" | "coached", Who> = {} as never;
  const as = (w: Who, email?: string) => (current.user = { id: w.user, role: "CLIENT", workspaceId: ws, clientProfileId: w.client, ...(email ? { email } : {}) });
  const actions = () => import("@/lib/actions/athlete");

  async function logIt(w: Who, i: number, finish = true): Promise<string> {
    as(w);
    const { saveSet, finishWorkout } = await actions();
    const r = await saveSet({ assignedWorkoutId: w.plan[i].id, aweId: w.plan[i].aweId, setNumber: 1, weight: 100, reps: 8, done: true });
    if (finish) await finishWorkout({ assignedWorkoutId: w.plan[i].id, durationMin: 30 });
    return r.workoutLogId;
  }
  async function upNext(w: Who): Promise<{ overview: string | null; mcp: string | null }> {
    const { loadPlanOverview } = await import("./overview");
    const o = await loadPlanOverview({ clientId: w.client, workspaceId: ws });
    const { getActiveProgram } = await import("@/lib/mcp/tools/programs");
    const client = { id: w.client, workspaceId: ws, fullName: "Sam Lee", primaryGoal: null, keyLiftIds: [], selfServe: true };
    const m = (await (getActiveProgram as unknown as { handler: (c: unknown, a: unknown) => Promise<unknown> }).handler({ client }, { clientId: w.client })) as {
      program: { nextWorkout: { assignedWorkoutId: string } | null } | null;
    };
    return { overview: o?.nextUp?.id ?? null, mcp: m.program?.nextWorkout?.assignedWorkoutId ?? null };
  }
  /** Everything a restart could touch, for one athlete. */
  async function counts(w: Who) {
    const logs = await prisma.workoutLog.findMany({ where: { clientId: w.client }, select: { id: true, assignedWorkoutId: true } });
    const ids = logs.map((l) => l.id);
    return {
      planSessions: logs.filter((l) => l.assignedWorkoutId).length,
      offPlan: logs.filter((l) => !l.assignedWorkoutId).length,
      sets: await prisma.setLog.count({ where: { workoutLogId: { in: ids } } }),
      notes: await prisma.sessionNote.count({ where: { clientId: w.client, workoutLogId: { not: null } } }),
      tags: await prisma.goalCheckIn.count({ where: { goal: { clientId: w.client }, workoutLogId: { not: null } } }),
      notPlanned: await prisma.assignedWorkout.count({ where: { programAssignmentId: w.assignmentId, status: { not: "PLANNED" } } }),
    };
  }

  beforeAll(async () => {
    ({ prisma } = await import("@/lib/db/client"));
    const { createPlanForClient } = await import("@/lib/plan/persist");
    const { DEMO_PREFS } = await import("@/lib/guest");
    const { normalizePrefs } = await import("@/lib/plan/generator");
    ws = (await prisma.workspace.create({ data: { name: "restart plan test" }, select: { id: true } })).id;
    for (const key of ["a", "b", "coached"] as const) {
      const user = (await prisma.user.create({ data: { email: `${tag}-${key}@guest.atlas.app`, name: key, role: "CLIENT", workspaceId: ws }, select: { id: true } })).id;
      const client = (
        await prisma.clientProfile.create({
          data: { workspaceId: ws, userId: user, fullName: `Test ${key}`, status: "ACTIVE", ...(key === "coached" ? {} : { goalTargets: { athlete: { prefs: normalizePrefs(DEMO_PREFS), demo: false } } }) },
          select: { id: true },
        })
      ).id;
      await createPlanForClient({ workspaceId: ws, clientId: client, prefs: DEMO_PREFS, startDate: new Date(Date.now() - 7 * DAY) });
      const rows = await prisma.assignedWorkout.findMany({
        where: { programAssignment: { clientId: client } },
        orderBy: { order: "asc" },
        select: { id: true, programAssignmentId: true, exercises: { orderBy: { order: "asc" }, take: 1, select: { id: true } } },
      });
      people[key] = { user, client, assignmentId: rows[0].programAssignmentId, plan: rows.map((r) => ({ id: r.id, aweId: r.exercises[0].id })) };
    }
  }, 240_000);

  afterAll(async () => {
    const { deleteGuestWorkspace } = await import("@/lib/guest-cleanup");
    if (ws) await deleteGuestWorkspace(ws, { ttlMs: 0, includeAthletes: true }).catch((e) => console.error("cleanup failed", e));
  }, 60_000);

  it("deletes every session on the plan, keeps the off-plan one, and up next is Week 1 Day 1 again", async () => {
    const { a, b } = people;
    // Three workouts done, a note on the first, a challenge tag on the second, the fourth skipped, the fifth only started.
    const day1 = await logIt(a, 0);
    const day2 = await logIt(a, 1);
    await logIt(a, 2);
    as(a);
    const { saveMySessionNote, setWorkoutSkipped, logCardio, planProgressToReset, resetPlanProgress } = await actions();
    expect(await saveMySessionNote({ assignedWorkoutId: a.plan[0].id, text: "felt strong" })).toEqual({ ok: true });
    await setWorkoutSkipped({ assignedWorkoutId: a.plan[3].id, skipped: true });
    await logIt(a, 4, false);
    as(a);
    expect(await logCardio({ activity: "WALK", minutes: 20 })).toEqual({ ok: true });
    const goal = await prisma.goal.create({
      data: { workspaceId: ws, clientId: a.client, name: "Test", category: "challenge", rules: {}, timeZone: "UTC", startDay: "2026-11-01", startedBy: "CLIENT" },
      select: { id: true },
    });
    await prisma.goalCheckIn.create({ data: { goalId: goal.id, ruleKey: "outdoors", day: "2026-11-02", workoutLogId: day2, by: "CLIENT" } });
    // B has a session of their own, which must not move.
    await logIt(b, 0);
    const bBefore = await counts(b);

    const before = await counts(a);
    expect(before).toEqual({ planSessions: 4, offPlan: 1, sets: 4, notes: 1, tags: 1, notPlanned: 1 });
    expect((await upNext(a)).overview).not.toBe(a.plan[0].id);

    as(a);
    expect(await planProgressToReset()).toEqual({ ok: true, assignmentId: a.assignmentId, sessions: 4, skipped: 1 });
    expect(await resetPlanProgress({ assignmentId: a.assignmentId })).toEqual({ ok: true, sessions: 4 });

    expect(await counts(a)).toEqual({ planSessions: 0, offPlan: 1, sets: 0, notes: 0, tags: 0, notPlanned: 0 });
    expect(await prisma.workoutLog.count({ where: { id: { in: [day1, day2] } } })).toBe(0);
    expect(await upNext(a)).toEqual({ overview: a.plan[0].id, mcp: a.plan[0].id });
    expect(await counts(b)).toEqual(bBefore);

    // Nothing left: the sheet says so.
    expect(await planProgressToReset()).toEqual({ ok: true, assignmentId: a.assignmentId, sessions: 0, skipped: 0 });
  }, 240_000);

  it("another athlete can't restart this plan", async () => {
    const { a, b } = people;
    await logIt(a, 0);
    const before = await counts(a);
    as(b);
    const { resetPlanProgress } = await actions();
    expect(await resetPlanProgress({ assignmentId: a.assignmentId })).toEqual({ ok: false, error: "That plan isn't there." });
    expect(await counts(a)).toEqual(before);
    expect(before.planSessions).toBe(1);
  }, 120_000);

  it("a coach's client, a guest and a signed-out visitor can't restart", async () => {
    const { a, coached } = people;
    await logIt(coached, 0);
    const before = await counts(coached);
    as(coached);
    const { planProgressToReset, resetPlanProgress } = await actions();
    expect(await planProgressToReset()).toEqual({ ok: false, error: "Your plan is managed by your coach." });
    expect(await resetPlanProgress({ assignmentId: coached.assignmentId })).toEqual({ ok: false, error: "Your plan is managed by your coach." });
    expect(await counts(coached)).toEqual(before);

    const aBefore = await counts(a);
    as(a, `${tag}-a@guest.atlas.app`);
    expect((await resetPlanProgress({ assignmentId: a.assignmentId })).ok).toBe(false);
    current.user = null;
    await expect(resetPlanProgress({ assignmentId: a.assignmentId })).rejects.toThrow("Unauthorized");
    expect(await counts(a)).toEqual(aBefore);
  }, 120_000);
});
