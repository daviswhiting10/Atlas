/**
 * Writes a plan read from a coach's spreadsheet: the program (one block per
 * week, so each week keeps its own prescription) and the client's draft plan.
 * With `history`, every week the sheet shows as done also becomes a finished
 * session (source IMPORT), dated back to the day it was planned, so the
 * client's charts and next targets pick up where the sheet leaves off.
 *
 * The coach sees the same numbers first (lib/programs/sheet-summary).
 */

import { prisma } from "@/lib/db/client";
import { assignProgram, upsertProgram } from "@/lib/db/programs";
import { resolveExercises } from "./resolve-exercise";
import { savedRange } from "./plan-rules";
import { type PlanWeek, type SheetGrid } from "./sheet-plan";
import { dayDate, planStart, shapeSheet } from "./sheet-summary";
import { NO_CONTEXT, type PlanContext } from "./plan-context";

export type SavedSheetPlan = { assignmentId: string; programId: string; weeks: number; days: number; weeksDone: number; sessionsLogged: number; exercises: number };

/**
 * The program alone, one block per week (blocks are scheduled one after another, so week N lands in week N): what the
 * Programs library saves from an import, and the first half of saving a client's plan.
 */
export async function saveProgramFromGrid(input: {
  workspaceId: string;
  grid: SheetGrid;
  name: string;
  goals: string[];
  context?: PlanContext;
  /** A load in a week's cell is that week's target weight, not a session done. */
  loadsAsTargets?: boolean;
}): Promise<{ programId: string; weeks: PlanWeek[]; lastLoggedWeek: number; exercises: number }> {
  const { weeks, lastLoggedWeek } = shapeSheet(input.grid, input.context ?? NO_CONTEXT);

  const names = Array.from(new Set(weeks.flatMap((w) => w.days.flatMap((d) => d.entries.map((e) => e.exercise)))));
  // Never a plan with nothing in it: the read step refuses this first, with a message for the coach.
  if (names.length === 0) throw new Error("saveProgramFromGrid: no exercises read as sets and reps");
  // Every name in a few queries (catalog and exact names together), the rest one by one: see resolveExercises.
  const found = await resolveExercises(names, input.workspaceId);
  const ids = new Map(Array.from(found, ([n, e]) => [n, e.id] as const));

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
        exercises: d.entries.map((e, j) => {
          // A lone number is saved as a range, widened down; a written range as written (lib/programs/plan-rules).
          const range = savedRange(e.rx, e.exercise);
          return {
            exerciseId: ids.get(e.exercise)!,
            order: j + 1,
            notes: e.notes,
            section: e.section,
            prescribedSets: Array.from({ length: e.rx.sets }, (_, k) => ({
              setNumber: k + 1,
              weight: input.loadsAsTargets ? e.load?.weight ?? null : null,
              unit: e.rx.unit,
              repMin: range.repMin,
              repMax: range.repMax,
              rpe: null,
              restSeconds: e.rest ?? null,
              notes: range.note ?? "",
            })),
          };
        }),
      })),
    })),
  });
  return { programId: program.id, weeks, lastLoggedWeek, exercises: names.length };
}

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
  /** Import the weeks the sheet shows as done as finished sessions. */
  history: boolean;
  /** A load in a week's cell is that week's target weight (an athlete's own plan), not a session done. */
  loadsAsTargets?: boolean;
  /** "PAUSED" (the default): a coach's draft to check. "ACTIVE": the live plan now; an earlier live plan is finished. */
  status?: "PAUSED" | "ACTIVE";
  today?: Date;
}): Promise<SavedSheetPlan> {
  const { programId, weeks, lastLoggedWeek, exercises } = await saveProgramFromGrid(input);
  const program = { id: programId };

  const today = input.today ?? new Date();
  const start = planStart(lastLoggedWeek, input.weekOneStart, today);
  // ACTIVE: the plan now. Otherwise a draft (PAUSED from the start) until the coach has checked it and assigns it.
  const assignment = await assignProgram(input.workspaceId, program.id, input.clientId, start, undefined, input.status === "ACTIVE" ? "ACTIVE" : "PAUSED");
  // The file's other tabs or pages ("How to use"), as the plan's note.
  if (input.grid.note) await prisma.programAssignment.update({ where: { id: assignment.id }, data: { notes: input.grid.note } });
  if (input.status === "ACTIVE") {
    // An earlier live plan is finished; its history stays.
    await prisma.programAssignment.updateMany({ where: { clientId: input.clientId, workspaceId: input.workspaceId, status: "ACTIVE", NOT: { id: assignment.id } }, data: { status: "COMPLETED" } });
  }
  const done = { assignmentId: assignment.id, programId: program.id, weeks: weeks.length, days: Math.max(0, ...weeks.map((w) => w.days.length)), weeksDone: lastLoggedWeek, exercises };
  // Nothing to bring in as history: no need to look the scheduled workouts up again.
  if (!input.history) return { ...done, sessionsLogged: 0 };

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
    if (!input.history || !day?.logged || !at) continue;
    // The day the preview showed: the same rule the plan is scheduled by.
    const date = dayDate(start, at.week, day.dayOfWeek);
    await prisma.$transaction(async (tx) => {
      // The sheet records that the week was done, not the day: the scheduled day is the only date there is.
      const log = await tx.workoutLog.create({ data: { clientId: input.clientId, assignedWorkoutId: aw.id, source: "IMPORT", date, completedAt: date, trainerSeen: true }, select: { id: true } });
      const sets = day.entries.flatMap((e, j) => {
        const awe = aw.exercises.find((x) => x.order === j + 1);
        // An exercise added in the preview wasn't in the sheet, so the sheet doesn't say it was done.
        if (!awe || e.added) return [];
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

  return { assignmentId: assignment.id, programId: program.id, weeks: weeks.length, days: Math.max(0, ...weeks.map((w) => w.days.length)), weeksDone: lastLoggedWeek, sessionsLogged, exercises };
}
