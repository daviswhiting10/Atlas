/**
 * The logger moves on by itself: when an exercise's last set is logged it goes to the next
 * exercise with sets still to do. A session never finishes by itself: only the Finish button does.
 *
 * Pure: no I/O.
 */

/** Every set of every exercise is logged (and there's at least one set). */
export function allDone(exercises: boolean[][]): boolean {
  return exercises.some((sets) => sets.length > 0) && exercises.every((sets) => sets.every(Boolean));
}

/**
 * The exercise to go to once `from` is finished: the next one after it with a set still to
 * log, or failing that the first one before it (something skipped earlier). null when every
 * exercise is done.
 */
export function nextOpen(done: boolean[], from: number): number | null {
  for (let i = from + 1; i < done.length; i++) if (!done[i]) return i;
  for (let i = 0; i < from && i < done.length; i++) if (!done[i]) return i;
  return null;
}
