/**
 * Exercises added during a session (WorkoutLog.addedExercises), and what to offer the next time the same workout opens:
 * "Last time you added Cable Row and Face Pulls." Pure: no I/O. The reads and writes are in lib/sessions/added-store.ts.
 */

export type AddedExercise = {
  exerciseId: string;
  name: string;
  /** The plan row it was added as (in that session's workout). */
  aweId: string;
  /** Its prescription when added; the plan row's own wins while it exists. */
  prescribedSets?: unknown;
};

const MAX = 12;

/** The stored list, whatever is in the column: anything malformed is dropped. */
export function readAdded(json: unknown): AddedExercise[] {
  if (!Array.isArray(json)) return [];
  const out: AddedExercise[] = [];
  for (const x of json) {
    if (!x || typeof x !== "object") continue;
    const { exerciseId, name, aweId, prescribedSets } = x as Record<string, unknown>;
    if (typeof exerciseId !== "string" || typeof aweId !== "string" || typeof name !== "string") continue;
    out.push(prescribedSets === undefined ? { exerciseId, name, aweId } : { exerciseId, name, aweId, prescribedSets });
  }
  return out.slice(0, MAX);
}

/** The list with this exercise in it, once (the same plan row, or the same exercise, is replaced). */
export function withAdded(list: AddedExercise[], entry: AddedExercise): AddedExercise[] {
  return [...list.filter((e) => e.aweId !== entry.aweId && e.exerciseId !== entry.exerciseId), entry].slice(-MAX);
}

/** The list without that plan row. */
export function withoutAdded(list: AddedExercise[], aweId: string): AddedExercise[] {
  return list.filter((e) => e.aweId !== aweId);
}

/** "A", "A and B", "A, B and C". */
export function joinNames(names: string[]): string {
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

/** The card's line. */
export function addedSentence(names: string[]): string {
  return `Last time you added ${joinNames(names)}.`;
}

/** What to offer today: last time's additions that aren't in today's workout already, each exercise once. */
export function toOffer(lastTime: AddedExercise[], todayExerciseIds: Iterable<string>): AddedExercise[] {
  const have = new Set(todayExerciseIds);
  const out: AddedExercise[] = [];
  for (const e of lastTime) {
    if (have.has(e.exerciseId)) continue;
    have.add(e.exerciseId);
    out.push(e);
  }
  return out;
}

/** The toast after the card's action: what went where. */
export function addedToast(r: { today: number; laterWorkouts: number }): string {
  const later = r.laterWorkouts === 0 ? "" : `${r.laterWorkouts} later ${r.laterWorkouts === 1 ? "workout" : "workouts"}`;
  if (r.today > 0) return later ? `Added to today and ${later}` : "Added to today";
  return later ? `Added to ${later}` : "Nothing new to add";
}
