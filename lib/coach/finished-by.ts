/**
 * "Finished by client": the coach-side marker on a session whose plan workout was finished from the client's own
 * Finish button (AssignedWorkout.loggedBy = CLIENT). It says who finished the session, not who entered every set:
 * the data holds no author per set. A session with no plan workout, or not finished yet, gets no marker.
 */
export const FINISHED_BY_CLIENT = "Finished by client";

/**
 * Before this date the coach's own finish left loggedBy as it was (and every generated plan starts as CLIENT), so an
 * older CLIENT can't be trusted. Only sessions finished from here on get the marker.
 * SET THIS TO THE DAY THE CHANGE SHIPS (the deploy of this commit). It is the first day the stored value means it.
 */
export const FINISHED_BY_RELIABLE_FROM = new Date("2026-11-22T00:00:00Z");

export function finishedByClient(
  s: { loggedBy?: string | null; completedAt?: Date | string | null } | null | undefined,
  since: Date = FINISHED_BY_RELIABLE_FROM
): boolean {
  if (!s || s.loggedBy !== "CLIENT" || s.completedAt == null) return false;
  return new Date(s.completedAt).getTime() >= since.getTime();
}
