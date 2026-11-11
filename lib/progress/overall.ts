/**
 * Overall progress: one number, and one line, for "am I getting stronger?"
 * across every lift at once.
 *
 * Each lift is measured against its own first session: estimated 1-rep max
 * for weighted lifts, best reps for bodyweight work. Week by week, each lift
 * contributes its latest value so far as a % change from its start, and the
 * line is the average across lifts. Lighter weeks are left out, and a lift
 * needs two sessions before it says anything about progress.
 *
 * Pure: no I/O.
 */

import type { SessionPoint } from "@/lib/plan/overload";
import { mondayOf } from "@/lib/athlete/sessions";

export type OverallPoint = { week: string; pct: number; lifts: number };
export type Overall = {
  points: OverallPoint[];
  /** % change across lifts at the latest week; null without enough data. */
  change: number | null;
  /** Lifts counted in the latest week. */
  lifts: number;
  /** First week of the line (yyyy-mm-dd, a Monday). */
  since: string | null;
};

type Lift = { series: SessionPoint[]; loaded: boolean };

export function overallProgress(lifts: Lift[]): Overall {
  const tracks = lifts.flatMap((l) => {
    const pts = l.series
      .filter((p) => !p.deload)
      .map((p) => ({ week: mondayOf(p.date), value: l.loaded ? p.e1rm : p.reps }))
      .filter((p): p is { week: string; value: number } => p.value != null && p.value > 0)
      .sort((a, b) => a.week.localeCompare(b.week));
    if (pts.length < 2) return [];
    // The last value in each week stands for that week.
    const byWeek = new Map<string, number>();
    for (const p of pts) byWeek.set(p.week, p.value);
    return [{ start: pts[0].week, base: pts[0].value, byWeek }];
  });
  if (tracks.length === 0) return { points: [], change: null, lifts: 0, since: null };

  const weeks = Array.from(new Set(tracks.flatMap((t) => Array.from(t.byWeek.keys())))).sort();
  const latest = tracks.map(() => null as number | null);
  const points: OverallPoint[] = [];
  for (const week of weeks) {
    let sum = 0;
    let n = 0;
    tracks.forEach((t, i) => {
      const v = t.byWeek.get(week);
      if (v != null) latest[i] = v;
      if (latest[i] != null && t.start <= week) {
        sum += (latest[i] as number) / t.base - 1;
        n += 1;
      }
    });
    if (n > 0) points.push({ week, pct: Math.round((sum / n) * 1000) / 10, lifts: n });
  }

  const last = points[points.length - 1];
  return { points, change: last ? last.pct : null, lifts: last?.lifts ?? 0, since: points[0]?.week ?? null };
}
