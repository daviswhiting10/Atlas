/**
 * The Strength headline for one lift: a percentage that says what it is measured on, and a line with the actual set behind it.
 *
 *  - Estimated 1RM (the default for a loaded lift): weight and reps in one number, so more reps at a lighter weight can't pass
 *    for progress. "+8% est. 1RM since Nov 21", and "185 lb × 10, up from 185 × 8."
 *  - Reps, on a loaded lift: only sessions at the same weight are compared (the latest session's weight): "+25% reps at 185 lb".
 *    With one session at that weight there is nothing to compare yet.
 *  - Reps, on a lift with no weight (bodyweight, a hold): as logged.
 *
 * Deload sessions are left out, as everywhere. Pure: no I/O.
 */
import { format, parseISO } from "date-fns";
import type { SessionPoint } from "@/lib/plan/overload";
import { durationLabel } from "@/lib/sessions/duration";

export type HeadlineMetric = "e1rm" | "reps";

export type StrengthHeadline = {
  /** The change in whole percent; null when there is nothing to compare (one session, or one at this weight). */
  pct: number | null;
  /** What it is measured on, with its baseline: "est. 1RM since Nov 21", "reps at 185 lb since Nov 21". */
  label: string;
  /** The actual best set now and at the baseline: "185 lb × 10, up from 185 × 8." */
  subtitle: string | null;
  /** The number to show when there is no percentage yet. */
  fallback: string;
  sessions: number;
};

const lb = (w: number) => `${Number.isInteger(w) ? w : w.toFixed(1)}`;
const md = (d: string) => format(parseISO(d), "MMM d");
const pct = (a: number, b: number) => (a ? Math.round(((b - a) / a) * 100) : null);
const trend = (from: number, to: number) => (to > from ? "up from" : to < from ? "down from" : "same as");

export function strengthHeadline(series: SessionPoint[], metric: HeadlineMetric, o: { loaded: boolean; timed?: boolean }): StrengthHeadline | null {
  const counted = series.filter((p) => !p.deload);
  if (counted.length === 0) return null;
  const reps = (n: number) => (o.timed ? durationLabel(n) : `${n}`);

  if (metric === "e1rm" && o.loaded) {
    const pts = counted.filter((p) => p.e1rm != null);
    if (pts.length === 0) return null;
    const first = pts[0], last = pts[pts.length - 1];
    const set = (p: SessionPoint) => ({ w: p.e1rmWeight ?? p.weight, r: p.e1rmReps ?? p.reps });
    const a = set(first), b = set(last);
    const subtitle = pts.length > 1 && a.w != null && b.w != null ? `${lb(b.w)} lb × ${b.r}, ${trend(first.e1rm as number, last.e1rm as number)} ${lb(a.w)} × ${a.r}.` : b.w != null ? `${lb(b.w)} lb × ${b.r}.` : null;
    return { pct: pts.length > 1 ? pct(first.e1rm as number, last.e1rm as number) : null, label: pts.length > 1 ? `est. 1RM since ${md(first.date)}` : "est. 1RM", subtitle, fallback: `${Math.round(last.e1rm as number)}`, sessions: pts.length };
  }

  if (o.loaded) {
    // Reps at one weight: the latest session's.
    const weighted = counted.filter((p) => p.weight != null && p.reps > 0);
    if (weighted.length === 0) return null;
    const last = weighted[weighted.length - 1];
    const W = last.weight as number;
    const same = weighted.filter((p) => p.weight === W);
    const first = same[0];
    if (same.length < 2) return { pct: null, label: `reps at ${lb(W)} lb`, subtitle: `First session at ${lb(W)} lb: ${lb(W)} lb × ${last.reps}.`, fallback: `${last.reps}`, sessions: same.length };
    return { pct: pct(first.reps, last.reps), label: `reps at ${lb(W)} lb since ${md(first.date)}`, subtitle: `${lb(W)} lb × ${last.reps}, ${trend(first.reps, last.reps)} ${lb(W)} × ${first.reps}.`, fallback: `${last.reps}`, sessions: same.length };
  }

  // No weight: the reps (or time) as logged.
  const pts = counted.filter((p) => p.reps > 0);
  if (pts.length === 0) return null;
  const first = pts[0], last = pts[pts.length - 1];
  const name = o.timed ? "time" : "reps";
  return {
    pct: pts.length > 1 ? pct(first.reps, last.reps) : null,
    label: pts.length > 1 ? `${name} since ${md(first.date)}` : name,
    subtitle: pts.length > 1 ? `${reps(last.reps)}${o.timed ? "" : " reps"}, ${trend(first.reps, last.reps)} ${reps(first.reps)}.` : null,
    fallback: reps(last.reps),
    sessions: pts.length,
  };
}
