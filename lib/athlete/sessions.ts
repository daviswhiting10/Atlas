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

/** The first of these zones the runtime knows (in the order given), else UTC. */
export function firstZone(...zones: Array<string | null | undefined>): string {
  for (const z of zones) if (z && safeTimeZone(z) === z) return z;
  return "UTC";
}

/**
 * An IANA zone name ("America/New_York", "UTC") the runtime knows, in its canonical spelling; null for anything else
 * (a typo, an offset like "+05:00", junk). For a zone that is saved, not just used for one request.
 */
export function ianaZone(raw: unknown): string | null {
  if (typeof raw !== "string" || raw.length > 64 || !/^[A-Za-z][A-Za-z0-9_+-]*(\/[A-Za-z0-9_+-]+){0,2}$/.test(raw)) return null;
  try {
    return new Intl.DateTimeFormat("en-CA", { timeZone: raw }).resolvedOptions().timeZone;
  } catch {
    return null;
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
const usable = (s: { sets: LoggedSet[] }) => s.sets.some((x) => x.completed && x.reps != null && x.reps > 0);

export function referenceSession<T extends { deload: boolean; sets: LoggedSet[] }>(sessions: T[]): T | null {
  const counted = sessions.filter(usable);
  return [...counted].reverse().find((s) => !s.deload) ?? counted[counted.length - 1] ?? null;
}

/**
 * The counted session before the reference one (same rule, never a lighter
 * week): "two sessions in a row at the top" is judged on these two. Null when
 * the reference is itself a lighter-week fallback or there is nothing earlier.
 */
export function sessionBefore<T extends { deload: boolean; sets: LoggedSet[] }>(sessions: T[], ref: T | null): T | null {
  if (!ref || ref.deload) return null;
  const i = sessions.indexOf(ref);
  return [...sessions.slice(0, i)].reverse().find((s) => !s.deload && usable(s)) ?? null;
}
