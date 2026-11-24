/**
 * "Assign and invite": assigning a draft to a client who isn't invited yet also invites them (the same flow as the
 * Invite button); an invited client, or one with no email, is only assigned. A failed invite never undoes the assign.
 *
 * Runs against a dev database only:
 *   set -a; . ./.env.local; set +a; ATLAS_DB_TEST=1 npx vitest run lib/actions/assign-invite.db.test.ts
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const current = vi.hoisted(() => ({ user: null as null | Record<string, unknown> }));
vi.mock("@/lib/auth", () => ({ auth: async () => (current.user ? { user: current.user } : null) }));
vi.mock("next/cache", () => ({ revalidatePath: () => {}, revalidateTag: () => {} }));
vi.mock("next/headers", () => ({ headers: () => new Headers(), cookies: () => ({ get: () => undefined }) }));
vi.mock("react", async (orig) => ({ ...(await orig<typeof import("react")>()), cache: <T,>(fn: T) => fn }));

const RUN = !!process.env.ATLAS_DB_TEST;

describe.skipIf(!RUN)("assign and invite", () => {
  let prisma: typeof import("@/lib/db/client").prisma;
  let ws = "";
  const tag = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const mail = (who: string) => `${tag}-${who}@guest.atlas.app`;

  beforeAll(async () => {
    process.env.RESEND_API_KEY = ""; // never a real email from a test: the link comes back instead
    ({ prisma } = await import("@/lib/db/client"));
    ws = (await prisma.workspace.create({ data: { name: "assign-invite test" }, select: { id: true } })).id;
    const coach = await prisma.user.create({ data: { email: mail("coach"), name: "Coach", role: "TRAINER", workspaceId: ws, emailVerified: new Date() }, select: { id: true } });
    current.user = { id: coach.id, role: "TRAINER", workspaceId: ws, name: "Coach" };
  }, 60_000);

  afterAll(async () => {
    const { deleteGuestWorkspace } = await import("@/lib/guest-cleanup");
    if (ws) await deleteGuestWorkspace(ws, { ttlMs: 0, includeAthletes: true }).catch((e) => console.error("cleanup failed", e));
  }, 60_000);

  /** A client with a draft plan. */
  async function clientWithDraft(name: string, email: string | null, userId: string | null = null) {
    const { createPlanForClient } = await import("@/lib/plan/persist");
    const { DEMO_PREFS } = await import("@/lib/guest");
    const c = await prisma.clientProfile.create({ data: { workspaceId: ws, fullName: name, email, userId, status: "ACTIVE" }, select: { id: true } });
    await createPlanForClient({ workspaceId: ws, clientId: c.id, prefs: DEMO_PREFS, startDate: new Date(), draft: true });
    const draft = await prisma.programAssignment.findFirstOrThrow({ where: { clientId: c.id, status: "PAUSED" }, select: { id: true } });
    return { clientId: c.id, assignmentId: draft.id };
  }
  const today = new Date().toISOString().slice(0, 10);
  const live = (clientId: string) => prisma.programAssignment.count({ where: { clientId, status: "ACTIVE" } });

  it("a client who isn't invited: assigned and invited in one step (login, one-time link)", async () => {
    const { assignDraftPlan } = await import("./coach-plan");
    const a = await clientWithDraft("New Client", mail("new"));
    const r = await assignDraftPlan({ ...a, startDate: today, invite: true });
    expect(r).toMatchObject({ ok: true, invite: { sent: true, emailed: false } });
    expect(r.ok && r.invite?.sent && r.invite.link).toMatch(/\/invite\?token=[a-f0-9]{64}$/);
    expect(await live(a.clientId)).toBe(1);
    const profile = await prisma.clientProfile.findUniqueOrThrow({ where: { id: a.clientId }, select: { userId: true } });
    const user = await prisma.user.findUniqueOrThrow({ where: { id: profile.userId! }, select: { role: true, workspaceId: true, email: true } });
    expect(user).toEqual({ role: "CLIENT", workspaceId: ws, email: mail("new") });
    expect(await prisma.verificationToken.count({ where: { identifier: mail("new") } })).toBe(1);
  }, 120_000);

  it("a client who is already invited: only assigned, no new link", async () => {
    const { assignDraftPlan } = await import("./coach-plan");
    const u = await prisma.user.create({ data: { email: mail("invited"), name: "Invited", role: "CLIENT", workspaceId: ws }, select: { id: true } });
    const a = await clientWithDraft("Invited Client", mail("invited"), u.id);
    // Even if the page thought otherwise: the server checks.
    const r = await assignDraftPlan({ ...a, startDate: today, invite: true });
    expect(r).toEqual({ ok: true });
    expect(await live(a.clientId)).toBe(1);
    expect(await prisma.verificationToken.count({ where: { identifier: mail("invited") } })).toBe(0);
  }, 120_000);

  it("a client with no email: only assigned", async () => {
    const { assignDraftPlan } = await import("./coach-plan");
    const a = await clientWithDraft("No Email", null);
    expect(await assignDraftPlan({ ...a, startDate: today, invite: true })).toEqual({ ok: true });
    expect(await live(a.clientId)).toBe(1);
  }, 120_000);

  it("an email that belongs to another account: assigned, and told why the invite didn't go", async () => {
    const { assignDraftPlan } = await import("./coach-plan");
    await prisma.user.create({ data: { email: mail("taken"), name: "Someone", role: "TRAINER", workspaceId: ws } });
    const a = await clientWithDraft("Taken Email", mail("taken"));
    const r = await assignDraftPlan({ ...a, startDate: today, invite: true });
    expect(r).toMatchObject({ ok: true, invite: { sent: false, error: expect.stringMatching(/already belongs to another Atlas account/) } });
    expect(await live(a.clientId)).toBe(1);
    expect((await prisma.clientProfile.findUniqueOrThrow({ where: { id: a.clientId }, select: { userId: true } })).userId).toBeNull();
  }, 120_000);

  it("without invite (the plain button): assigned, nobody invited", async () => {
    const { assignDraftPlan } = await import("./coach-plan");
    const a = await clientWithDraft("Plain", mail("plain"));
    expect(await assignDraftPlan({ ...a, startDate: today })).toEqual({ ok: true });
    expect(await prisma.verificationToken.count({ where: { identifier: mail("plain") } })).toBe(0);
  }, 120_000);
});
