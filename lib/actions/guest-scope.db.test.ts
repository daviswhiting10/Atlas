/**
 * A guest (the demo coach, or a try-it athlete) calls every server action with
 * another workspace's ids: nothing in that workspace changes, nothing is read
 * from it, and no email is sent and no AI is called.
 *
 * Runs against a dev database only:
 *   set -a; . ./.env.local; set +a; ATLAS_DB_TEST=1 npx vitest run lib/actions/guest-scope.db.test.ts
 * It needs the QA workspace (users qa-w1-trainer@example.com / qa-w1-client@example.com).
 */
import { beforeAll, describe, expect, it, vi } from "vitest";

const current = vi.hoisted(() => ({ user: null as null | Record<string, unknown> }));
const sendEmail = vi.hoisted(() => vi.fn());
const aiCalls = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth", () => ({ auth: async () => (current.user ? { user: current.user } : null) }));
vi.mock("next/cache", () => ({ revalidatePath: () => {}, revalidateTag: () => {} }));
vi.mock("next/headers", () => ({ headers: () => new Headers({ "x-forwarded-for": "203.0.113.7" }), cookies: () => ({ get: () => undefined }) }));
vi.mock("next/navigation", () => ({ redirect: () => { throw new Error("redirect"); } }));
vi.mock("react", async (orig) => ({ ...(await orig<typeof import("react")>()), cache: <T,>(fn: T) => fn }));
vi.mock("@/lib/email", () => ({ sendEmail }));
vi.mock("@/lib/ai/client", () => new Proxy({}, { get: () => aiCalls }));

const RUN = !!process.env.ATLAS_DB_TEST;

