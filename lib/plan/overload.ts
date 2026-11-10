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
  kind: "first" | "add_weight" | "add_reps" | "hold" | "reset" | "deload";
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
  /** Which metrics set an all-time best in this session. */
  pr: Partial<Record<FocusMetric, boolean>>;
};

/** Collapse one session's sets for an exercise into a single chart point. */
export function sessionPoint(date: string, sets: LoggedSet[]): Omit<SessionPoint, "pr"> | null {
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
  };
}

/** Order points by date and flag every session that set a new best. */
export function buildSeries(points: Array<Omit<SessionPoint, "pr">>): SessionPoint[] {
  const sorted = [...points].sort((a, b) => a.date.localeCompare(b.date));
  const best: Record<FocusMetric, number> = { weight: 0, reps: 0, e1rm: 0, volume: 0 };
  return sorted.map((p, i) => {
    const pr: SessionPoint["pr"] = {};
    for (const m of ["weight", "reps", "e1rm", "volume"] as const) {
      const v = p[m] ?? 0;
      if (v > best[m]) {
        if (i > 0) pr[m] = true; // the first session is a baseline, not a record
        best[m] = v;
      }
    }
    return { ...p, pr };
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
  volume: { label: "Session volume", short: "Volume", unit: (loaded) => (loaded ? "lb" : "reps") },
};

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
