/**
 * The client page's "Latest session" card judges each set against its own prescription, from what is stored.
 *
 * Runs against a dev database only:
 *   set -a; . ./.env.local; set +a; ATLAS_DB_TEST=1 npx vitest run lib/coach/latest-session.db.test.ts
 * It makes its own workspace and removes it afterwards.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const RUN = !!process.env.ATLAS_DB_TEST;

describe.skipIf(!RUN)("the latest session, judged against the plan", () => {
  let prisma: typeof import("@/lib/db/client").prisma;
  let ws = "";
  let clientId = "";
  let logId = "";

  beforeAll(async () => {
    ({ prisma } = await import("@/lib/db/client"));
    const { createPlanForClient } = await import("@/lib/plan/persist");
    const { DEMO_PREFS } = await import("@/lib/guest");
    ws = (await prisma.workspace.create({ data: { name: "latest-session test workspace" }, select: { id: true } })).id;
    // A guest login makes it a guest workspace, so the test's cleanup is allowed to remove it.
    const user = await prisma.user.create({ data: { email: `${Date.now().toString(36)}-latest@guest.atlas.app`, name: "Latest", role: "CLIENT", workspaceId: ws, emailVerified: new Date() }, select: { id: true } });
    clientId = (await prisma.clientProfile.create({ data: { workspaceId: ws, userId: user.id, fullName: "Latest session test", status: "ACTIVE" } })).id;
    const made = await createPlanForClient({ workspaceId: ws, clientId, prefs: DEMO_PREFS, startDate: new Date() });
    const w = made.workouts[0];
    const [e1, e2] = w.exercises;
    // The coach wrote 95 / 105 / 115 for the first lift, 3 sets of 8–12 at 40 for the second.
    const rx = (weights: number[], min: number, max: number) => weights.map((weight, i) => ({ setNumber: i + 1, weight, repMin: min, repMax: max, rpe: 8, restSeconds: 90, notes: "" }));
    await prisma.assignedWorkoutExercise.update({ where: { id: e1.id }, data: { prescribedSets: rx([95, 105, 115], 6, 10) as never } });
    await prisma.assignedWorkoutExercise.update({ where: { id: e2.id }, data: { prescribedSets: rx([40, 40, 40], 8, 12) as never } });
    const log = await prisma.workoutLog.create({ data: { clientId, assignedWorkoutId: w.id, source: "GENERATED", date: new Date(), completedAt: new Date(), durationMin: 45 }, select: { id: true } });
    logId = log.id;
    const set = (e: { id: string; exerciseId: string }, setNumber: number, weight: number, reps: number) => ({ workoutLogId: log.id, exerciseId: e.exerciseId, assignedWorkoutExerciseId: e.id, setNumber, weight, reps, completed: true });
    await prisma.setLog.createMany({
      data: [
        set(e1, 1, 95, 6), // as planned
        set(e1, 2, 105, 6), // as planned (set 2's own weight, not set 1's)
        set(e1, 3, 125, 7), // heavier than the 115 planned: beat
        set(e2, 1, 40, 8),
        set(e2, 2, 40, 7), // under the floor: short
        // e2 set 3 skipped
      ],
    });
  }, 120_000);

  afterAll(async () => {
    const { deleteGuestWorkspace } = await import("@/lib/guest-cleanup");
    if (ws) await deleteGuestWorkspace(ws, { ttlMs: 0, includeAthletes: true }).catch((e) => console.error("cleanup failed", e));
  }, 60_000);

  it("counts beat, met, short and skipped per set against each set's own target", async () => {
    const { loadLatestSession } = await import("./latest-session");
    const s = await loadLatestSession({ clientId, workspaceId: ws, timeZone: "UTC" });
    expect(s).not.toBeNull();
    expect(s!.logId).toBe(logId);
    expect(s!.minutes).toBe(45);
    // The rest of the workout (four more exercises) wasn't logged: skipped.
    expect(s!.review.counts).toMatchObject({ beat: 1, met: 3, short: 1 });
    expect(s!.review.counts.skipped).toBe(1 + s!.review.exercises.slice(2).reduce((n, e) => n + e.sets.length, 0));
    expect(s!.review.exercises[0].sets.map((x) => x.outcome)).toEqual(["met", "met", "beat"]);
    expect(s!.review.exercises[1].sets.map((x) => x.outcome)).toEqual(["met", "short", "skipped"]);
  });

  it("is nothing for a client in another workspace", async () => {
    const { loadLatestSession } = await import("./latest-session");
    expect(await loadLatestSession({ clientId, workspaceId: "not-this-workspace", timeZone: "UTC" })).toBeNull();
  });
});
