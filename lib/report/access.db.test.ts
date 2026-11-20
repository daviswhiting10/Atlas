/**
 * Who can open a progress report: an athlete their own and nobody else's (even inside the same
 * workspace), a coach every client's in their workspace, and no one anything outside it.
 *
 * Runs against a dev database only:
 *   set -a; . ./.env.local; set +a; ATLAS_DB_TEST=1 npx vitest run lib/report/access.db.test.ts
 * It makes its own workspace (a coach and two athletes, each with a plan and sessions in two weeks of
 * a finished block) and removes it afterwards.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("react", async (orig) => ({ ...(await orig<typeof import("react")>()), cache: <T,>(fn: T) => fn }));

const RUN = !!process.env.ATLAS_DB_TEST;
const DAY = 86_400_000;

describe.skipIf(!RUN)("progress report access", () => {
  let prisma: typeof import("@/lib/db/client").prisma;
  let load: typeof import("./load");
  let ws = "";
  const tz = "UTC";
  const A = { client: "", assignment: "" };
  const B = { client: "", assignment: "" };

  async function athlete(label: string, startDate: Date) {
    const { createPlanForClient } = await import("@/lib/plan/persist");
    const { DEMO_PREFS } = await import("@/lib/guest");
    const user = await prisma.user.create({ data: { email: `${Date.now().toString(36)}-${label}@guest.atlas.app`, name: label, role: "CLIENT", workspaceId: ws, emailVerified: new Date() }, select: { id: true } });
    const profile = await prisma.clientProfile.create({ data: { workspaceId: ws, userId: user.id, fullName: `Report test ${label}`, status: "ACTIVE" } });
    const made = await createPlanForClient({ workspaceId: ws, clientId: profile.id, prefs: DEMO_PREFS, startDate });
    // One finished session in week 1 and one in week 2, so the block has two weeks of data.
    const workouts = await prisma.assignedWorkout.findMany({ where: { programAssignmentId: made.assignmentId }, orderBy: { scheduledDate: "asc" }, select: { id: true, scheduledDate: true, exercises: { select: { id: true, exerciseId: true }, take: 1 } } });
    for (const [week, reps] of [[0, 8], [1, 10]] as const) {
      const w = workouts.find((x) => Math.floor((x.scheduledDate.getTime() - startDate.getTime()) / DAY / 7) === week);
      if (!w || !w.exercises[0]) throw new Error("the plan has no workout in that week");
      const log = await prisma.workoutLog.create({ data: { clientId: profile.id, assignedWorkoutId: w.id, source: "GENERATED", date: w.scheduledDate, completedAt: w.scheduledDate }, select: { id: true } });
      await prisma.setLog.create({ data: { workoutLogId: log.id, exerciseId: w.exercises[0].exerciseId, assignedWorkoutExerciseId: w.exercises[0].id, setNumber: 1, weight: 100, reps, completed: true } });
    }
    return { client: profile.id, assignment: made.assignmentId };
  }

  beforeAll(async () => {
    ({ prisma } = await import("@/lib/db/client"));
    load = await import("./load");
    ws = (await prisma.workspace.create({ data: { name: "report-access test workspace" }, select: { id: true } })).id;
    await prisma.user.create({ data: { email: `${Date.now().toString(36)}-coach@guest.atlas.app`, name: "Coach", role: "TRAINER", workspaceId: ws, emailVerified: new Date() } });
    // Started 40 days ago: block 1 ended 13 days ago.
    const start = new Date(Math.floor((Date.now() - 40 * DAY) / DAY) * DAY);
    Object.assign(A, await athlete("a", start));
    Object.assign(B, await athlete("b", start));
  }, 120_000);

  afterAll(async () => {
    const { deleteGuestWorkspace } = await import("@/lib/guest-cleanup");
    if (ws) await deleteGuestWorkspace(ws, { ttlMs: 0, includeAthletes: true }).catch((e) => console.error("cleanup of the test workspace failed", e));
  }, 60_000);

  const as = (who: { client: string } | null, role = "CLIENT", workspaceId = ws) => ({ role, workspaceId, clientProfileId: who?.client });
  const open = (plan: { assignment: string }, viewer: ReturnType<typeof as>) => load.loadReport({ assignmentId: plan.assignment, block: 1, viewer, timeZone: tz });

  it("an athlete can open their own report", async () => {
    const r = await open(A, as(A));
    expect(r).not.toBeNull();
    expect(r?.sessions).toBe(2);
    expect(await open(B, as(B))).not.toBeNull();
  });

  it("an athlete cannot open another athlete's report in the same workspace", async () => {
    expect(await open(B, as(A))).toBeNull();
    expect(await open(A, as(B))).toBeNull();
  });

  it("an athlete's list holds only their own", async () => {
    const mine = await load.listReports(A.client, ws, tz);
    expect(mine.map((e) => e.assignmentId)).toEqual([A.assignment]);
  });

  it("a coach can open both", async () => {
    expect(await open(A, as(null, "TRAINER"))).not.toBeNull();
    expect(await open(B, as(null, "TRAINER"))).not.toBeNull();
  });

  it("nobody outside the workspace can open either", async () => {
    const other = "not-this-workspace";
    expect(await open(A, as(null, "TRAINER", other))).toBeNull();
    expect(await open(A, as(A, "CLIENT", other))).toBeNull();
  });

  it("an athlete session with no client profile opens nothing", async () => {
    expect(await open(A, as(null, "CLIENT"))).toBeNull();
  });
});
