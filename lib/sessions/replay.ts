/**
 * A tick saved late, from a phone that was offline, must not undo what another device did in between (the coach logging
 * the same session from the gym floor, or the client on a second phone). A save that is being *replayed* says what the
 * phone last knew the server had for that set (`expectDone`). If the server has something else now, the replay is not
 * applied: the server answers with its own version and the phone shows that one.
 *
 * Only the ticked / not-ticked state is compared. Two devices typing different weights into a set that both have ticked
 * is last-writer-wins, as before.
 *
 * What it can't know: whose tap came first. The server has no "changed at" for a set, so when the two devices disagree the
 * one that reached the server first stands, and the late one is told. Nothing is lost silently: the person sees a message.
 *
 * Pure: no I/O.
 */

export type ServerSetState = { done: boolean; weight: number | null; reps: number | null };

/** The replay and the server disagree about whether this set is ticked. `current` is the row now, or null when there is none. */
export function replayConflict(expectDone: boolean, current: { completed: boolean } | null): boolean {
  return (current?.completed ?? false) !== expectDone;
}

/** What a phone shows after a conflict: the server's version of the set. */
export function conflictMessage(setNumber: number): string {
  return `Set ${setNumber} was changed on another device. Showing that version.`;
}
