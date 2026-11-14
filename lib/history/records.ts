/**
 * Personal records over time, per exercise.
 *
 * Two measures: `weight` is the heaviest single set, and `e1rm` is the best
 * estimated 1-rep max (Epley, reps capped at 12, as lib/progress/math.ts does).
 * Walking the finished sessions in the order they were done:
 *
 * - the first session with a usable set is the baseline (`kind: "first"`),
 *   not a record, so day one doesn't fill the history with gold;
 * - a later session whose best is strictly higher than everything before it is
 *   a `record`; equal or lower is `none`.
 *
 * Because the order is the day each session was *done*, a session logged late
 * slots into its own place and can turn a later "record" into an ordinary day.
 * That is correct: the history is derived, never stored.
 *
 * Pure: no I/O.
 */

import { e1RM } from "@/lib/progress/math";
import { datedFinished, isLoggedSet } from "./days";
import type { HistorySession } from "./types";

export type PrMetric = "e1rm" | "weight";

export type PrPoint = {
  day: string;
  sessionId: string;
  /** The session's best for this exercise, in lb. */
  value: number;
  kind: "first" | "record" | "none";
  /** The running best after this session. */
  best: number;
};

export type ExercisePrs = {
  exerciseId: string;
  metric: PrMetric;
  /** One point per session that had a usable set, oldest first. */
  points: PrPoint[];
  /** Only the new records (not the baseline), oldest first. */
  records: PrPoint[];
  /** The best ever, or null if there are no points. */
  best: number | null;
};

const round1 = (n: number) => Math.round(n * 10) / 10;

/** A set's value under the metric, or null if it can't be measured (no weight, no reps). */
function setValue(metric: PrMetric, weight: number | null, reps: number | null): number | null {
  if (weight == null || weight <= 0 || reps == null || reps <= 0) return null;
  return metric === "weight" ? weight : round1(e1RM(weight, reps));
}

/**
 * Records for every exercise in `sessions` (or just `exerciseId`), keyed by
 * exercise id. Sets with no exercise id are skipped.
 */
export function prsOverTime(
  sessions: HistorySession[],
  opts: { metric: PrMetric; timeZone: string; exerciseId?: string }
): Record<string, ExercisePrs> {
  const out: Record<string, ExercisePrs> = {};
  for (const { session, day } of datedFinished(sessions, opts.timeZone)) {
    const bestInSession = new Map<string, number>();
    for (const s of session.sets) {
      if (!isLoggedSet(s) || s.exerciseId == null) continue;
      if (opts.exerciseId != null && s.exerciseId !== opts.exerciseId) continue;
      const v = setValue(opts.metric, s.weight, s.reps);
      if (v == null) continue;
      if (v > (bestInSession.get(s.exerciseId) ?? 0)) bestInSession.set(s.exerciseId, v);
    }
    for (const [exerciseId, value] of Array.from(bestInSession)) {
      const entry = (out[exerciseId] ??= { exerciseId, metric: opts.metric, points: [], records: [], best: null });
      const kind: PrPoint["kind"] = entry.best == null ? "first" : value > entry.best ? "record" : "none";
      const best = entry.best == null || value > entry.best ? value : entry.best;
      const point: PrPoint = { day, sessionId: session.id, value, kind, best };
      entry.points.push(point);
      if (kind === "record") entry.records.push(point);
      entry.best = best;
    }
  }
  return out;
}
