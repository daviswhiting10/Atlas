/**
 * Calendar-day arithmetic on "yyyy-mm-dd" strings, so no midnight-UTC bug can
 * creep in. Pure: no I/O.
 */

import { dayToDate } from "@/lib/sessions/day";

const DAY_MS = 86_400_000;

export function addDays(day: string, n: number): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Whole days from a to b (negative if b is earlier). */
export const daysBetween = (a: string, b: string): number => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / DAY_MS);

/** Every day from `from` to `to`, inclusive. */
export function eachDay(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}

/** A moment late on `day` in the timezone (11pm, give or take a daylight-saving hour): safely inside that day. */
export const endOfDay = (day: string, timeZone: string): Date => new Date(dayToDate(day, timeZone).getTime() + 11 * 3_600_000);
