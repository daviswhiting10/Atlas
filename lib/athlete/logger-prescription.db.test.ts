/**
 * What the coach wrote per set reaches the athlete: each set starts at its own weight, carries its RPE, rest
 * and note, and the exercise's note comes with it. The Plan tab shows the weight across the sets.
 *
 * Runs against a dev database only:
 *   set -a; . ./.env.local; set +a; ATLAS_DB_TEST=1 npx vitest run lib/athlete/logger-prescription.db.test.ts
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const current = vi.hoisted(() => ({ user: null as null | Record<string, unknown> }));
vi.mock("@/lib/auth", () => ({ auth: async () => (current.user ? { user: current.user } : null) }));
vi.mock("next/cache", () => ({ revalidatePath: () => {}, revalidateTag: () => {} }));
vi.mock("next/headers", () => ({ headers: () => new Headers(), cookies: () => ({ get: () => undefined }) }));
vi.mock("next/navigation", () => ({ redirect: () => { throw new Error("redirect"); } }));
vi.mock("react", async (orig) => ({ ...(await orig<typeof import("react")>()), cache: <T,>(fn: T) => fn }));

const RUN = !!process.env.ATLAS_DB_TEST;

describe.skipIf(!RUN)("per-set prescriptions reach the athlete", () => {
  let prisma: typeof import("@/lib/db/client").prisma;
  let ws = "";
  let clientId = "";
  let workoutId = "";

  beforeAll(async () => {
    ({ prisma } = await import("@/lib/db/client"));
    const { createPlanForClient } = await import("@/lib/plan/persist");
    const { DEMO_PREFS } = await import("@/lib/guest");
    ws = (await prisma.workspace.create({ data: { name: "prescription test workspace" }, select: { id: true } })).id;
    const user = await prisma.user.create({ data: { email: `${Date.now().toString(36)}-rx@guest.atlas.app`, name: "Rx", role: "CLIENT", workspaceId: ws, emailVerified: new Date() }, select: { id: true } });
    clientId = (await prisma.clientProfile.create({ data: { workspaceId: ws, userId: user.id, fullName: "Rx test", status: "ACTIVE" } })).id; // coached: no athlete marker
    const made = await createPlanForClient({ workspaceId: ws, clientId, prefs: DEMO_PREFS, startDate: new Date() });
    workoutId = made.workouts[0].id;
    const first = await prisma.assignedWorkoutExercise.findFirstOrThrow({ where: { assignedWorkoutId: workoutId }, orderBy: { order: "asc" } });
    const sets = [0, 1, 2].map((i) => ({ setNumber: i + 1, weight: 95 + i * 10, repMin: 6, repMax: 10, rpe: 7 + i, restSeconds: 120, notes: i === 0 ? "Slow on the way down" : "" }));
    await prisma.assignedWorkoutExercise.update({ where: { id: first.id }, data: { prescribedSets: sets as never, notes: "Brace before each rep." } });
    current.user = { id: user.id, role: "CLIENT", workspaceId: ws, clientProfileId: clientId, name: "Rx" };
  }, 120_000);

  afterAll(async () => {
    const { deleteGuestWorkspace } = await import("@/lib/guest-cleanup");
    if (ws) await deleteGuestWorkspace(ws, { ttlMs: 0, includeAthletes: true }).catch((e) => console.error("cleanup failed", e));
  }, 60_000);

  it("the logger starts each set at its own weight, with its RPE, rest and note", async () => {
    const { getLoggerData } = await import("./data");
    const data = await getLoggerData(workoutId);
    const ex = data!.exercises[0];
    expect(ex.sets.map((s) => s.weight)).toEqual([95, 105, 115]);
    expect(ex.sets.map((s) => s.plan?.rpe)).toEqual([7, 8, 9]);
    expect(ex.sets.map((s) => s.plan?.rest)).toEqual([120, 120, 120]);
    expect(ex.sets[0].plan?.note).toBe("Slow on the way down");
    expect(ex.sets[1].plan?.note).toBeNull();
    expect(ex.note).toBe("Brace before each rep.");
  });

  it("the Plan tab shows the weight across the sets, the RPE, the rest and the note", async () => {
    const { loadPlanOverview } = await import("@/lib/plan/overview");
    const plan = await loadPlanOverview({ clientId, workspaceId: ws });
    const e = plan!.workouts[0].exercises[0];
    expect(e).toMatchObject({ weightLabel: "95–115 lb", rpe: "7–9", rest: "2:00", note: "Brace before each rep." });
  });
});
