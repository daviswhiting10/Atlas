/**
 * Time-based sets. A set's time is stored in seconds (SetLog.reps, prescribedSets repMin/repMax with unit "secs");
 * this file is only how it is shown, typed and stepped. One m:ss field instead of a count of seconds.
 */

/** Four hours: a ceiling for a typed time, not a target. */
export const MAX_SECONDS = 4 * 3600;

/** Where the stepper's step grows from 30 s to 1 min. */
export const STEP_BREAK = 600;

/** 0 → "0:00", 45 → "0:45", 900 → "15:00", 3725 → "1:02:05". */
export function formatClock(secs: number | null | undefined): string {
  if (secs == null || !Number.isFinite(secs)) return "";
  const t = Math.max(0, Math.round(secs));
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const s = t % 60;
  const ss = String(s).padStart(2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${ss}` : `${m}:${ss}`;
}

/** What a typed time means when it is a bare number: minutes for steady cardio, seconds for a hold. */
export type BareUnit = "min" | "sec";

/**
 * Typed entry → seconds, or null when it isn't a time yet.
 *   "15:30" "15.30" "15 30" → 15 min 30 s   "1:5" → 1:05
 *   "15 min" "15m" → 900     "90s" "90 sec" → 90
 *   "15" → 15 min or 15 s, by `bare`        "900" → 900 s (a bare number above 240 can't be minutes)
 */
export function parseClock(text: string, bare: BareUnit = "sec"): number | null {
  const t = text.trim().toLowerCase();
  if (!t) return null;
  let secs: number | null = null;
  let m = t.match(/^(\d{1,3})\s*[:.\s]\s*(\d{1,2})$/);
  if (m) {
    const s = Number(m[2]);
    if (s > 59) return null;
    secs = Number(m[1]) * 60 + s;
  } else if ((m = t.match(/^(\d{1,3}(?:\.\d+)?)\s*(?:m|min|mins|minute|minutes)$/))) {
    secs = Math.round(Number(m[1]) * 60);
  } else if ((m = t.match(/^(\d{1,5})\s*(?:s|sec|secs|second|seconds)$/))) {
    secs = Number(m[1]);
  } else if ((m = t.match(/^(\d{1,5})$/))) {
    const n = Number(m[1]);
    secs = bare === "min" && n <= 240 ? n * 60 : n;
  }
  if (secs == null || !Number.isFinite(secs)) return null;
  return Math.min(secs, MAX_SECONDS);
}

/** The − and + step: 30 s, and 1 min above 10 minutes. Going down from exactly 10:00 is still 30 s. */
export function stepSize(value: number, dir: 1 | -1): number {
  return dir === 1 ? (value >= STEP_BREAK ? 60 : 30) : value > STEP_BREAK ? 60 : 30;
}

/**
 * One tap of − or +. It lands on the step grid, so 0:15 goes to 0:30 and 14:10 to 15:00, never to 0:45 / 15:10.
 * Nothing yet: + gives 0:30, − stays at 0:00. Never below 0, never above MAX_SECONDS.
 */
export function bumpSeconds(value: number | null, dir: 1 | -1): number {
  if (value == null) return dir === 1 ? 30 : 0;
  const step = stepSize(value, dir);
  const next = dir === 1 ? (Math.floor(value / step) + 1) * step : (Math.ceil(value / step) - 1) * step;
  return Math.min(MAX_SECONDS, Math.max(0, next));
}

/** "45 sec", "15 min", "1:30 min", "1:02:05" for a prescription's header. */
export function durationLabel(secs: number): string {
  const t = Math.round(secs);
  if (t < 60) return `${t} sec`;
  if (t % 60 === 0 && t < 3600) return `${t / 60} min`;
  return t < 3600 ? `${formatClock(t)} min` : formatClock(t);
}

/** "30–45 sec", "5–10 min", "15 min": a range written once, with the unit once when both ends share it. */
export function durationRange(lo: number, hi: number): string {
  if (lo === hi) return durationLabel(lo);
  const a = durationLabel(lo);
  const b = durationLabel(hi);
  const ua = a.split(" ").pop();
  const ub = b.split(" ").pop();
  return ua === ub && /^\d+ /.test(a) ? `${a.split(" ")[0]}–${b}` : `${a}–${b}`;
}
