/**
 * Writes a plan read from a coach's spreadsheet: the program (one block per
 * week, so each week keeps its own prescription), the client's draft plan,
 * and every week the sheet shows as done as a logged session, so the
 * charts and next targets pick up where the sheet leaves off.
 */

import { prisma } from "@/lib/db/client";
import { assignProgram, upsertProgram } from "@/lib/db/programs";
import { resolveExercise } from "./resolve-exercise";
import { inferWeekOneStart, planFromGrid, shapePlan, type SheetGrid } from "./sheet-plan";
import { NO_CONTEXT, type PlanContext } from "./plan-context";

export type SavedSheetPlan = { assignmentId: string; programId: string; weeks: number; days: number; weeksDone: number; sessionsLogged: number; exercises: number };

export async function saveSheetPlan(input: {
  workspaceId: string;
  clientId: string;
  grid: SheetGrid;
  name: string;
  goals: string[];
  /** When week 1 began. Left out: worked out from the weeks already done. */
  weekOneStart?: Date | null;
  /** The coach's note ("4 week block, start fresh"), already read. */
  context?: PlanContext;
  today?: Date;
}): Promise<SavedSheetPlan> {
  const { weeks, lastLoggedWeek } = shapePlan(planFromGrid(input.grid), input.context ?? NO_CONTEXT);

  const names = Array.from(new Set(weeks.flatMap((w) => w.days.flatMap((d) => d.entries.map((e) => e.exercise)))));
  const ids = new Map<string, string>();
  for (const name of names) ids.set(name, (await resolveExercise(name, input.workspaceId)).id);

  // One block per week: blocks are scheduled one after another, so week N lands in week N.
  const program = await upsertProgram(input.workspaceId, {
    name: input.name.slice(0, 120),
    description: null,
    goalTags: { goals: input.goals, conditions: [] },
    blocks: weeks.map((w) => ({
      name: `Week ${w.week}`,
      order: w.week,
      weeks: 1,
      workouts: w.days.map((d, i) => ({
        name: d.name,
        dayOfWeek: d.dayOfWeek,
        order: i + 1,
        exercises: d.entries.map((e, j) => ({
          exerciseId: ids.get(e.exercise)!,
          order: j + 1,
          notes: e.notes,
          section: null,
          prescribedSets: Array.from({ length: e.rx.sets }, (_, k) => ({
            setNumber: k + 1,
            weight: null,
            unit: e.rx.unit,
            repMin: e.rx.repMin,
            repMax: e.rx.repMax,
            rpe: null,
            restSeconds: null,
            notes: "",
          })),
        })),
      })),
    })),
  });

  const today = input.today ?? new Date();
  const start = input.weekOneStart ?? (lastLoggedWeek > 0 ? inferWeekOneStart(lastLoggedWeek, today) : new Date(today.getFullYear(), today.getMonth(), today.getDate()));
  const assignment = await assignProgram(input.workspaceId, program.id, input.clientId, start);
  // A draft until the coach has checked it and assigns it.
  await prisma.programAssignment.update({ where: { id: assignment.id }, data: { status: "PAUSED" } });

  // Which week and day each scheduled workout came from.
  const source = await prisma.program.findUnique({
    where: { id: program.id },
    select: { blocks: { select: { order: true, workouts: { select: { id: true, order: true } } } } },
  });
  const origin = new Map(source!.blocks.flatMap((b) => b.workouts.map((w) => [w.id, { week: b.order, day: (w.order ?? 1) - 1 }] as const)));
  const scheduled = await prisma.assignedWorkout.findMany({
    where: { programAssignmentId: assignment.id },
    select: { id: true, sourceWorkoutId: true, scheduledDate: true, exercises: { select: { id: true, exerciseId: true, order: true } } },
  });

  let sessionsLogged = 0;
  for (const aw of scheduled) {
    const at = aw.sourceWorkoutId ? origin.get(aw.sourceWorkoutId) : undefined;
    const day = at ? weeks[at.week - 1]?.days[at.day] : undefined;
    if (!day?.logged) continue;
    const date = new Date(aw.scheduledDate);
    date.setHours(12, 0, 0, 0);
    await prisma.$transaction(async (tx) => {
      // The sheet records that the week was done, not the day: the scheduled day is the only date there is.
      const log = await tx.workoutLog.create({ data: { clientId: input.clientId, assignedWorkoutId: aw.id, source: "PLAN", date, completedAt: date, trainerSeen: true }, select: { id: true } });
      const sets = day.entries.flatMap((e, j) => {
        const awe = aw.exercises.find((x) => x.order === j + 1);
        if (!awe) return [];
        return Array.from({ length: e.rx.sets }, (_, k) => ({
          workoutLogId: log.id,
          exerciseId: awe.exerciseId,
          assignedWorkoutExerciseId: awe.id,
          setNumber: k + 1,
          weight: e.load?.weight ?? null,
          bandColor: e.load?.band ?? null,
          reps: e.rx.repMin,
          note: k === 0 ? e.load?.note ?? null : null,
          completed: true,
        }));
      });
      if (sets.length > 0) await tx.setLog.createMany({ data: sets });
      await tx.assignedWorkout.update({ where: { id: aw.id }, data: { loggedBy: "TRAINER" } });
    });
    sessionsLogged += 1;
  }

  return { assignmentId: assignment.id, programId: program.id, weeks: weeks.length, days: Math.max(0, ...weeks.map((w) => w.days.length)), weeksDone: lastLoggedWeek, sessionsLogged, exercises: names.length };
}
