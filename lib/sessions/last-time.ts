/**
 * "Last time" for every exercise in a workout, in two queries instead of
 * two per exercise (the logger used to make ~3 round trips per exercise).
 *
 * Same answer as getLastPerformance / getLastExerciseNote in
 * lib/actions/workout-logger.ts: the sets of the most recent day (within 90
 * days) the client did the exercise, never the session being logged, and
 * the coach's newest note on it.
 *
 * Callers check the client belongs to the workspace first.
 */

import { prisma } from "@/lib/db/client";
import { Prisma } from "@/app/generated/prisma/client";

export type LastSet = { weight: number | null; reps: number | null; rpe: number | null; completed: boolean };

type Row = LastSet & { exerciseId: string | null; day: string };

/**
 * Rows ordered newest session first (then set order) → each exercise's sets
 * from its most recent day. Mirrors getLastPerformance: its first 20 rows,
 * then only those on the newest day. Pure.
 */
export function lastSetsByExercise(rows: Row[], perExercise = 20): Map<string, LastSet[]> {
  const grouped = new Map<string, Row[]>();
  for (const r of rows) {
    if (!r.exerciseId) continue;
    const list = grouped.get(r.exerciseId) ?? [];
    if (list.length < perExercise) list.push(r);
    grouped.set(r.exerciseId, list);
  }
  const out = new Map<string, LastSet[]>();
  for (const [id, list] of Array.from(grouped)) {
    const day = list[0].day;
    out.set(
      id,
      list.filter((r) => r.day === day).map(({ weight, reps, rpe, completed }) => ({ weight, reps, rpe, completed }))
    );
  }
  return out;
}

export async function lastPerformanceFor(input: {
  clientId: string;
  exerciseIds: string[];
  /** The plan workout being logged: its own session is never "last time". */
  excludeAssignedWorkoutId?: string | null;
  now?: Date;
}): Promise<Map<string, LastSet[]>> {
  const ids = Array.from(new Set(input.exerciseIds));
  if (ids.length === 0) return new Map();
  const cutoff = new Date(input.now ?? Date.now());
  cutoff.setDate(cutoff.getDate() - 90);
  const exclude = input.excludeAssignedWorkoutId ?? null;
  // At most 20 rows per exercise (getLastPerformance's cap), newest session first: never every set.
  // Off-plan sessions have no plan workout, so NULL is kept explicitly.
  const rows = await prisma.$queryRaw<Array<{ exerciseId: string; weight: number | null; reps: number | null; rpe: number | null; completed: boolean; date: Date }>>(Prisma.sql`
    SELECT "exerciseId", weight, reps, rpe, completed, date FROM (
      SELECT s."exerciseId", s.weight, s.reps, s.rpe, s.completed, w.date, s."createdAt",
             ROW_NUMBER() OVER (PARTITION BY s."exerciseId" ORDER BY w.date DESC, s."createdAt" ASC) AS rn
      FROM "SetLog" s
      JOIN "WorkoutLog" w ON w.id = s."workoutLogId"
      WHERE w."clientId" = ${input.clientId}
        AND w.date >= ${cutoff}
        AND s."exerciseId" IN (${Prisma.join(ids)})
        AND (${exclude}::text IS NULL OR w."assignedWorkoutId" IS NULL OR w."assignedWorkoutId" <> ${exclude}::text)
    ) ranked
    WHERE rn <= 20
    ORDER BY "exerciseId", date DESC, "createdAt" ASC`);
  return lastSetsByExercise(rows.map(({ date, ...r }) => ({ ...r, day: new Date(date).toISOString().slice(0, 10) })));
}

/** The coach's newest note on each exercise for this client. */
export async function lastNotesFor(input: { clientId: string; workspaceId: string; exerciseIds: string[] }): Promise<Map<string, string>> {
  const ids = Array.from(new Set(input.exerciseIds));
  if (ids.length === 0) return new Map();
  const notes = await prisma.exerciseCoachNote.findMany({
    where: { clientId: input.clientId, workspaceId: input.workspaceId, exerciseId: { in: ids } },
    orderBy: { createdAt: "desc" },
    distinct: ["exerciseId"],
    select: { exerciseId: true, note: true },
  });
  return new Map(notes.map((n) => [n.exerciseId, n.note]));
}
