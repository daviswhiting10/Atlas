/**
 * The day a session was done, as a stored instant.
 *
 * Sessions are read back as a calendar day in the viewer's timezone
 * (localDay in lib/athlete/sessions.ts), so a picked "2026-11-13" must be
 * saved as an instant that falls on Nov 13 there. `new Date("2026-11-13")`
 * is midnight UTC, which is still Nov 12 in New York: a workout logged
 * today showed up as yesterday. Noon in the viewer's timezone is safe
 * everywhere, daylight-saving shifts included.
 *
 * Pure: no I/O.
 */

/** Milliseconds the timezone is ahead of UTC at the given instant. */
function offsetMs(at: Date, timeZone: string): number {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", { timeZone, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" })
      .formatToParts(at)
      .map((x) => [x.type, x.value])
  );
  const asUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
  return asUtc - Math.floor(at.getTime() / 1000) * 1000;
}

/** Noon on `day` (YYYY-MM-DD) in `timeZone`, as an instant. Throws on a day that isn't a real date. */
export function dayToDate(day: string, timeZone: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
  if (!m) throw new Error("Not a YYYY-MM-DD day");
  const [y, mo, d] = [+m[1], +m[2], +m[3]];
  const noonUtc = new Date(Date.UTC(y, mo - 1, d, 12));
  if (noonUtc.getUTCMonth() !== mo - 1 || noonUtc.getUTCDate() !== d) throw new Error("Not a real date");
  return new Date(noonUtc.getTime() - offsetMs(noonUtc, timeZone));
}
