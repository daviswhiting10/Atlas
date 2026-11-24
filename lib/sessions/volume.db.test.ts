/**
 * Rehearsal on a real database (a throwaway athlete): a weighted carry never counts as weight × seconds, and sets added
 * mid-session (an extra set, a whole added exercise) count toward the lb total and the work units.
 *   set -a; . ./.env.local; set +a; ATLAS_DB_TEST=1 npx vitest run lib/sessions/volume.db.test.ts
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const current = vi.hoisted(() => ({ user: null as null | Record<string, unknown> }));
vi.mock("@/lib/auth", () => ({ auth: async () => (current.user ? { user: current.user } : null) }));
vi.mock("next/cache", () => ({ revalidatePath: () => {}, revalidateTag: () => {}, unstable_cache: <T,>(fn: T) => fn }));
vi.mock("next/headers", () => ({ headers: () => new Headers(), cookies: () => ({ get: () => undefined }) }));
vi.mock("react", async (orig) => ({ ...(await orig<typeof import("react")>()), cache: <T,>(fn: T) => fn }));

const DAY = 86_400_000;

describe.skipIf(!process.env.ATLAS_DB_TEST)("a weighted carry is not weight lifted", () => {
  let prisma: typeof import("@/lib/db/client").prisma;
  let ws = "";
  let athleteUser = "";
  let clientId = "";
  let workoutId = "";
  const tag = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

  beforeAll(async () => {
    ({ prisma } = await import("@/lib/db/client"));
    const { createPlanForClient } = await import("@/lib/plan/persist");
    const { DEMO_PREFS } = await import("@/lib/guest");
    ws = (await prisma.workspace.create({ data: { name: "volume test" }, select: { id: true } })).id;
    athleteUser = (await prisma.user.create({ data: { email: `${tag}-sam@guest.atlas.app`, name: "Sam", role: "CLIENT", workspaceId: ws }, select: { id: true } })).id;
    // An athlete running their own plan, so they can add exercises to it mid-session.
    clientId = (
      await prisma.clientProfile.create({
        data: { workspaceId: ws, userId: athleteUser, fullName: "Sam Lee", status: "ACTIVE", goalTargets: { athlete: { prefs: DEMO_PREFS, demo: false } } },
        select: { id: true },
      })
    ).id;
    await createPlanForClient({ workspaceId: ws, clientId, prefs: DEMO_PREFS, startDate: new Date(Date.now() - 7 * DAY) });
    workoutId = (await prisma.assignedWorkout.findFirstOrThrow({ where: { programAssignment: { clientId } }, orderBy: { order: "asc" }, select: { id: true } })).id;
    current.user = { id: athleteUser, role: "CLIENT", workspaceId: ws, clientProfileId: clientId };
  }, 120_000);

  afterAll(async () => {
    const { deleteGuestWorkspace } = await import("@/lib/guest-cleanup");
    if (ws) await deleteGuestWorkspace(ws, { ttlMs: 0, includeAthletes: true }).catch((e) => console.error("cleanup failed", e));
  }, 60_000);

  it("the done screen, progress totals and the heatmap leave the carry's weight × seconds out", async () => {
    const { CATALOG, CATALOG_BY_SLUG } = await import("@/lib/plan/catalog");
    const { getLoggerData, loadProgress } = await import("@/lib/athlete/data");
    const { planAddExercise, saveSet, finishWorkout } = await import("@/lib/actions/athlete");
    const { loggedVolume } = await import("./volume");
    const { loadCalendar } = await import("@/lib/history/load");

    const before = (await getLoggerData(workoutId))!;
    const lift = before.exercises.find((e) => e.unit === "reps" && e.loaded && CATALOG_BY_SLUG[e.slug ?? ""]?.tool !== "bodyweight");
    expect(lift).toBeDefined();
    // Added mid-session: a weighted carry, and a rep exercise that wasn't in the workout.
    const taken = new Set(before.exercises.map((e) => e.slug));
    const extra = CATALOG.find((c) => c.unit !== "secs" && c.tool !== "bodyweight" && c.inc > 0 && !taken.has(c.slug) && c.slug !== "farmer-s-walk")!;
    expect((await planAddExercise({ workoutId, slug: "farmer-s-walk" })).ok).toBe(true);
    expect((await planAddExercise({ workoutId, slug: extra.slug })).ok).toBe(true);
    const added = (await getLoggerData(workoutId))!;
    const carry = added.exercises.find((e) => e.slug === "farmer-s-walk")!;
    const curl = added.exercises.find((e) => e.slug === extra.slug)!;
    expect(carry.unit).toBe("secs");

    // The lift: its prescribed sets plus one more, 100 × 8. The added exercise: 2 × 30 × 12. The carry: 60 lb for 45 s.
    const liftSets = lift!.sets.length + 1;
    for (let n = 1; n <= liftSets; n++) await saveSet({ assignedWorkoutId: workoutId, aweId: lift!.aweId, setNumber: n, weight: 100, reps: 8, done: true });
    for (let n = 1; n <= 2; n++) await saveSet({ assignedWorkoutId: workoutId, aweId: curl.aweId, setNumber: n, weight: 30, reps: 12, done: true });
    await saveSet({ assignedWorkoutId: workoutId, aweId: carry.aweId, setNumber: 1, weight: 60, reps: 45, done: true });
    await finishWorkout({ assignedWorkoutId: workoutId, durationMin: 40 });

    const lb = liftSets * 800 + 2 * 360;
    // The done screen's lb total, from the logger's data the way the screen adds it up.
    const done = (await getLoggerData(workoutId))!;
    expect(Math.round(loggedVolume(done.exercises.map((e) => ({ unit: e.unit, sets: e.sets }))))).toBe(lb);
    // Progress totals.
    const progress = await loadProgress({ clientId, workspaceId: ws, plan: null, selfServe: true, timeZone: "UTC" });
    expect(progress.totals.volume).toBe(lb);
    // The heatmap: the extra set and the added exercise count as sets; the carry by its 45 s only.
    const calendar = await loadCalendar({ clientId, workspaceId: ws, timeZone: "UTC", viewer: { kind: "athlete" } });
    expect(calendar.kind).toBe("thin");
    if (calendar.kind !== "thin") return;
    expect(calendar.first.work.sets).toBe(liftSets + 2);
    expect(calendar.first.work.units).toBeCloseTo(liftSets + 2 + 0.75 / 3, 5);
  }, 180_000);
});
