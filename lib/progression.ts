/**
 * Progression suggestion engine — pure, no I/O, no DB.
 *
 * Given the last logged sets for an exercise, the client's goal, and whether
 * the exercise is an upper- or lower-body load, returns a weight/rep suggestion
 * and a one-line reasoning string.
 */

export type SetRecord = {
  weight: number | null;
  reps: number | null;
  rpe: number | null;
  completed: boolean;
};

export type LoadType = "upper" | "lower" | "bodyweight";

export type SuggestionType =
  | "progress"
  | "hold"
  | "deload"
  | "first_time"
  | "match_last";

export type ProgressionSuggestion = {
  /** Suggested weight in lbs. null = no weight change (use last or prescribed). */
  weight: number | null;
  /** Suggested reps override. null = use prescribed. */
  reps: number | null;
  reasoning: string;
  type: SuggestionType;
};

// ── Increment table ────────────────────────────────────────────────────────────

const INCREMENTS: Record<string, { upper: number; lower: number }> = {
  hypertrophy:  { upper: 2.5, lower: 5 },
  weight_loss:  { upper: 0,   lower: 0 },   // rep-based, not weight-based
  performance:  { upper: 5,   lower: 10 },
  general:      { upper: 2.5, lower: 2.5 },
  corrective:   { upper: 0,   lower: 0 },   // never auto-progress
  pain_mgmt:    { upper: 0,   lower: 0 },
};

// ── Helpers ────────────────────────────────────────────────────────────────────


function maxRpe(sets: SetRecord[]): number | null {
  const values = sets.map((s) => s.rpe).filter((r): r is number => r != null);
  if (values.length === 0) return null;
  return Math.max(...values);
}

function lastWeight(sets: SetRecord[]): number | null {
  const withWeight = sets.filter((s) => s.weight != null);
  return withWeight.length > 0 ? withWeight[withWeight.length - 1].weight! : null;
}

function avgReps(sets: SetRecord[]): number | null {
  const completed = sets.filter((s) => s.completed && s.reps != null);
  if (completed.length === 0) return null;
  return completed.reduce((a, s) => a + s.reps!, 0) / completed.length;
}

/** True if every completed set hit or exceeded prescribedReps. */
function repsHit(sets: SetRecord[], prescribedReps: number): boolean {
  const completed = sets.filter((s) => s.completed);
  if (completed.length === 0) return false;
  return completed.every((s) => (s.reps ?? 0) >= prescribedReps);
}

function round(value: number, nearest: number): number {
  return Math.round(value / nearest) * nearest;
}

// ── Main export ────────────────────────────────────────────────────────────────

export function suggestNext({
  lastSets,
  prescribedReps,
  goal,
  exerciseLoadType,
}: {
  lastSets: SetRecord[];
  prescribedReps: number;
  goal: string;
  exerciseLoadType: LoadType;
}): ProgressionSuggestion {
  // ── No history ──────────────────────────────────────────────────────────────
  if (lastSets.length === 0) {
    return {
      weight: null,
      reps: null,
      reasoning: "First time — start conservative and note how it feels.",
      type: "first_time",
    };
  }

  // ── Corrective / pain management — never auto-suggest ──────────────────────
  const normalizedGoal = goal.toLowerCase().replace(/[^a-z_]/g, "");
  if (normalizedGoal === "corrective" || normalizedGoal === "pain_mgmt") {
    return {
      weight: lastWeight(lastSets),
      reps: null,
      reasoning: "Match last session — no auto-progression for corrective work.",
      type: "match_last",
    };
  }

  const base = lastWeight(lastSets);
  const maxR = maxRpe(lastSets);

  // ── Deload: any set hit RPE 10 ───────────────────────────────────────────────
  if (maxR != null && maxR >= 10) {
    const deloadWeight =
      base != null ? round(base * 0.9, exerciseLoadType === "lower" ? 5 : 2.5) : null;
    return {
      weight: deloadWeight,
      reps: null,
      reasoning: "Deload: last session maxed out (RPE 10). Drop ~10% and reset.",
      type: "deload",
    };
  }

  // ── Bodyweight: weight is always null, progress via reps ────────────────────
  if (exerciseLoadType === "bodyweight") {
    const ar = avgReps(lastSets);
    const suggestedReps = ar != null ? Math.ceil(ar) + 1 : null;
    return {
      weight: null,
      reps: suggestedReps,
      reasoning:
        maxR == null
          ? "Bodyweight — aim for +1 rep (RPE not recorded last session)."
          : maxR <= 8
          ? "Bodyweight — RPE had room, add 1 rep."
          : "Bodyweight — RPE was high; match last reps.",
      type: maxR == null || maxR <= 8 ? "progress" : "hold",
    };
  }

  // ── Goal-specific logic ──────────────────────────────────────────────────────
  const inc = INCREMENTS[normalizedGoal] ?? INCREMENTS["general"];
  const increment = exerciseLoadType === "lower" ? inc.lower : inc.upper;

  // Fat loss: same weight, target +1 rep
  if (normalizedGoal === "weight_loss") {
    const ar = avgReps(lastSets);
    const suggestedReps = ar != null ? Math.round(ar) + 1 : null;
    return {
      weight: base,
      reps: suggestedReps,
      reasoning:
        maxR == null
          ? "Fat loss: same weight, aim for +1 rep (RPE not recorded)."
          : `Fat loss: same weight, aim for +1 rep (last RPE ~${maxR.toFixed(1)}).`,
      type: "progress",
    };
  }

  const hit = repsHit(lastSets, prescribedReps);

  // RPE missing — allow progression but flag uncertainty
  if (maxR == null) {
    const newWeight = base != null && hit ? base + increment : base;
    return {
      weight: newWeight,
      reps: null,
      reasoning: hit
        ? `Reps hit — try +${increment} lb. (RPE not recorded; adjust if it felt too hard.)`
        : "Reps missed last session — hold weight until all sets completed.",
      type: hit ? "progress" : "hold",
    };
  }

  // Hypertrophy / strength / general: RPE ≤ threshold AND reps hit → progress
  const rpeThreshold = normalizedGoal === "general" ? 7 : 8;

  if (maxR <= rpeThreshold && hit) {
    const newWeight = base != null ? base + increment : null;
    return {
      weight: newWeight,
      reps: null,
      reasoning: `RPE ${maxR.toFixed(1)} ≤ ${rpeThreshold} and reps hit — try +${increment} lb.`,
      type: "progress",
    };
  }

  if (!hit) {
    return {
      weight: base,
      reps: null,
      reasoning: `Reps missed last session — hold ${base != null ? `${base} lb` : "weight"} until all sets completed.`,
      type: "hold",
    };
  }

  // RPE too high (> threshold) but reps hit
  return {
    weight: base,
    reps: null,
    reasoning: `RPE ${maxR.toFixed(1)} was above ${rpeThreshold} — hold weight and nail the reps before adding load.`,
    type: "hold",
  };
}
