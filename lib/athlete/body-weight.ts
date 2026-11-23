/**
 * Body weight over time, for the Progress section. Stored in Measurement (kilograms, like every measurement);
 * shown in pounds, like every weight in Atlas. The chart's numbers are worked out here, from plain points, so the
 * demo's fixed data draws the same section.
 */

export type BodyWeightPoint = { day: string; lb: number };

export const LB_PER_KG = 2.20462;
export const MIN_LB = 50;
export const MAX_LB = 800;

export const kgToLb = (kg: number) => Math.round(kg * LB_PER_KG * 10) / 10;
export const lbToKg = (lb: number) => lb / LB_PER_KG;

/** One point per day (the last entry that day wins), oldest first. */
export function dailyPoints(rows: Array<{ measuredAt: Date; bodyWeightKg: number | null }>, timeZone = "UTC"): BodyWeightPoint[] {
  const byDay = new Map<string, number>();
  const fmt = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" });
  for (const r of [...rows].sort((a, b) => a.measuredAt.getTime() - b.measuredAt.getTime())) {
    if (r.bodyWeightKg == null || !Number.isFinite(r.bodyWeightKg)) continue;
    byDay.set(fmt.format(r.measuredAt), kgToLb(r.bodyWeightKg));
  }
  return Array.from(byDay, ([day, lb]) => ({ day, lb }));
}

/** The section's numbers: latest, first, change, and the y range the chart draws (padded, never flat). */
export function bodyWeightSummary(points: BodyWeightPoint[]) {
  if (points.length === 0) return null;
  const first = points[0];
  const latest = points[points.length - 1];
  const values = points.map((p) => p.lb);
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const pad = Math.max(1, (hi - lo) * 0.15);
  return {
    first,
    latest,
    change: Math.round((latest.lb - first.lb) * 10) / 10,
    min: Math.floor(lo - pad),
    max: Math.ceil(hi + pad),
  };
}
