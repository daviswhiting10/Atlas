/**
 * Moving a logged session to another day of the plan. The session keeps its own date (the day it was really done); what
 * changes is which plan workout it fulfils. Its sets follow it, re-pointed at the same lifts in the new workout; a set whose
 * lift the new workout doesn't have keeps its lift (so history and charts are whole) and just isn't tied to a plan row.
 * Pure: no I/O.
 */

export type MoveSet = { id: string; exerciseId: string | null };
export type TargetExercise = { id: string; exerciseId: string };

/** Each set's new plan-row id (or null), matching by lift. Two sets of one lift go to that lift's row; a lift done twice in the target uses its first row. */
export function remapSets(sets: MoveSet[], target: TargetExercise[]): Array<{ setId: string; assignedWorkoutExerciseId: string | null }> {
  const byLift = new Map<string, string>();
  for (const t of target) if (!byLift.has(t.exerciseId)) byLift.set(t.exerciseId, t.id);
  return sets.map((s) => ({ setId: s.id, assignedWorkoutExerciseId: s.exerciseId ? (byLift.get(s.exerciseId) ?? null) : null }));
}

export type Slot = { id: string; name: string; week: number; date: string; logged: boolean; current: boolean };

/** The plan's days for the picker: by week, in date order; the one the session is on and the ones already logged can't be picked. */
export function slotsByWeek(workouts: Array<{ id: string; name: string; week: number; date: string; status: string; logId?: string | null }>, currentId: string | null): Array<{ week: number; slots: Slot[] }> {
  const weeks = new Map<number, Slot[]>();
  for (const w of workouts) {
    if (w.status === "SKIPPED") continue;
    const list = weeks.get(w.week) ?? [];
    list.push({ id: w.id, name: w.name, week: w.week, date: w.date.slice(0, 10), logged: w.status === "LOGGED", current: w.id === currentId });
    weeks.set(w.week, list);
  }
  return Array.from(weeks, ([week, slots]) => ({ week, slots: slots.sort((a, b) => a.date.localeCompare(b.date)) })).sort((a, b) => a.week - b.week);
}

/** Can the session move onto this slot? Only a free one that isn't where it already is. */
export const canMoveTo = (s: Pick<Slot, "logged" | "current">): boolean => !s.logged && !s.current;
