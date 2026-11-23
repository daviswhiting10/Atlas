/**
 * Tapping Finish: nothing logged means nothing to finish, everything logged finishes at once, and
 * some sets left unlogged asks once ("Finish now? 3 sets not logged"). Then it completes immediately.
 * With no connection the finish is queued on the phone and completes when the connection is back.
 *
 * Pure apart from the storage and the sender passed in.
 */
import { clearFinish, queueFinish, queuedFinish } from "./pending-finish";

export type FinishAction = { kind: "none" } | { kind: "now" } | { kind: "confirm"; unlogged: number };

/** What a tap on Finish does, from each exercise's list of "is this set logged". */
export function finishAction(lists: boolean[][]): FinishAction {
  const sets = lists.flat();
  if (!sets.some(Boolean)) return { kind: "none" };
  const unlogged = sets.filter((d) => !d).length;
  return unlogged === 0 ? { kind: "now" } : { kind: "confirm", unlogged };
}

export const unloggedText = (n: number) => `${n} ${n === 1 ? "set" : "sets"} not logged`;
/** The question under it. The same words in the athlete's logger and the coach's. */
export const markPrompt = (n: number) => `Mark ${n === 1 ? "it" : "them"} as done and finish?`;
export const FINISH_LABELS = { mark: "Mark remaining and finish", partial: "Finish with only what I logged", cancel: "Cancel" } as const;

type Store = Parameters<typeof queueFinish>[0];
export type FinishResult = { kind: "done"; minutes: number } | { kind: "queued" } | { kind: "failed" };

/** Send the finish. A network failure queues it (with the session's length); anything else is a failure to show. */
export async function sendFinish(o: {
  send: (minutes: number) => Promise<unknown>;
  storage: Store;
  workoutId: string;
  /** Minutes since the session began. A queued finish keeps the length it was queued with. */
  minutes: number;
  isOffline: (e: unknown) => boolean;
}): Promise<FinishResult> {
  const length = queuedFinish(o.storage, o.workoutId)?.minutes ?? o.minutes;
  try {
    await o.send(length);
    clearFinish(o.storage, o.workoutId);
    return { kind: "done", minutes: length };
  } catch (e) {
    if (!o.isOffline(e)) return { kind: "failed" };
    if (!queuedFinish(o.storage, o.workoutId)) queueFinish(o.storage, o.workoutId, o.minutes);
    return { kind: "queued" };
  }
}
