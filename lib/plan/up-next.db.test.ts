/**
 * Up next after a finish: the earliest workout still to do, by date. A plan imported week by week numbers each week's
 * days from 1 ("Day 1", "Day 2"…), so ordering by that number first put every week's Day 1 ahead of week 1's Day 2: after
 * finishing week 1's Day 1, Today and Plan showed week 2's Day 1 (the same name) as up next.
 *   set -a; . ./.env.local; set +a; ATLAS_DB_TEST=1 npx vitest run lib/plan/up-next.db.test.ts
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const current = vi.hoisted(() => ({ user: null as null | Record<string, unknown> }));
vi.mock("@/lib/auth", () => ({ auth: async () => (current.user ? { user: current.user } : null) }));
vi.mock("next/cache", () => ({ revalidatePath: () => {}, revalidateTag: () => {} }));
vi.mock("next/headers", () => ({ headers: () => new Headers(), cookies: () => ({ get: () => undefined }) }));
vi.mock("react", async (orig) => ({ ...(await orig<typeof import("react")>()), cache: <T,>(fn: T) => fn }));

describe.skipIf(!process.env.ATLAS_DB_TEST)("up next after finishing a workout", () => {
  let prisma: typeof import("@/lib/db/client").prisma;
  let ws = "";
  let clientId = "";
  const tag = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

  beforeAll(async () => {
    ({ prisma } = await import("@/lib/db/client"));
    ws = (await prisma.workspace.create({ data: { name: "up next test" }, select: { id: true } })).id;
    const user = await prisma.user.create({ data: { email: `${tag}-athlete@guest.atlas.app`, name: "Sam", role: "CLIENT", workspaceId: ws }, select: { id: true } });
    clientId = (await prisma.clientProfile.create({ data: { workspaceId: ws, userId: user.id, fullName: "Sam", status: "ACTIVE", goalTargets: { athlete: { demo: false } } }, select: { id: true } })).id;
    current.user = { id: user.id, role: "CLIENT", workspaceId: ws, clientProfileId: clientId };
    // An imported plan: two weeks, "Day 1" and "Day 2" each week (each week's days numbered from 1).
    const { saveSheetPlan } = await import("@/lib/programs/save-sheet-plan");
    const days = ["Day 1 · Upper", "Day 2 · Lower"].map((name, i) => ({ name, exercises: [{ name: i ? "Back Squat" : "Bench Press", weeks: [{ week: 1, setsReps: "3x5", load: "" }, { week: 2, setsReps: "3x5", load: "" }] }] }));
    await saveSheetPlan({ workspaceId: ws, clientId, grid: { days }, name: "Two weeks", goals: [], history: false, status: "ACTIVE", weekOneStart: new Date() } as never);
  }, 120_000);

  afterAll(async () => {
    const { deleteGuestWorkspace } = await import("@/lib/guest-cleanup");
    if (ws) await deleteGuestWorkspace(ws, { ttlMs: 0, includeAthletes: true }).catch((e) => console.error("cleanup failed", e));
  }, 60_000);

  it("finishing week 1's Day 1 makes week 1's Day 2 up next, not week 2's Day 1", async () => {
    const { loadPlanOverview } = await import("./overview");
    const first = (await loadPlanOverview({ clientId, workspaceId: ws }))!;
    expect(first.nextUp).toMatchObject({ name: "Day 1 · Upper", week: 1 });
    const w = first.nextUp!;
    const { saveSet, finishWorkout } = await import("@/lib/actions/athlete");
    await saveSet({ assignedWorkoutId: w.id, aweId: w.exercises[0].aweId, setNumber: 1, weight: 135, reps: 5, done: true });
    await finishWorkout({ assignedWorkoutId: w.id, durationMin: 40 });
    const after = (await loadPlanOverview({ clientId, workspaceId: ws }))!;
    expect(after.workouts.find((x) => x.id === w.id)?.status).toBe("LOGGED");
    expect(after.nextUp).toMatchObject({ name: "Day 2 · Lower", week: 1 });
    // The plan's workouts are in date order.
    const dates = after.workouts.map((x) => x.date);
    expect(dates).toEqual([...dates].sort());
  }, 120_000);
});
