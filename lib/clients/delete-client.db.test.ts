/**
 * Deleting a client for good, against a dev database (never production), so the foreign keys are the real ones:
 *   set -a; . ./.env.local; set +a; ATLAS_DB_TEST=1 npx vitest run lib/clients/delete-client.db.test.ts
 * It makes its own demo workspace (a coach with clients who have months of history), and removes it afterwards.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/guest-cleanup", async (orig) => ({ ...(await orig<typeof import("@/lib/guest-cleanup")>()), cleanupAfterResponse: vi.fn() }));

const RUN = !!process.env.ATLAS_DB_TEST;

describe.skipIf(!RUN)("delete a client completely (dev database)", () => {
  let prisma: typeof import("@/lib/db/client").prisma;
  let del: typeof import("./delete-client");
  let workspaceId = "";
  let guestCoachId = "";
  let coachId = "";
  let otherWs = "";

  /** Every row a client owns, by table. */
  async function rowsOf(clientId: string) {
    return {
      ClientProfile: await prisma.clientProfile.count({ where: { id: clientId } }),
      WorkoutLog: await prisma.workoutLog.count({ where: { clientId } }),
      SetLog: await prisma.setLog.count({ where: { workoutLog: { clientId } } }),
      ProgramAssignment: await prisma.programAssignment.count({ where: { clientId } }),
      AssignedWorkout: await prisma.assignedWorkout.count({ where: { programAssignment: { clientId } } }),
      Goal: await prisma.goal.count({ where: { clientId } }),
      Milestone: await prisma.milestone.count({ where: { clientId } }),
    };
  }

  beforeAll(async () => {
    ({ prisma } = await import("@/lib/db/client"));
    del = await import("./delete-client");
    const { createDemo } = await import("@/lib/guest");
    const { randomUUID } = await import("crypto");
    const demo = await createDemo(`${randomUUID()}@guest.atlas.app`);
    workspaceId = demo.workspaceId;
    guestCoachId = (await prisma.user.findFirstOrThrow({ where: { workspaceId, role: "TRAINER" }, select: { id: true } })).id;
    // A real (non-guest) coach in the same workspace, to delete as.
    coachId = (await prisma.user.create({ data: { email: `qa-del-coach-${randomUUID()}@example.test`, role: "TRAINER", workspaceId }, select: { id: true } })).id;
    otherWs = (await prisma.workspace.create({ data: { name: "QA delete test, other coach" } })).id;
  }, 120_000);

  afterAll(async () => {
    if (!prisma) return;
    await prisma.user.deleteMany({ where: { id: coachId } });
    const { deleteGuestWorkspace } = await import("@/lib/guest-cleanup");
    await deleteGuestWorkspace(workspaceId, { ttlMs: 0, includeAthletes: true }).catch((e) => console.error("cleanup", e));
    await prisma.workspace.deleteMany({ where: { id: otherWs } });
  }, 120_000);

  it("deletes one client and everything under her, her login too, and leaves every other client exactly as it was", async () => {
    const clients = await prisma.clientProfile.findMany({ where: { workspaceId, userId: null }, select: { id: true, fullName: true }, orderBy: { fullName: "asc" } });
    const [target, ...others] = clients;
    expect(others.length).toBeGreaterThan(0);
    const before = await rowsOf(target.id);
    expect(before.WorkoutLog).toBeGreaterThan(0);
    expect(before.SetLog).toBeGreaterThan(0);
    // Give her a login and a pending code, the way an invited client has.
    const login = await prisma.user.create({ data: { email: `qa-del-client-${target.id}@example.test`, role: "CLIENT", workspaceId }, select: { id: true, email: true } });
    await prisma.clientProfile.update({ where: { id: target.id }, data: { userId: login.id } });
    await prisma.verificationToken.create({ data: { identifier: `code:${login.email}`, token: "x".repeat(64), expires: new Date(Date.now() + 60_000) } });
    const othersBefore = await Promise.all(others.map((o) => rowsOf(o.id)));
    const programsBefore = await prisma.program.count({ where: { workspaceId } });

    // The confirm sheet's numbers.
    expect(await del.clientDeletePreview(target.id, workspaceId, coachId)).toEqual({ ok: true, name: target.fullName, sessions: before.WorkoutLog, login: login.email });

    // A dry run deletes nothing.
    const dry = await del.deleteClientCompletely(target.id, workspaceId, coachId, { dryRun: true });
    expect(dry.ok && dry.deleted.SetLog).toBe(before.SetLog);
    expect(await rowsOf(target.id)).toEqual(before);

    // The real thing.
    const res = await del.deleteClientCompletely(target.id, workspaceId, coachId);
    expect(res).toMatchObject({ ok: true, deleted: { ClientProfile: 1, User: 1, WorkoutLog: before.WorkoutLog, SetLog: before.SetLog, ProgramAssignment: before.ProgramAssignment, VerificationToken: 1 } });
    expect(await rowsOf(target.id)).toEqual({ ClientProfile: 0, WorkoutLog: 0, SetLog: 0, ProgramAssignment: 0, AssignedWorkout: 0, Goal: 0, Milestone: 0 });
    expect(await prisma.user.count({ where: { id: login.id } })).toBe(0);
    expect(await Promise.all(others.map((o) => rowsOf(o.id)))).toEqual(othersBefore);
    expect(await prisma.program.count({ where: { workspaceId } })).toBe(programsBefore); // the library stays
  }, 120_000);

  it("refuses: a demo guest asking, the coach's own training, and another coach's client", async () => {
    const someone = await prisma.clientProfile.findFirstOrThrow({ where: { workspaceId, userId: null }, select: { id: true } });
    expect(await del.deleteClientCompletely(someone.id, workspaceId, guestCoachId)).toMatchObject({ ok: false, status: 403 });
    expect(await del.deleteClientCompletely(someone.id, otherWs, coachId)).toMatchObject({ ok: false, status: 404 });
    // The coach's own training profile is linked to the coach's login.
    const own = await prisma.clientProfile.create({ data: { workspaceId, fullName: "Me", userId: coachId }, select: { id: true } });
    expect(await del.deleteClientCompletely(own.id, workspaceId, coachId)).toMatchObject({ ok: false, status: 403 });
    expect(await prisma.user.count({ where: { id: coachId } })).toBe(1);
    await prisma.clientProfile.delete({ where: { id: own.id } });
    expect(await prisma.clientProfile.count({ where: { id: someone.id } })).toBe(1);
  }, 120_000);
});
