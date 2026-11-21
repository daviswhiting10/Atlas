/**
 * The roster's "last session" line: "Logged today" (the day it happened, in the coach's own time zone),
 * "Yesterday", or the date ("Nov 18"; with the year when it isn't this one). Pure: no I/O.
 */

const day = (d: Date, timeZone?: string) => new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);

export type LastLogged = { label: string; today: boolean };

export function lastLogged(iso: string | Date | null | undefined, now: Date = new Date(), timeZone?: string): LastLogged | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  const was = day(date, timeZone);
  if (was === day(now, timeZone)) return { label: "Logged today", today: true };
  if (was === day(new Date(now.getTime() - 86_400_000), timeZone)) return { label: "Yesterday", today: false };
  const sameYear = was.slice(0, 4) === day(now, timeZone).slice(0, 4);
  return { label: new Intl.DateTimeFormat("en-US", { timeZone, month: "short", day: "numeric", ...(sameYear ? {} : { year: "numeric" }) }).format(date), today: false };
}
