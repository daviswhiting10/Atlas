/**
 * Rehearsal on a real database (a throwaway athlete): dumbbells "per hand" (lib/exercises/implements.ts). A new set starts
 * per hand, the athlete's last choice is the next default (in their logger and the coach's "last time" read), the choice is
 * stored on each set, and only the weight lifted doubles.
 *   scripts/local-db.sh run env ATLAS_DB_TEST=1 npx vitest run lib/sessions/implements.db.test.ts
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const current = vi.hoisted(() => ({ user: null as null | Record<string, unknown> }));
vi.mock("@/lib/auth", () => ({ auth: async () => (current.user ? { user: current.user } : null) }));
vi.mock("next/cache", () => ({ revalidatePath: () => {}, revalidateTag: () => {}, unstable_cache: <T,>(fn: T) => fn }));
vi.mock("next/headers", () => ({ headers: () => new Headers(), cookies: () => ({ get: () => undefined }) }));
vi.mock("react", async (orig) => ({ ...(await orig<typeof import("react")>()), cache: <T,>(fn: T) => fn }));

const DAY = 86_400_000;

describe.skipIf(!process.env.ATLAS_DB_TEST)("dumbbells per hand", () => {
  let prisma: typeof import("@/lib/db/client").prisma;
  let ws = "";
  let clientId = "";
  let curl = "";
  let barbell = "";
  const workouts: string[] = [];
  const awes: Record<string, { curl: string; barbell: string }> = {};
  const tag = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

  beforeAll(async () => {
    ({ prisma } = await import("@/lib/db/client"));
    const { createPlanForClient } = await import("@/lib/plan/persist");
    const { DEMO_PREFS } = await import("@/lib/guest");
    ws = (await prisma.workspace.create({ data: { name: "per hand test" }, select: { id: true } })).id;
    const user = (await prisma.user.create({ data: { email: `${tag}-pat@guest.atlas.app`, name: "Pat", role: "CLIENT", workspaceId: ws }, select: { id: true } })).id;
    clientId = (
      await prisma.clientProfile.create({
        data: { workspaceId: ws, userId: user, fullName: "Pat Kim", status: "ACTIVE", goalTargets: { athlete: { prefs: DEMO_PREFS, demo: false } } },
        select: { id: true },
      })
    ).id;
    await createPlanForClient({ workspaceId: ws, clientId, prefs: DEMO_PREFS, startDate: new Date(Date.now() - 7 * DAY) });
    const ex = (name: string, equipment: string) =>
      prisma.exercise.create({
        data: { workspaceId: ws, name, slug: `${tag}-${equipment}`, movementPattern: "HORIZONTAL_PULL", primaryMuscles: ["biceps"], secondaryMuscles: [], equipment, instructions: [] },
        select: { id: true },
      });
    curl = (await ex("Hammer Curl", "dumbbell")).id;
    barbell = (await ex("Barbell Curl", "barbell")).id;
    const rows = await prisma.assignedWorkout.findMany({ where: { programAssignment: { clientId } }, orderBy: { order: "asc" }, take: 2, select: { id: true } });
    for (const w of rows) {
      workouts.push(w.id);
      const add = (exerciseId: string, order: number) =>
        prisma.assignedWorkoutExercise.create({ data: { workspaceId: ws, assignedWorkoutId: w.id, exerciseId, order, prescribedSets: [1, 2].map((n) => ({ setNumber: n, repMin: 12, repMax: 12, weight: 15 })) }, select: { id: true } });
      awes[w.id] = { curl: (await add(curl, 100)).id, barbell: (await add(barbell, 101)).id };
    }
    current.user = { id: user, role: "CLIENT", workspaceId: ws, clientProfileId: clientId };
  }, 120_000);

  afterAll(async () => {
    const { deleteGuestWorkspace } = await import("@/lib/guest-cleanup");
    if (ws) await deleteGuestWorkspace(ws, { ttlMs: 0, includeAthletes: true }).catch((e) => console.error("cleanup failed", e));
  }, 60_000);

  it("starts per hand, stores each set's choice, remembers the last one, and doubles only the weight lifted", async () => {
    const { getLoggerData, loadProgress } = await import("@/lib/athlete/data");
    const { saveSet } = await import("@/lib/actions/athlete");
    const { lastPerformanceFor } = await import("./last-time");
    const [w1, w2] = workouts;

    // Never logged: the catalog default. A barbell lift has no toggle.
    const first = (await getLoggerData(w1))!;
    const c1 = first.exercises.find((e) => e.exerciseId === curl)!;
    expect(c1.implements).toBe(2);
    expect(c1.sets.every((s) => s.implements === 2)).toBe(true);
    expect(first.exercises.find((e) => e.exerciseId === barbell)!.implements).toBeNull();

    // Set 1 per hand (sent); set 2 one bell (sent); the barbell set sends 2 and still stores nothing.
    await saveSet({ assignedWorkoutId: w1, aweId: awes[w1].curl, setNumber: 1, weight: 15, reps: 12, done: true, implements: 2 });
    await saveSet({ assignedWorkoutId: w1, aweId: awes[w1].curl, setNumber: 2, weight: 15, reps: 12, done: true, implements: 1 });
    await saveSet({ assignedWorkoutId: w1, aweId: awes[w1].barbell, setNumber: 1, weight: 50, reps: 10, done: true, implements: 2 });
    const stored = await prisma.setLog.findMany({ where: { workoutLog: { assignedWorkoutId: w1 } }, orderBy: [{ exerciseId: "asc" }, { setNumber: "asc" }], select: { exerciseId: true, setNumber: true, implements: true } });
    expect(stored.find((s) => s.exerciseId === curl && s.setNumber === 1)!.implements).toBe(2);
    expect(stored.find((s) => s.exerciseId === curl && s.setNumber === 2)!.implements).toBe(1);
    expect(stored.find((s) => s.exerciseId === barbell)!.implements).toBeNull();

    // An edit that doesn't say leaves it; a new set from an older page gets the default.
    await saveSet({ assignedWorkoutId: w1, aweId: awes[w1].curl, setNumber: 2, weight: 15, reps: 11, done: true });
    expect((await prisma.setLog.findFirstOrThrow({ where: { exerciseId: curl, setNumber: 2 }, select: { implements: true } })).implements).toBe(1);

    // The next workout: the last choice (one bell, set 2) is the default, in both loggers' reads.
    const next = (await getLoggerData(w2))!;
    const c2 = next.exercises.find((e) => e.exerciseId === curl)!;
    expect(c2.implements).toBe(1);
    expect(c2.sets.every((s) => s.implements === 1 && !s.done)).toBe(true);
    const coach = await lastPerformanceFor({ clientId, exerciseIds: [curl, barbell], excludeAssignedWorkoutId: w2 });
    expect(coach.implements.get(curl)).toBe(1);
    expect(coach.implements.has(barbell)).toBe(false);
    expect(coach.sets.get(curl)).toHaveLength(2);

    // A newer set not recorded (null) is skipped: the choice before it still stands.
    const log = await prisma.workoutLog.findFirstOrThrow({ where: { assignedWorkoutId: w1 }, select: { id: true } });
    await prisma.setLog.create({ data: { workoutLogId: log.id, exerciseId: curl, setNumber: 9, weight: 15, reps: 12, completed: true, implements: null } });
    expect((await lastPerformanceFor({ clientId, exerciseIds: [curl], excludeAssignedWorkoutId: w2 })).implements.get(curl)).toBe(1);
    expect((await getLoggerData(w2))!.exercises.find((e) => e.exerciseId === curl)!.implements).toBe(1);

    // Weight lifted: 15 × 12 × 2 + 15 × 11 + 15 × 12 (not recorded: one) + 50 × 10. The chart stays per bell.
    const progress = await loadProgress({ clientId, workspaceId: ws, plan: null, selfServe: true, timeZone: "UTC" });
    expect(progress.totals.volume).toBe(360 + 165 + 180 + 500);
    const series = progress.exercises.find((e) => e.exerciseId === curl)!.series;
    expect(series[series.length - 1]).toMatchObject({ weight: 15, volume: 180 + 165 + 180 });
  }, 60_000);
});
