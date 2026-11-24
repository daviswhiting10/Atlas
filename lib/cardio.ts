/**
 * The cardio numbers: distance in either unit, pace, splits. Pure: no I/O.
 *
 * Distance is stored in metres, time in seconds (a cardio set's `reps`), and a split is the seconds one mile (or one
 * kilometre) took, in order. Pace is shown per mile.
 */

export const METRES_PER_MILE = 1609.344;
export type DistanceUnit = "mi" | "km";

export const toMetres = (distance: number, unit: DistanceUnit): number => Math.round(distance * (unit === "km" ? 1000 : METRES_PER_MILE));
export const fromMetres = (metres: number, unit: DistanceUnit): number => metres / (unit === "km" ? 1000 : METRES_PER_MILE);

/** Seconds per mile, or null when there is no distance or no time (never a made-up pace). */
export function paceSecPerMile(metres: number | null | undefined, seconds: number | null | undefined): number | null {
  if (!metres || metres <= 0 || !seconds || seconds <= 0) return null;
  return Math.round(seconds / (metres / METRES_PER_MILE));
}

/** "10:30" for 630 seconds; "1:05:00" from an hour. */
export function clock(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${String(r).padStart(2, "0")}` : `${m}:${String(r).padStart(2, "0")}`;
}

/** "10:42" or "10:42.5"-less: minutes and seconds typed as m:ss (or just minutes) into seconds; null if it isn't a time. */
export function parseClock(text: string): number | null {
  const t = text.trim();
  if (t === "") return null;
  const mmss = /^(\d{1,3}):([0-5]?\d)$/.exec(t);
  if (mmss) return Number(mmss[1]) * 60 + Number(mmss[2]);
  if (/^\d{1,4}$/.test(t)) return Number(t) * 60;
  return null;
}

/** The fastest split: its place (1-based) and seconds, or null with none. */
export function bestSplit(splits: number[]): { index: number; seconds: number } | null {
  if (splits.length === 0) return null;
  let at = 0;
  splits.forEach((s, i) => {
    if (s < splits[at]) at = i;
  });
  return { index: at + 1, seconds: splits[at] };
}

/** A set's `splits` JSON read back: a list of positive whole seconds, or nothing. Anything else is dropped, not guessed. */
export function readSplits(json: unknown): number[] {
  return Array.isArray(json) ? json.filter((n): n is number => typeof n === "number" && Number.isFinite(n) && n > 0).map(Math.round) : [];
}
