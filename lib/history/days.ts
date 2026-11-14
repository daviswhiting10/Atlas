/**
 * What every history view shares: which sessions count, which day a session
 * falls on, and what a "hard" set is.
 *
 * - Only finished sessions (`completedAt` set) count, whatever their source.
 * - A session counts on the day it was done (`date`, read in the athlete's
 *   timezone), so one logged three days late lands where it belongs.
 * - A set is hard by the rule in docs/generator-v2.md: RPE 7 or more; or RPE
 *   missing and within 10% of that exercise's top weight in the session (this is
 *   what keeps warm-ups out); or unloaded (bodyweight, band, timed). There is no
 *   warm-up marker on a logged set, so that is the best the data allows.
 *
 * Pure: no I/O.
 */

import { localDay, safeTimeZone } from "@/lib/athlete/sessions";
import type { HistorySession, HistorySet } from "./types";

export type DatedSession = { session: HistorySession; day: string };

/**
 * Finished sessions with their local day, oldest first (ties by the time they
 * were done, then id, so the order never depends on input order). Days after
 * `today`, if given, are dropped: a wrong clock shouldn't invent future weeks.
 */
export function datedFinished(sessions: HistorySession[], timeZone: string, today?: string): DatedSession[] {
  const tz = safeTimeZone(timeZone);
  return sessions
    .filter((s) => s.completedAt != null)
    .map((session) => ({ session, day: localDay(session.date, tz) }))
    .filter((d) => today == null || d.day <= today)
    .sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : a.session.date.getTime() - b.session.date.getTime() || (a.session.id < b.session.id ? -1 : 1)));
}

/** A set that happened: completed, with reps (or seconds). */
export const isLoggedSet = (s: HistorySet): boolean => s.completed && s.reps != null && s.reps > 0;

const isLoaded = (s: HistorySet): boolean => s.weight != null && s.weight > 0;

/** The logged sets of a session that count as hard. */
export function hardSetsOf(session: HistorySession): HistorySet[] {
  const logged = session.sets.filter(isLoggedSet);
  const top = new Map<string, number>();
  for (const s of logged) {
    if (!isLoaded(s)) continue;
    const key = s.exerciseId ?? "";
    top.set(key, Math.max(top.get(key) ?? 0, s.weight as number));
  }
  return logged.filter((s) => {
    if (!isLoaded(s)) return true;
    if (s.rpe != null) return s.rpe >= 7;
    return (s.weight as number) >= 0.9 * (top.get(s.exerciseId ?? "") as number);
  });
}
