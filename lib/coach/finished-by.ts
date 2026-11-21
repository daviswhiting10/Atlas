/**
 * "Finished by client": the coach-side marker on a session whose plan workout was finished from the client's own
 * Finish button (AssignedWorkout.loggedBy = CLIENT). It says who finished the session, not who entered every set:
 * the data holds no author per set. A session with no plan workout, or not finished yet, gets no marker.
 */
export const FINISHED_BY_CLIENT = "Finished by client";

export function finishedByClient(s: { loggedBy?: string | null; completedAt?: Date | string | null } | null | undefined): boolean {
  return !!s && s.loggedBy === "CLIENT" && s.completedAt != null;
}
