/**
 * Progressive overload — pure, no I/O.
 *
 * `nextTarget` decides what the athlete should aim for today from what they
 * did last time (double progression). `sessionPoint` and `buildSeries` turn
 * raw set logs into the per-session numbers the charts plot.
 */

import type { FocusMetric } from "./generator";

export type LoggedSet = { weight: number | null; reps: number | null; completed: boolean };

export type Target = {
  weight: number | null;
  reps: number;
  kind: "first" | "add_weight" | "add_reps" | "hold" | "reset" | "deload" | "custom";
  headline: string;
  reason: string;
};

const round = (v: number, step: number) => (step > 0 ? Math.round(v / step) * step : v);

export function nextTarget({
  last,
  repMin,
  repMax,
  increment,
  unit = "reps",
  deload = false,
}: {
  /**
   * Sets from the reference session: the most recent one that counts.
   * Callers should skip lighter-week sessions so a deliberate back-off never
   * becomes the bar to beat. Empty = never done.
   */
  last: LoggedSet[];
  repMin: number;
  repMax: number;
  /** Load jump in lb. 0 = bodyweight / unloaded. */
  increment: number;
  unit?: "reps" | "secs";
  /** True when today falls in a lighter (deload) week. */
  deload?: boolean;
}): Target {
  const u = unit === "secs" ? "sec" : "reps";
  const done = last.filter((s) => s.completed && s.reps != null && s.reps > 0);

  if (done.length === 0) {
    return {
      weight: null,
      reps: repMin,
      kind: "first",
      headline: `Find your starting ${increment > 0 ? "weight" : "point"}`,
      reason:
        increment > 0
          ? `Pick a weight you could lift about ${repMax + 2} times. Today sets your baseline.`
          : `Stop a rep or two short of failure. Today sets your baseline.`,
    };
  }

  const topWeight = done.reduce<number | null>(
    (max, s) => (s.weight != null && (max == null || s.weight > max) ? s.weight : max),
    null
  );
  const atTop = topWeight == null ? done : done.filter((s) => s.weight === topWeight);
  const bestReps = Math.max(...atTop.map((s) => s.reps as number));

  // Lighter week: same load, stop short. No progression is asked for.
  if (deload) {
    const back = unit === "secs" ? 10 : 2;
    const reps = Math.max(unit === "secs" ? 10 : 1, bestReps - back);
    return {
      weight: topWeight,
      reps,
      kind: "deload",
      headline: topWeight == null ? `Easy ${reps} ${u}` : `${topWeight} lb × ${reps}, easy`,
      reason: `Lighter week. ${topWeight == null ? "Stop" : "Keep the weight and stop"} ${back} ${u} short of last time (${bestReps}) so you recover for the next block.`,
    };
  }

  // Unloaded or timed work: progress by reps / seconds only.
  if (topWeight == null || increment <= 0) {
    const step = unit === "secs" ? 5 : 1;
    const goal = bestReps + step;
    return {
      weight: topWeight,
      reps: goal,
      kind: "add_reps",
      headline: `Beat ${bestReps} ${u}`,
      reason: `Last time your best set was ${bestReps} ${u}. Aim for ${goal}.`,
    };
  }

  if (bestReps >= repMax) {
    const weight = Math.round((topWeight + increment) * 100) / 100;
    const reps = Math.max(repMin, repMax - 2);
    return {
      weight,
      reps,
      kind: "add_weight",
      headline: `Go up to ${weight} lb`,
      reason: `You hit ${bestReps} reps at ${topWeight} lb — the top of your range. Add ${increment} lb and aim for ${reps}.`,
    };
  }

  if (bestReps < repMin) {
    // Well short of the range — usually because the range itself moved up
    // (a rebuilt plan, a new block). Asking for the old weight at far more
    // reps would be unsafe, so work the load back from the estimated max.
    if (repMin - bestReps >= 2) {
      const est = e1rm(topWeight, bestReps);
      const weight = Math.max(increment, round(Math.floor(est / (1 + repMin / 30) / increment) * increment, increment));
      if (weight < topWeight) {
        return {
          weight,
          reps: repMin,
          kind: "reset",
          headline: `Drop to ${weight} lb`,
          reason: `Your range is now ${repMin}–${repMax} reps. Last time was ${topWeight} lb × ${bestReps}, so about ${weight} lb should get you ${repMin}.`,
        };
      }
    }
    return {
      weight: topWeight,
      reps: repMin,
      kind: "hold",
      headline: `Stay at ${topWeight} lb`,
      reason: `You got ${bestReps} reps last time. Own ${repMin} at this weight before adding more.`,
    };
  }

  const reps = Math.min(repMax, bestReps + 1);
  return {
    weight: topWeight,
    reps,
    kind: "add_reps",
    headline: `${topWeight} lb × ${reps}`,
    reason: `Same weight as last time, one more rep (${bestReps} → ${reps}). At ${repMax} you add weight.`,
  };
}

// ── Chart series ────────────────────────────────────────────────────────────

/** Epley estimated 1-rep max, reps capped at 12 where the formula stays honest. */
export function e1rm(weight: number, reps: number): number {
  return weight * (1 + Math.min(reps, 12) / 30);
}

export type SessionPoint = {
  date: string; // ISO date (yyyy-mm-dd)
  weight: number | null;
  reps: number;
  e1rm: number | null;
  volume: number;
  sets: number;
  /** Logged in a lighter (deload) week: expected to dip, and never a record. */
  deload: boolean;
  /** This session set a personal record. See `buildSeries` for the rule. */
  record: boolean;
  /**
   * A new best estimated 1-rep max that isn't a weight record: more reps at a
   * weight, or a heavier set for nearly as many. Rep progress gets credit
   * without making the (rare, gold) record ordinary.
   */
  best: boolean;
};

