/**
 * Pure helpers for turning logged sessions into calendar days, plan weeks and
 * streaks. No I/O — kept apart from the queries so they can be unit-tested.
 */

import type { LoggedSet } from "@/lib/plan/overload";

export const DAY_MS = 86_400_000;

/** yyyy-mm-dd of a stored calendar date (plan slots are saved as midnight, so this is timezone-free). */
export const iso = (d: Date) => d.toISOString().slice(0, 10);

/** yyyy-mm-dd of an instant as experienced in the given timezone. */
export function localDay(d: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

/** A timezone name the runtime accepts, or UTC. */
export function safeTimeZone(raw: string | undefined | null): string {
  if (!raw) return "UTC";
  try {
    new Intl.DateTimeFormat("en-CA", { timeZone: raw });
    return raw;
  } catch {
    return "UTC";
  }
}

/** Monday (yyyy-mm-dd) of the week containing the given calendar day. */
export function mondayOf(day: string): string {
  const x = new Date(day + "T00:00:00Z");
  x.setUTCDate(x.getUTCDate() - ((x.getUTCDay() + 6) % 7));
  return iso(x);
}

/** 1-indexed plan week. Rounds to whole days first so a DST shift can't move a workout across a week. */
export function weekOf(time: number, start: number): number {
  return Math.max(1, Math.floor(Math.round((time - start) / DAY_MS) / 7) + 1);
}

/**
 * The session a new target is measured against: the latest one with a
 * completed set, skipping lighter weeks (a planned back-off is not the bar to
 * beat). Falls back to a lighter-week session if that is all there is.
 */
export function referenceSession<T extends { deload: boolean; sets: LoggedSet[] }>(sessions: T[]): T | null {
  const usable = sessions.filter((s) => s.sets.some((x) => x.completed && x.reps != null && x.reps > 0));
  return [...usable].reverse().find((s) => !s.deload) ?? usable[usable.length - 1] ?? null;
}

/**
 * Consecutive weeks with at least one session, counting back from the current
 * week. The current week doesn't break a streak just because it has no
 * session yet.
 */
export function weekStreak(weeks: Array<{ sessions: number }>): number {
  let streak = 0;
  for (let i = weeks.length - 1; i >= 0; i--) {
    if (weeks[i].sessions > 0) streak += 1;
    else if (i === weeks.length - 1) continue;
    else break;
  }
  return streak;
}