describe.skipIf(!RUN)("a guest can't reach another workspace", () => {
  let prisma: typeof import("@/lib/db/client").prisma;
  let qa: { ws: string; client: string; assignment: string; workout: string; awe: string; exercise: string; program: string; log: string; fullName: string };
  const outcomes: Array<{ action: string; persona: string; outcome: string }> = [];

  async function fingerprint() {
    const w = { workspaceId: qa.ws };
    const rows = await Promise.all([
      prisma.programAssignment.findMany({ where: w, orderBy: { id: "asc" } }),
      prisma.assignedWorkout.findMany({ where: w, orderBy: { id: "asc" } }),
      prisma.assignedWorkoutExercise.findMany({ where: w, orderBy: { id: "asc" } }),
      prisma.program.findMany({ where: w, orderBy: { id: "asc" } }),
      prisma.clientProfile.findMany({ where: w, orderBy: { id: "asc" } }),
      prisma.workoutLog.findMany({ where: { clientId: qa.client }, orderBy: { id: "asc" } }),
      prisma.setLog.findMany({ where: { workoutLog: { clientId: qa.client } }, orderBy: { id: "asc" } }),
      prisma.exerciseMedia.findMany({ where: w, orderBy: { id: "asc" } }),
      prisma.exercise.findMany({ where: w, orderBy: { id: "asc" } }),
      prisma.goal.findMany({ where: { clientId: qa.client }, orderBy: { id: "asc" } }),
    ]);
    return JSON.stringify(rows);
  }

  beforeAll(async () => {
    ({ prisma } = await import("@/lib/db/client"));
    const { createPlanForClient } = await import("@/lib/plan/persist");
    const { DEMO_PREFS } = await import("@/lib/guest");
    const owner = await prisma.user.findUniqueOrThrow({ where: { email: "qa-w1-trainer@example.com" }, select: { workspaceId: true } });
    const ws = owner.workspaceId!;
    const profile = await prisma.clientProfile.findFirstOrThrow({ where: { workspaceId: ws, fullName: "QA Client" } });
    let a = await prisma.programAssignment.findFirst({ where: { workspaceId: ws, clientId: profile.id } });
    if (!a) {
      const made = await createPlanForClient({ workspaceId: ws, clientId: profile.id, prefs: DEMO_PREFS, startDate: new Date() });
      a = await prisma.programAssignment.findFirstOrThrow({ where: { id: made.assignmentId } });
    }
    const awe = await prisma.assignedWorkoutExercise.findFirstOrThrow({ where: { workspaceId: ws }, select: { id: true, exerciseId: true, assignedWorkoutId: true } });
    const log = await prisma.workoutLog.create({ data: { clientId: profile.id, assignedWorkoutId: awe.assignedWorkoutId, source: "GENERATED", date: new Date(), completedAt: new Date() }, select: { id: true } }).catch(() => null);
    qa = {
      ws, client: profile.id, assignment: a.id, workout: awe.assignedWorkoutId, awe: awe.id, exercise: awe.exerciseId, program: a.sourceProgramId, log: log?.id ?? "none", fullName: "QA Client",
    };
  }, 120_000);

  async function call(persona: string, action: string, fn: () => Promise<unknown>) {
    let outcome: string;
    let value: unknown;
    try {
      value = await fn();
      const v = value as { ok?: boolean } | null | undefined;
      outcome = v == null ? "returned nothing" : v.ok === false ? "refused (ok:false)" : Array.isArray(value) && value.length === 0 ? "returned empty" : v.ok === true ? "ALLOWED (ok:true)" : "returned a value";
    } catch (err) {
      outcome = `refused (threw: ${(err as Error).message.slice(0, 50)})`;
    }
    outcomes.push({ action, persona, outcome });
    // Never any of the other workspace's data in an answer.
    const text = JSON.stringify(value ?? null);
    expect(text, `${persona} ${action} leaked the other workspace`).not.toContain(qa.fullName);
    expect(text, `${persona} ${action} leaked the other workspace`).not.toContain(qa.client);
  }

  async function runAll(persona: "demo coach" | "guest athlete") {
    const coach = await import("./coach-plan");
    const athlete = await import("./athlete");
    const logger = await import("./workout-logger");
    const quick = await import("./quick-log");
    const intake = await import("./intake");
    const media = await import("./exercise-media");
    const library = await import("./library");
    const goals = await import("./goals");
    const account = await import("./account");
    const c = (a: string, fn: () => Promise<unknown>) => call(persona, a, fn);
    const day = "2026-11-19";
    const T = { sets: 1 };

    await c("coachAddWorkout", () => coach.coachAddWorkout(qa.client, qa.assignment, { week: 1, name: "x" }));
    await c("coachRemoveWorkout", () => coach.coachRemoveWorkout(qa.client, qa.assignment, qa.workout));
    await c("coachAddExercise", () => coach.coachAddExercise(qa.client, qa.assignment, { workoutId: qa.workout, exerciseId: qa.exercise, ...T }));
    await c("coachRemoveExercise", () => coach.coachRemoveExercise(qa.client, qa.assignment, { aweId: qa.awe, workoutId: qa.workout }));
    await c("coachSwapExercise", () => coach.coachSwapExercise(qa.client, qa.assignment, { aweId: qa.awe, workoutId: qa.workout, exerciseId: qa.exercise }));
    await c("coachSetTargets", () => coach.coachSetTargets(qa.client, qa.assignment, { aweId: qa.awe, workoutId: qa.workout, ...T }));
    await c("coachSetWorkoutNote", () => coach.coachSetWorkoutNote(qa.client, qa.assignment, { workoutId: qa.workout, text: "x" }));
    await c("coachSetPlanNote", () => coach.coachSetPlanNote(qa.client, qa.assignment, "x"));
    await c("coachSetLighterWeeks", () => coach.coachSetLighterWeeks(qa.client, qa.assignment, true));
    await c("generateDraftPlan", () => coach.generateDraftPlan({ clientId: qa.client, prefs: {}, startDate: day }));
    await c("draftFromTemplate", () => coach.draftFromTemplate({ programId: qa.program, clientId: qa.client, startDate: day }));
    await c("assignDraftPlan", () => coach.assignDraftPlan({ clientId: qa.client, assignmentId: qa.assignment, startDate: day }));
    await c("discardDraftPlan", () => coach.discardDraftPlan({ clientId: qa.client, assignmentId: qa.assignment }));
    await c("deletePlan", () => coach.deletePlan({ clientId: qa.client, assignmentId: qa.assignment }));
    await c("saveIntake", () => intake.saveIntake({ clientId: qa.client, goal: "muscle", notes: "x", programId: qa.program } as never));
    await c("setProgramCategory", () => library.setProgramCategory(qa.program, "strength"));
    await c("saveExerciseMedia", () => media.saveExerciseMedia({ exerciseId: qa.exercise, url: "https://example.com/exercise-media/x.png" }));
    await c("removeExerciseMedia", () => media.removeExerciseMedia({ exerciseId: qa.exercise }));

    await c("saveSet", () => athlete.saveSet({ assignedWorkoutId: qa.workout, aweId: qa.awe, setNumber: 1, weight: 10, reps: 5, done: true }));
    await c("finishWorkout", () => athlete.finishWorkout({ assignedWorkoutId: qa.workout }));
    await c("setWorkoutSkipped", () => athlete.setWorkoutSkipped({ assignedWorkoutId: qa.workout, skipped: true }));
    await c("planAddWorkout", () => athlete.planAddWorkout({ week: 1, name: "x", copyFromWorkoutId: qa.workout }));
    await c("planRemoveWorkout", () => athlete.planRemoveWorkout(qa.workout));
    await c("planRemoveExercise", () => athlete.planRemoveExercise({ aweId: qa.awe, workoutId: qa.workout }));
    await c("planSwapExercise", () => athlete.planSwapExercise({ aweId: qa.awe, slug: "bench-press", workoutId: qa.workout }));
    await c("planSetTargets", () => athlete.planSetTargets({ aweId: qa.awe, workoutId: qa.workout, ...T }));
    await c("planSetWorkoutNote", () => athlete.planSetWorkoutNote({ workoutId: qa.workout, text: "x" }));
    await c("startMyProgram", () => athlete.startMyProgram({ programId: qa.program, startDate: day }));
    await c("sessionSummary", () => athlete.sessionSummary(qa.log));

    await c("logSet", () => logger.logSet({ assignedWorkoutId: qa.workout, clientId: qa.client, exerciseId: qa.exercise, assignedWorkoutExerciseId: qa.awe, setNumber: 1, weight: 10, bandColor: null, reps: 5, rpe: null, note: null, completed: true }));
    await c("completeSession", () => logger.completeSession({ workoutLogId: qa.log, assignedWorkoutId: qa.workout, clientId: qa.client, clientNotes: "x" }));
    await c("swapExercise", () => logger.swapExercise({ assignedWorkoutExerciseId: qa.awe, exerciseId: qa.exercise }));
    await c("addExerciseNote", () => logger.addExerciseNote({ clientId: qa.client, exerciseId: qa.exercise, note: "x" }));
    await c("getLastPerformance", () => (logger.getLastPerformance as (...a: unknown[]) => Promise<unknown>)(qa.client, qa.exercise));
    await c("updateSessionDate", () => logger.updateSessionDate({ workoutLogId: qa.log, date: day }));
    await c("getLastExerciseNote", () => (logger.getLastExerciseNote as (...a: unknown[]) => Promise<unknown>)(qa.client, qa.exercise));

    await c("quickLogStart", () => quick.quickLogStart({ clientId: qa.client }));
    await c("searchQuickExercises", () => quick.searchQuickExercises({ clientId: qa.client, q: "bench" }));
    await c("lastTime", () => quick.lastTime({ clientId: qa.client, exerciseId: qa.exercise }));
    await c("loadQuickSession", () => quick.loadQuickSession({ clientId: qa.client, sessionId: qa.log }));
    await c("saveQuickSession", () => quick.saveQuickSession({ clientId: qa.client, date: day, exercises: [] }));

    await c("tickRule", () => goals.tickRule({ goalId: "nope", day, ruleKey: "x", done: true }));
    await c("logWorkout (goals)", () => goals.logWorkout({ goalId: "nope", day, name: "x", minutes: 45 }));
    await c("requestPasswordReset (guest's own address)", () => account.requestPasswordReset({ email: String(current.user?.email) }));
  }

  for (const persona of ["demo coach", "guest athlete"] as const) {
    it(`${persona}: every action refused, nothing changes, no email, no AI`, async () => {
      const { createGuest } = await import("@/lib/guest");
      const guest = await createGuest(persona === "demo coach" ? { demo: true } : { name: "QA guest" });
      current.user = { id: guest.id, email: guest.email, name: guest.name, role: guest.role, workspaceId: guest.workspaceId };
      const before = await fingerprint();
      sendEmail.mockClear();
      aiCalls.mockClear();
      await runAll(persona);
      expect(await fingerprint()).toBe(before);
      expect(sendEmail).not.toHaveBeenCalled();
      expect(aiCalls).not.toHaveBeenCalled();
      console.log(`\n${persona} (${String(guest.email).slice(0, 8)}…@guest.atlas.app)\n` + outcomes.filter((o) => o.persona === persona).map((o) => `  ${o.action.padEnd(44)} ${o.outcome}`).join("\n"));
      // requestPasswordReset answers "ok" whatever the address (so it can't be used to find accounts) and sends nothing to a guest address: sendEmail is asserted above.
      expect(outcomes.filter((o) => o.persona === persona && o.outcome.startsWith("ALLOWED") && !o.action.startsWith("requestPasswordReset"))).toEqual([]);
    }, 240_000);
  }
});
