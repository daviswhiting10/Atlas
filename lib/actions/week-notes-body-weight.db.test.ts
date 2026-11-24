/**
 * Week notes (a coach writes, the plan carries them) and body weight (an athlete adds one; Progress reads it).
 *   set -a; . ./.env.local; set +a; ATLAS_DB_TEST=1 npx vitest run lib/actions/week-notes-body-weight.db.test.ts
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const current = vi.hoisted(() => ({ user: null as null | Record<string, unknown> }));
vi.mock("@/lib/auth", () => ({ auth: async () => (current.user ? { user: current.user } : null) }));
vi.mock("next/cache", () => ({ revalidatePath: () => {}, revalidateTag: () => {} }));
vi.mock("next/headers", () => ({ headers: () => new Headers(), cookies: () => ({ get: () => undefined }) }));
vi.mock("react", async (orig) => ({ ...(await orig<typeof import("react")>()), cache: <T,>(fn: T) => fn }));

describe.skipIf(!process.env.ATLAS_DB_TEST)("week notes and body weight", () => {
  let prisma: typeof import("@/lib/db/client").prisma;
  let ws = "";
  let coachId = "";
  let clientId = "";
  let clientUserId = "";
  let planId = "";
  const tag = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

  beforeAll(async () => {
    ({ prisma } = await import("@/lib/db/client"));
    const { createPlanForClient } = await import("@/lib/plan/persist");
    const { DEMO_PREFS } = await import("@/lib/guest");
    ws = (await prisma.workspace.create({ data: { name: "week notes test" }, select: { id: true } })).id;
    coachId = (await prisma.user.create({ data: { email: `${tag}-coach@guest.atlas.app`, name: "Jess Rivera", role: "TRAINER", workspaceId: ws }, select: { id: true } })).id;
    clientUserId = (await prisma.user.create({ data: { email: `${tag}-alex@guest.atlas.app`, name: "Alex", role: "CLIENT", workspaceId: ws }, select: { id: true } })).id;
    clientId = (await prisma.clientProfile.create({ data: { workspaceId: ws, userId: clientUserId, fullName: "Alex", status: "ACTIVE" }, select: { id: true } })).id;
    await createPlanForClient({ workspaceId: ws, clientId, prefs: DEMO_PREFS, startDate: new Date() });
    planId = (await prisma.programAssignment.findFirstOrThrow({ where: { clientId, status: "ACTIVE" }, select: { id: true } })).id;
  }, 120_000);

  afterAll(async () => {
    const { deleteGuestWorkspace } = await import("@/lib/guest-cleanup");
    if (ws) {
      await prisma.measurement.deleteMany({ where: { workspaceId: ws } });
      await deleteGuestWorkspace(ws, { ttlMs: 0, includeAthletes: true }).catch((e) => console.error("cleanup failed", e));
    }
  }, 60_000);

  it("a coach pins a note to week 1, signed; the athlete's plan has it; empty clears it", async () => {
    current.user = { id: coachId, role: "TRAINER", workspaceId: ws, name: "Jess Rivera" };
    const { coachSetWeekNote } = await import("./coach-plan");
    expect(await coachSetWeekNote(clientId, planId, { week: 1, title: "Easy start", text: "Leave 3 reps in the tank." })).toEqual({ ok: true });
    const { loadPlanOverview } = await import("@/lib/plan/overview");
    const plan = (await loadPlanOverview({ clientId, workspaceId: ws }))!;
    expect(plan.weekNotes).toEqual([{ week: 1, title: "Easy start", text: "Leave 3 reps in the tank.", by: "Coach Jess" }]);
    expect(plan.currentWeek).toBe(1);
    expect(await coachSetWeekNote(clientId, planId, { week: 1, text: "" })).toEqual({ ok: true });
    expect((await loadPlanOverview({ clientId, workspaceId: ws }))!.weekNotes).toEqual([]);
  }, 60_000);

  it("a coach can't write on another workspace's plan; an athlete can't use the coach action", async () => {
    const { coachSetWeekNote } = await import("./coach-plan");
    current.user = { id: clientUserId, role: "CLIENT", workspaceId: ws, clientProfileId: clientId };
    expect(await coachSetWeekNote(clientId, planId, { week: 1, text: "x" })).toMatchObject({ ok: false });
    current.user = { id: coachId, role: "TRAINER", workspaceId: "ws_somewhere_else" };
    expect(await coachSetWeekNote(clientId, planId, { week: 1, text: "x" })).toMatchObject({ ok: false });
  }, 60_000);

  it("the athlete adds body weight; Progress reads it back in pounds; nonsense refused", async () => {
    current.user = { id: clientUserId, role: "CLIENT", workspaceId: ws, clientProfileId: clientId };
    const { addBodyWeight } = await import("./body-weight");
    expect(await addBodyWeight({ lb: 182.4 })).toEqual({ ok: true });
    expect(await addBodyWeight({ lb: 9 })).toMatchObject({ ok: false });
    expect(await addBodyWeight({ lb: "heavy" })).toMatchObject({ ok: false });
    const { loadBodyWeights } = await import("@/lib/athlete/body-weight-data");
    const points = await loadBodyWeights(clientId, ws, "UTC");
    expect(points).toHaveLength(1);
    expect(points[0].lb).toBe(182.4);
    const row = await prisma.measurement.findFirstOrThrow({ where: { clientId }, select: { source: true, enteredByUserId: true } });
    expect(row).toEqual({ source: "manual", enteredByUserId: clientUserId });
  }, 60_000);

  it("signed out: refused", async () => {
    current.user = null;
    const { addBodyWeight } = await import("./body-weight");
    expect(await addBodyWeight({ lb: 180 })).toMatchObject({ ok: false });
  });
});
