/**
 * A coach's client keeps the plan as the coach wrote it: from the athlete app she can't add or remove
 * workouts and exercises, change targets or the lighter weeks, or overwrite the coach's notes. She can still swap an exercise.
 * Someone who makes their own plan can restructure it.
 *
 * Runs against a dev database only:
 *   set -a; . ./.env.local; set +a; ATLAS_DB_TEST=1 npx vitest run lib/actions/plan-guard.db.test.ts
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const current = vi.hoisted(() => ({ user: null as null | Record<string, unknown> }));
vi.mock("@/lib/auth", () => ({ auth: async () => (current.user ? { user: current.user } : null) }));
vi.mock("next/cache", () => ({ revalidatePath: () => {}, revalidateTag: () => {} }));
vi.mock("next/headers", () => ({ headers: () => new Headers(), cookies: () => ({ get: () => undefined }) }));
vi.mock("react", async (orig) => ({ ...(await orig<typeof import("react")>()), cache: <T,>(fn: T) => fn }));

const RUN = !!process.env.ATLAS_DB_TEST;

describe.skipIf(!RUN)("a coach's client can't restructure the plan", () => {
  let prisma: typeof import("@/lib/db/client").prisma;
  let ws = "";
  let clientId = "";
  let workoutId = "";
  let aweId = "";

  beforeAll(async () => {
    ({ prisma } = await import("@/lib/db/client"));
    const { createPlanForClient } = await import("@/lib/plan/persist");
    const { DEMO_PREFS } = await import("@/lib/guest");
    ws = (await prisma.workspace.create({ data: { name: "plan-guard test workspace" }, select: { id: true } })).id;
    const user = await prisma.user.create({ data: { email: `${Date.now().toString(36)}-guard@guest.atlas.app`, name: "Guard", role: "CLIENT", workspaceId: ws, emailVerified: new Date() }, select: { id: true } });
    // No `athlete` marker in goalTargets: the coach wrote this plan.
    clientId = (await prisma.clientProfile.create({ data: { workspaceId: ws, userId: user.id, fullName: "Guard test", status: "ACTIVE" } })).id;
    const made = await createPlanForClient({ workspaceId: ws, clientId, prefs: DEMO_PREFS, startDate: new Date() });
    workoutId = made.workouts[0].id;
    aweId = made.workouts[0].exercises[0].id;
    current.user = { id: user.id, role: "CLIENT", workspaceId: ws, clientProfileId: clientId, name: "Guard" };
  }, 120_000);

  afterAll(async () => {
    const { deleteGuestWorkspace } = await import("@/lib/guest-cleanup");
    if (ws) await deleteGuestWorkspace(ws, { ttlMs: 0, includeAthletes: true }).catch((e) => console.error("cleanup failed", e));
  }, 60_000);

  const count = () => prisma.assignedWorkoutExercise.count({ where: { assignedWorkoutId: workoutId } });

  it("refuses to remove, add or retarget, and changes nothing", async () => {
    const a = await import("./athlete");
    const before = await count();
    expect(await a.planRemoveExercise({ aweId, workoutId })).toMatchObject({ ok: false });
    expect(await a.planRemoveWorkout(workoutId)).toMatchObject({ ok: false });
    expect(await a.planAddWorkout({ week: 1, name: "Mine" })).toMatchObject({ ok: false });
    expect(await a.planSetTargets({ aweId, workoutId, sets: 9 })).toMatchObject({ ok: false });
    expect(await a.planSetLighterWeeks(false)).toMatchObject({ ok: false });
    expect(await count()).toBe(before);
    expect(await prisma.assignedWorkout.count({ where: { id: workoutId } })).toBe(1);
  });

  it("can't overwrite the coach's notes either", async () => {
    const a = await import("./athlete");
    expect(await a.planSetWorkoutNote({ workoutId, text: "Felt strong" })).toMatchObject({ ok: false });
    expect(await a.planSetNote("x")).toMatchObject({ ok: false });
  });

  it("someone who makes their own plan can restructure it", async () => {
    await prisma.clientProfile.update({ where: { id: clientId }, data: { goalTargets: { athlete: { demo: false } } } });
    const a = await import("./athlete");
    const before = await count();
    expect(await a.planRemoveExercise({ aweId, workoutId })).toMatchObject({ ok: true });
    expect(await count()).toBe(before - 1);
  });
});