type RawPoint = Omit<SessionPoint, "record" | "best" | "deload"> & { deload?: boolean };

/** Collapse one session's sets for an exercise into a single chart point. */
export function sessionPoint(date: string, sets: LoggedSet[], deload = false): RawPoint | null {
  const done = sets.filter((s) => s.completed && s.reps != null && s.reps > 0);
  if (done.length === 0) return null;

  let weight: number | null = null;
  let best1rm: number | null = null;
  let volume = 0;
  for (const s of done) {
    const reps = s.reps as number;
    if (s.weight != null && s.weight > 0) {
      if (weight == null || s.weight > weight) weight = s.weight;
      const est = e1rm(s.weight, reps);
      if (best1rm == null || est > best1rm) best1rm = est;
      volume += s.weight * reps;
    } else {
      volume += reps; // bodyweight: volume is total reps
    }
  }
  const pool = weight == null ? done : done.filter((s) => s.weight === weight);
  const reps = Math.max(...pool.map((s) => s.reps as number));

  return {
    date,
    weight,
    reps,
    e1rm: best1rm == null ? null : Math.round(best1rm * 10) / 10,
    volume: Math.round(volume),
    sets: done.length,
    deload,
  };
}

/** Unloaded work counts a record each time the best set clears another step of this size. */
export const REP_RECORD_STEP = 5;

/**
 * Has this session beaten everything before it?
 *
 * A personal record is deliberately a high bar, so it stays rare:
 *  - Loaded lifts: the heaviest weight ever used on the exercise.
 *  - Bodyweight and timed work: the best set clearing another 5-rep step
 *    (10, 15, 20…). One more rep is progress, but not a record.
 * The first session is a baseline, and lighter weeks never count.
 */
export function isRecord(point: Pick<SessionPoint, "weight" | "reps">, best: { weight: number; reps: number }): boolean {
  if (point.weight != null) return point.weight > best.weight;
  return Math.floor(point.reps / REP_RECORD_STEP) > Math.floor(best.reps / REP_RECORD_STEP);
}

/** A new best estimated 1-rep max on a loaded lift (see `SessionPoint.best`). */
export function isE1rmBest(point: Pick<SessionPoint, "e1rm">, bestE1rm: number): boolean {
  return point.e1rm != null && point.e1rm > bestE1rm;
}

/** Order points by date and flag every session that set a record or a new best est. 1RM. */
export function buildSeries(points: RawPoint[]): SessionPoint[] {
  const sorted = [...points].sort((a, b) => a.date.localeCompare(b.date));
  const best = { weight: 0, reps: 0, e1rm: 0 };
  return sorted.map((p, i) => {
    const deload = p.deload === true;
    const counts = i > 0 && !deload;
    const record = counts && isRecord(p, best);
    const newBest = counts && !record && isE1rmBest(p, best.e1rm);
    if (p.weight != null) best.weight = Math.max(best.weight, p.weight);
    else best.reps = Math.max(best.reps, p.reps);
    // A lighter week can't set the bar either: it's below the best by design anyway.
    if (!deload && p.e1rm != null) best.e1rm = Math.max(best.e1rm, p.e1rm);
    return { ...p, deload, record, best: newBest };
  });
}

/** Bodyweight exercises have no load to chart — fall back to reps. */
export function metricFor(preferred: FocusMetric, series: SessionPoint[]): FocusMetric {
  const loaded = series.some((p) => p.weight != null);
  if (!loaded && (preferred === "weight" || preferred === "e1rm")) return "reps";
  return preferred;
}

export const METRICS: Record<FocusMetric, { label: string; short: string; unit: (loaded: boolean) => string }> = {
  weight: { label: "Top weight", short: "Weight", unit: () => "lb" },
  reps: { label: "Best set", short: "Reps", unit: () => "reps" },
  e1rm: { label: "Estimated 1-rep max", short: "Est. 1RM", unit: () => "lb" },
  // Volume is weight × reps summed over every set, so it runs into the
  // thousands. The unit says "total" so it is never read as a weight on the bar.
  volume: { label: "Session volume (weight × reps, all sets)", short: "Volume", unit: (loaded) => (loaded ? "lb total" : "reps total") },
};

/** Unit for a charted value. Timed holds (a plank) are measured in seconds, not reps. */
export function unitFor(metric: FocusMetric, loaded: boolean, timed = false): string {
  const unit = METRICS[metric].unit(loaded);
  return timed ? unit.replace("reps", "sec") : unit;
}

/** Volume is a per-session total, so it is drawn as bars; everything else is a trend line. */
export const chartKind = (metric: FocusMetric): "bars" | "line" => (metric === "volume" ? "bars" : "line");

// ── Formatting ──────────────────────────────────────────────────────────────

export function formatValue(v: number, metric: FocusMetric): string {
  if (metric === "volume" && v >= 10_000) return `${(v / 1000).toFixed(1)}k`;
  return Number.isInteger(v) ? v.toLocaleString() : v.toFixed(1);
}

export function targetValue(target: Target | null | undefined, metric: FocusMetric): number | null {
  if (!target) return null;
  if (metric === "reps") return target.reps;
  if (metric === "weight") return target.weight;
  if (metric === "e1rm") return target.weight == null ? null : Math.round(e1rm(target.weight, target.reps) * 10) / 10;
  return null;
}
