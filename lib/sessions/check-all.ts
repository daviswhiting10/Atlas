/**
 * "Check all": one tap ticks every unticked set of an exercise (or of the whole workout) with the
 * values on screen, and the same button un-ticks them again once everything is ticked. Each set goes
 * through exactly what a single tick does (optimistic, kept on the phone until the server confirms,
 * saved in set order), so offline works the same way. Pure apart from the storage passed in.
 */
import { addPending, pendingKey } from "./pending";

export type BulkMode = "check" | "uncheck";

/** What the exercise's button does: tick the rest, or (everything ticked) un-tick all. null when it has no sets. */
export function exerciseBulk(done: boolean[]): BulkMode | null {
  if (done.length === 0) return null;
  return done.every(Boolean) ? "uncheck" : "check";
}

/**
 * The sets a bulk tap changes, in set order. Ticking skips a set that can't be logged yet
 * (`loggable[i] === false`, for example no reps); un-ticking changes every ticked set.
 */
export function bulkIndices(done: boolean[], mode: BulkMode, loggable?: boolean[]): number[] {
  const out: number[] = [];
  done.forEach((d, i) => {
    if (mode === "check" ? !d && loggable?.[i] !== false : d) out.push(i);
  });
  return out;
}

/** The workout menu's entry: "Check all N sets" (N unticked), or "Uncheck all" once every set is ticked. */
export function workoutBulk(lists: boolean[][]): { mode: BulkMode; count: number } | null {
  const all = lists.flat();
  if (all.length === 0) return null;
  const unticked = all.filter((d) => !d).length;
  return unticked === 0 ? { mode: "uncheck", count: all.length } : { mode: "check", count: unticked };
}

export const checkAllText = (n: number) => `Check all ${n} ${n === 1 ? "set" : "sets"}?`;

/** Keep each set's tick on the phone until the server confirms it, in set order (what a single tick does). */
export function queueBulk(
  storage: Parameters<typeof addPending>[0],
  workoutId: string,
  entries: Array<{ aweId: string; setNumber: number; done: boolean; weight?: number | null; reps?: number | null }>,
  now = Date.now()
) {
  entries.forEach((e, n) =>
    addPending(storage, workoutId, pendingKey(e.aweId, e.setNumber), { done: e.done, weight: e.weight, reps: e.reps }, now + n)
  );
}
