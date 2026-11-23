/**
 * What Today shows an athlete who has no plan. Pure: no I/O.
 *
 *  - "card": a self-serve athlete (one who makes their own plan, a coach on their own training included) with no plan
 *    gets the "No plan yet" card: three doors (Import, Build it myself, Atlas builds it) and the log-a-workout fallback.
 *  - "coached": her coach writes the plan, so the doors are not hers: she waits for it.
 *  - "guest": guests stay blocked from the doors (reading a file costs money); they keep the plain fallback.
 *  - "plan": there is a plan, so Today shows its next workout.
 */
import { isCoached } from "./coached";

export type EmptyStateInput = { hasPlan: boolean; selfServe: boolean; isCoach: boolean; isGuest: boolean };
export type EmptyState = "plan" | "coached" | "guest" | "card";

export function todayEmptyState({ hasPlan, selfServe, isCoach, isGuest }: EmptyStateInput): EmptyState {
  if (hasPlan) return "plan";
  if (isCoached({ selfServe, isCoach })) return "coached";
  if (isGuest) return "guest";
  return "card";
}

/** Who may read a file into a plan (it costs an AI call): a self-serve athlete, never a coached client or a guest. */
export const canImportPlan = (a: { selfServe: boolean; isCoach: boolean; isGuest: boolean }): boolean => todayEmptyState({ ...a, hasPlan: false }) === "card";

/** Reads of a file per person per day. Each is one vision call over up to MAX_PDF_PAGES pages. */
export const IMPORTS_PER_DAY = 5;
