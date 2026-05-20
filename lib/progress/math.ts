/**
 * Pure math for progress tracking. No I/O, no DB.
 * All weight values are in lb unless noted as Kg in the param name.
 */

export type SetRecord = {
  weight: number | null; // lb; null = bodyweight
  reps: number | null;
  completed: boolean;
};

// ── e1RM ─────────────────────────────────────────────────────────────────────
// Epley formula. Reps capped at 12 — extrapolation above 12 is unreliable.
// Returns null for bodyweight sets (no weight) or 0 reps.
export function e1RM(weight: number, reps: number): number {
  const cappedReps = Math.min(reps, 12);
  return weight * (1 + cappedReps / 30);
}

export function bestE1RM(sets: SetRecord[]): number | null {
  let best: number | null = null;
  for (const s of sets) {
    if (!s.completed || s.weight == null || s.reps == null || s.reps <= 0) continue;
    const v = e1RM(s.weight, s.reps);
    if (best == null || v > best) best = v;
  }
  return best;
}

export function isEnduranceSet(reps: number): boolean {
  return reps > 12;
}

// ── Volume (tonnage) ──────────────────────────────────────────────────────────
// Sum of weight × reps for all completed weighted sets.
export function sessionVolume(sets: SetRecord[]): number {
  return sets.reduce((sum, s) => {
    if (!s.completed || s.weight == null || s.reps == null) return sum;
    return sum + s.weight * s.reps;
  }, 0);
}

// ── Weight trend EMA ─────────────────────────────────────────────────────────
// Exponential moving average over body weight readings. Default period = 7.
// Returns readings sorted by date, each annotated with the running EMA.
export function weightTrendEMA(
  readings: Array<{ date: Date; weightKg: number }>,
  period = 7
): Array<{ date: Date; weightKg: number; ema: number }> {
  if (readings.length === 0) return [];
  const sorted = [...readings].sort((a, b) => a.date.getTime() - b.date.getTime());
  const alpha = 2 / (period + 1);
  let ema = sorted[0].weightKg;
  return sorted.map((r) => {
    ema = alpha * r.weightKg + (1 - alpha) * ema;
    return { date: r.date, weightKg: r.weightKg, ema };
  });
}

// ── Strength composite ────────────────────────────────────────────────────────
// Average % change in e1RM across the provided key lifts.
// Returns null if no valid baseline exists.
export function strengthComposite(
  lifts: Array<{ baselineE1RM: number | null; currentE1RM: number | null }>
): number | null {
  const valid = lifts.filter(
    (l): l is { baselineE1RM: number; currentE1RM: number } =>
      l.baselineE1RM != null && l.baselineE1RM > 0 && l.currentE1RM != null
  );
  if (valid.length === 0) return null;
  const changes = valid.map((l) => ((l.currentE1RM - l.baselineE1RM) / l.baselineE1RM) * 100);
  return changes.reduce((a, b) => a + b, 0) / changes.length;
}

// ── Weekly bucketing ──────────────────────────────────────────────────────────
// Returns the ISO Monday for any given date (UTC).
export function weekStart(date: Date): Date {
  const d = new Date(date);
  const day = d.getUTCDay(); // 0=Sun
  const diff = (day + 6) % 7; // days since Monday
  d.setUTCDate(d.getUTCDate() - diff);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}
