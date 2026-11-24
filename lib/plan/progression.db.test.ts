/**
 * Rehearsal of the rep-range rule on a real database (a throwaway athlete): a lift logged with every set at the top
 * holds after one session ("one more like that") and goes up only after the second.
 *   set -a; . ./.env.local; set +a; ATLAS_DB_TEST=1 npx vitest run lib/plan/progression.db.test.ts
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const current = vi.hoisted(() => ({ user: null as null | Record<string, unknown> }));
vi.mock("@/lib/auth", () => ({ auth: async () => (current.user ? { user: current.user } : null) }));
vi.mock("next/cache", () => ({ revalidatePath: () => {}, revalidateTag: () => {}, unstable_cache: <T,>(fn: T) => fn }));
vi.mock("next/headers", () => ({ headers: () => new Headers(), cookies: () => ({ get: () => undefined }) }));
vi.mock("react", async (orig) => ({ ...(await orig<typeof import("react")>()), cache: <T,>(fn: T) => fn }));

const DAY = 86_400_000;

describe.skipIf(!process.env.ATLAS_DB_TEST)("two sessions at the top before the weight goes up", () => {
  let prisma: typeof import("@/lib/db/client").prisma;
  let ws = "";
  let athleteUser = "";
  let clientId = "";
  const tag = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  // The same lift in three workouts: logged in the first two, the suggestion read on the third.
  let lift: { exerciseId: string; repMax: number; sets: number; first: { id: string; aweId: string }; second: { id: string; aweId: string }; target: string } | null = null;

  beforeAll(async () => {
    ({ prisma } = await import("@/lib/db/client"));
    const { createPlanForClient } = await import("@/lib/plan/persist");
    const { DEMO_PREFS } = await import("@/lib/guest");
    const { CATALOG_BY_SLUG } = await import("@/lib/plan/catalog");
    ws = (await prisma.workspace.create({ data: { name: "progression test" }, select: { id: true } })).id;
    athleteUser = (await prisma.user.create({ data: { email: `${tag}-sam@guest.atlas.app`, name: "Sam", role: "CLIENT", workspaceId: ws }, select: { id: true } })).id;
    clientId = (await prisma.clientProfile.create({ data: { workspaceId: ws, userId: athleteUser, fullName: "Sam Lee", status: "ACTIVE" }, select: { id: true } })).id;
    await createPlanForClient({ workspaceId: ws, clientId, prefs: DEMO_PREFS, startDate: new Date(Date.now() - 7 * DAY) });
    const awes = await prisma.assignedWorkoutExercise.findMany({
      where: { assignedWorkout: { programAssignment: { clientId } } },
      orderBy: [{ assignedWorkout: { order: "asc" } }, { order: "asc" }],
      select: { id: true, exerciseId: true, assignedWorkoutId: true, prescribedSets: true, exercise: { select: { slug: true } } },
    });
    const byExercise = new Map<string, typeof awes>();
    for (const a of awes) byExercise.set(a.exerciseId, [...(byExercise.get(a.exerciseId) ?? []), a]);
    for (const list of Array.from(byExercise.values())) {
      const cat = CATALOG_BY_SLUG[list[0].exercise.slug];
      const rx = (list[2]?.prescribedSets as Array<{ repMax?: number; unit?: string; weight?: number }> | undefined) ?? [];
      if (list.length < 3 || !cat || cat.tool === "bodyweight" || cat.unit === "secs" || !rx[0]?.repMax || rx[0].weight) continue;
      lift = {
        exerciseId: list[0].exerciseId,
        repMax: rx[0].repMax,
        sets: rx.length,
        first: { id: list[0].assignedWorkoutId, aweId: list[0].id },
        second: { id: list[1].assignedWorkoutId, aweId: list[1].id },
        target: list[2].assignedWorkoutId,
      };
      break;
    }
    current.user = { id: athleteUser, role: "CLIENT", workspaceId: ws, clientProfileId: clientId };
  }, 120_000);

  afterAll(async () => {
    const { deleteGuestWorkspace } = await import("@/lib/guest-cleanup");
    if (ws) await deleteGuestWorkspace(ws, { ttlMs: 0, includeAthletes: true }).catch((e) => console.error("cleanup failed", e));
  }, 60_000);

  async function logAtTop(w: { id: string; aweId: string }, weight: number) {
    const { saveSet, finishWorkout } = await import("@/lib/actions/athlete");
    for (let n = 1; n <= lift!.sets; n++) await saveSet({ assignedWorkoutId: w.id, aweId: w.aweId, setNumber: n, weight, reps: lift!.repMax, done: true });
    await finishWorkout({ assignedWorkoutId: w.id, durationMin: 40 });
  }
  async function suggestion() {
    const { getLoggerData } = await import("@/lib/athlete/data");
    const data = await getLoggerData(lift!.target);
    return data!.exercises.find((e) => e.exerciseId === lift!.exerciseId)!;
  }

  it("holds after one session at the top, and goes up after the second", async () => {
    expect(lift).not.toBeNull();
    await logAtTop(lift!.first, 100);
    const once = await suggestion();
    expect(once.target).toMatchObject({ kind: "hold", weight: 100, oneMore: true });
    expect(once.target.reason).toBe("One more session like that and you go up.");

    await logAtTop(lift!.second, 100);
    const twice = await suggestion();
    expect(twice.target.kind).toBe("add_weight");
    expect(twice.target.weight).toBe(100 + twice.increment);
  }, 180_000);
});
