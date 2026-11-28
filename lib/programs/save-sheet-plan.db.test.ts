/**
 * Saving an imported plan in batches: every week, workout and exercise arrives as written, scheduled where the
 * row-by-row code put it, and a live import finishes the plan before it.
 *
 * Dev database only:  set -a; . ./.env.local; set +a; ATLAS_DB_TEST=1 npx vitest run lib/programs/save-sheet-plan.db.test.ts
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const RUN = !!process.env.ATLAS_DB_TEST;

describe.skipIf(!RUN)("saveSheetPlan, batched", () => {
  let prisma: typeof import("@/lib/db/client").prisma;
  let ws = "";
  let clientId = "";
  const wk = (sr: string[], ld: string[]) => sr.map((s, i) => ({ week: i + 1, setsReps: s, load: ld[i] }));
  const grid = {
    programName: "Batch test",
    days: [
      { name: "Day 1", exercises: [{ name: "Back Squat", weeks: wk(["3x8-10", "3x8-10", "4x6-8", "2x8-10"], ["185", "195", "215", "155"]) }, { name: "DB Curl", weeks: wk(["3x12", "3x12", "3x12", "3x12"], ["", "", "", ""]) }] },
      { name: "Day 2", exercises: [{ name: "Dumbbell Curl", weeks: wk(["2x15", "2x15", "2x15", "2x15"], ["", "", "", ""]) }] },
    ],
  };

  beforeAll(async () => {
    ({ prisma } = await import("@/lib/db/client"));
    ws = (await prisma.workspace.create({ data: { name: "batch save test" }, select: { id: true } })).id;
    const user = await prisma.user.create({ data: { email: `${Date.now().toString(36)}-batch@guest.atlas.app`, role: "CLIENT", workspaceId: ws }, select: { id: true } });
    clientId = (await prisma.clientProfile.create({ data: { workspaceId: ws, userId: user.id, fullName: "Batch", status: "ACTIVE", goalTargets: { athlete: { demo: false } } } })).id;
  }, 60_000);

  afterAll(async () => {
    const { deleteGuestWorkspace } = await import("@/lib/guest-cleanup");
    if (ws) await deleteGuestWorkspace(ws, { ttlMs: 0, includeAthletes: true }).catch((e) => console.error("cleanup failed", e));
  }, 60_000);

  it("writes each week as its own block and schedules every workout and exercise", async () => {
    const { saveSheetPlan } = await import("./save-sheet-plan");
    const start = new Date("2026-12-07T00:00:00");
    const fresh = { durationWeeks: null, trainingDays: null, startAtWeek: 1 };
    const first = await saveSheetPlan({ workspaceId: ws, clientId, grid: grid as never, name: "First", goals: [], weekOneStart: start, context: fresh, history: false, loadsAsTargets: true, status: "ACTIVE" });
    const plan = await prisma.programAssignment.findUniqueOrThrow({
      where: { id: first.assignmentId },
      select: { status: true, assignedWorkouts: { orderBy: { scheduledDate: "asc" }, select: { name: true, scheduledDate: true, sourceWorkoutId: true, exercises: { orderBy: { order: "asc" }, select: { order: true, prescribedSets: true, exercise: { select: { name: true } } } } } } },
    });
    expect(plan.status).toBe("ACTIVE");
    expect(plan.assignedWorkouts).toHaveLength(8); // 4 weeks × 2 days
    expect(plan.assignedWorkouts.every((w) => w.sourceWorkoutId)).toBe(true);
    // Week 3, day 1: two weeks after week 1's day 1.
    const day1 = plan.assignedWorkouts.filter((w) => w.name === "Day 1");
    expect((day1[2].scheduledDate.getTime() - day1[0].scheduledDate.getTime()) / 86_400_000).toBe(14);
    const squat = day1.map((w) => w.exercises[0].prescribedSets as Array<{ repMin: number; weight: number | null }>);
    expect(squat.map((s) => `${s.length}x${s[0].repMin}@${s[0].weight}`)).toEqual(["3x8@185", "3x8@195", "4x6@215", "2x8@155"]);
    // A lone number is saved widened down ("3x12" → 10–12); the written ranges above as written.
    const curl = day1[0].exercises[1].prescribedSets as Array<{ repMin: number; repMax: number }>;
    expect([curl[0].repMin, curl[0].repMax]).toEqual([10, 12]);
    // "DB Curl" and "Dumbbell Curl" are one exercise, looked up once.
    const curls = new Set(plan.assignedWorkouts.flatMap((w) => w.exercises.filter((e) => /curl/i.test(e.exercise.name)).map((e) => e.exercise.name)));
    expect(curls.size).toBe(1);

    // A second live import finishes the first, in the same step.
    const second = await saveSheetPlan({ workspaceId: ws, clientId, grid: grid as never, name: "Second", goals: [], weekOneStart: start, context: fresh, history: false, status: "ACTIVE" });
    const statuses = await prisma.programAssignment.findMany({ where: { clientId }, select: { id: true, status: true } });
    expect(statuses.find((a) => a.id === first.assignmentId)?.status).toBe("COMPLETED");
    expect(statuses.find((a) => a.id === second.assignmentId)?.status).toBe("ACTIVE");
  }, 120_000);

  it("history logs the reps as written and never the core exercise accepted in the preview", async () => {
    const { saveSheetPlan } = await import("./save-sheet-plan");
    const { addSuggestion } = await import("./plan-rules");
    const done = { programName: "History test", days: [{ name: "Day 1", exercises: [{ name: "Back Squat", weeks: wk(["3x10", "3x10"], ["185", ""]) }] }] };
    const withCore = addSuggestion(done as never, 0, "plank");
    const saved = await saveSheetPlan({ workspaceId: ws, clientId, grid: withCore, name: "History", goals: [], weekOneStart: new Date("2026-11-02T00:00:00"), context: { durationWeeks: null, trainingDays: null, startAtWeek: null }, history: true });
    expect(saved.sessionsLogged).toBe(1);
    const sets = await prisma.setLog.findMany({ where: { workoutLog: { clientId, source: "IMPORT" } }, select: { reps: true, exercise: { select: { name: true } } } });
    expect(sets.map((s) => `${s.exercise?.name}:${s.reps}`)).toEqual(["Back Squat:10", "Back Squat:10", "Back Squat:10"]);
    const planned = await prisma.assignedWorkoutExercise.findMany({ where: { assignedWorkout: { programAssignmentId: saved.assignmentId } }, orderBy: [{ assignedWorkout: { scheduledDate: "asc" } }, { order: "asc" }], select: { prescribedSets: true, exercise: { select: { name: true } } } });
    expect(planned.map((e) => `${e.exercise.name}:${(e.prescribedSets as Array<{ repMin: number; repMax: number }>)[0].repMin}-${(e.prescribedSets as Array<{ repMax: number }>)[0].repMax}`)).toEqual(["Back Squat:8-10", "Plank:30-45", "Back Squat:8-10", "Plank:30-45"]);
  }, 120_000);
});
