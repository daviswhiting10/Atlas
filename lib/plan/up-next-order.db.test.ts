/**
 * Up next is the earliest unlogged workout in plan order, whatever its date. Deleting a session puts its workout back,
 * and up next returns to it — on Today and Plan (the plan overview) and over MCP (get_active_program).
 *   set -a; . ./.env.local; set +a; ATLAS_DB_TEST=1 npx vitest run lib/plan/up-next-order.db.test.ts
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const current = vi.hoisted(() => ({ user: null as null | Record<string, unknown> }));
vi.mock("@/lib/auth", () => ({ auth: async () => (current.user ? { user: current.user } : null) }));
vi.mock("next/cache", () => ({ revalidatePath: () => {}, revalidateTag: () => {} }));
vi.mock("next/headers", () => ({ headers: () => new Headers(), cookies: () => ({ get: () => undefined }) }));
vi.mock("react", async (orig) => ({ ...(await orig<typeof import("react")>()), cache: <T,>(fn: T) => fn }));

const DAY = 86_400_000;
const midnight = (d: Date) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));

describe.skipIf(!process.env.ATLAS_DB_TEST)("up next in plan order, after a session is deleted", () => {
  let prisma: typeof import("@/lib/db/client").prisma;
  let ws = "";
  let coachId = "";
  let athleteUser = "";
  let clientId = "";
  let plan: Array<{ id: string; name: string; aweId: string }> = [];
  const tag = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const asCoach = () => (current.user = { id: coachId, role: "TRAINER", workspaceId: ws });
  const asAthlete = () => (current.user = { id: athleteUser, role: "CLIENT", workspaceId: ws, clientProfileId: clientId });

  /** The athlete logs one set of a workout and finishes it; returns the session's id. */
  async function logIt(i: number): Promise<string> {
    asAthlete();
    const { saveSet, finishWorkout } = await import("@/lib/actions/athlete");
    const r = await saveSet({ assignedWorkoutId: plan[i].id, aweId: plan[i].aweId, setNumber: 1, weight: 100, reps: 8, done: true });
    await finishWorkout({ assignedWorkoutId: plan[i].id, durationMin: 30 });
    return r.workoutLogId;
  }
  /** The coach deletes a session from the client page (DELETE /api/sessions/[id]). */
  async function deleteIt(logId: string) {
    asCoach();
    const { DELETE } = await import("@/app/api/sessions/[workoutLogId]/route");
    const res = await DELETE(new Request(`http://x/api/sessions/${logId}`, { method: "DELETE" }), { params: Promise.resolve({ workoutLogId: logId }) });
    expect(res.status).toBe(200);
  }
  /** Up next on Today and Plan, and over MCP. */
  async function upNext(): Promise<{ overview: string | null; mcp: string | null }> {
    const { loadPlanOverview } = await import("./overview");
    const o = await loadPlanOverview({ clientId, workspaceId: ws });
    const { getActiveProgram } = await import("@/lib/mcp/tools/programs");
    const client = { id: clientId, workspaceId: ws, fullName: "Sam Lee", primaryGoal: null, keyLiftIds: [], selfServe: false };
    const m = (await (getActiveProgram as unknown as { handler: (c: unknown, a: unknown) => Promise<unknown> }).handler({ client }, { clientId })) as {
      program: { nextWorkout: { assignedWorkoutId: string } | null } | null;
    };
    return { overview: o?.nextUp?.id ?? null, mcp: m.program?.nextWorkout?.assignedWorkoutId ?? null };
  }
  const idOf = (i: number) => ({ overview: plan[i].id, mcp: plan[i].id });

  beforeAll(async () => {
    ({ prisma } = await import("@/lib/db/client"));
    const { createPlanForClient } = await import("@/lib/plan/persist");
    const { DEMO_PREFS } = await import("@/lib/guest");
    ws = (await prisma.workspace.create({ data: { name: "up next order test" }, select: { id: true } })).id;
    coachId = (await prisma.user.create({ data: { email: `${tag}-coach@guest.atlas.app`, name: "Jess", role: "TRAINER", workspaceId: ws }, select: { id: true } })).id;
    athleteUser = (await prisma.user.create({ data: { email: `${tag}-sam@guest.atlas.app`, name: "Sam", role: "CLIENT", workspaceId: ws }, select: { id: true } })).id;
    clientId = (await prisma.clientProfile.create({ data: { workspaceId: ws, userId: athleteUser, fullName: "Sam Lee", status: "ACTIVE" }, select: { id: true } })).id;
    // Week 1 started last week.
    await createPlanForClient({ workspaceId: ws, clientId, prefs: DEMO_PREFS, startDate: new Date(Date.now() - 7 * DAY) });
    const rows = await prisma.assignedWorkout.findMany({
      where: { programAssignment: { clientId } },
      orderBy: { order: "asc" },
      select: { id: true, name: true, exercises: { orderBy: { order: "asc" }, take: 1, select: { id: true } } },
    });
    plan = rows.map((r) => ({ id: r.id, name: r.name, aweId: r.exercises[0].id }));
  }, 120_000);

  afterAll(async () => {
    const { deleteGuestWorkspace } = await import("@/lib/guest-cleanup");
    if (ws) await deleteGuestWorkspace(ws, { ttlMs: 0, includeAthletes: true }).catch((e) => console.error("cleanup failed", e));
  }, 60_000);

  it("(a) deleting Day 1, scheduled last week, makes Day 1 up next again", async () => {
    const first = await prisma.assignedWorkout.findUniqueOrThrow({ where: { id: plan[0].id }, select: { scheduledDate: true } });
    expect(first.scheduledDate.getTime()).toBeLessThan(midnight(new Date()).getTime() - 2 * DAY);
    const day1 = await logIt(0);
    await logIt(1);
    expect(await upNext()).toEqual(idOf(2));
    await deleteIt(day1);
    expect(await upNext()).toEqual(idOf(0));
    // Put it back for the next case.
    await logIt(0);
    expect(await upNext()).toEqual(idOf(2));
  }, 180_000);

  it("(b) deleting today's Day 3 makes Day 3 up next again", async () => {
    // Day 3 is today's workout.
    await prisma.assignedWorkout.update({ where: { id: plan[2].id }, data: { scheduledDate: midnight(new Date()) } });
    const day3 = await logIt(2);
    expect(await upNext()).toEqual(idOf(3));
    await deleteIt(day3);
    expect(await upNext()).toEqual(idOf(2));
  }, 180_000);

  it("plan order wins over dates: Day 4 moved to before Day 3's date is still after it", async () => {
    const d3 = await prisma.assignedWorkout.findUniqueOrThrow({ where: { id: plan[2].id }, select: { scheduledDate: true } });
    await prisma.assignedWorkout.update({ where: { id: plan[3].id }, data: { scheduledDate: new Date(d3.scheduledDate.getTime() - 3 * DAY) } });
    expect(await upNext()).toEqual(idOf(2));
  }, 60_000);
});
