/**
 * Pure derivations over logged sets — no I/O. Personal records, volume by
 * muscle, and the deterministic recommendation assembly all live here so
 * they are unit-tested against fixtures.
 */

import { bestE1RM, e1RM, sessionVolume } from "@/lib/progress/math";
import { suggestNext, type LoadType, type ProgressionSuggestion } from "@/lib/progression";
import { detectPlateau, holdStreak, type PlateauResult } from "@/lib/progress/plateau";
import { localDay, mondayOf } from "@/lib/athlete/sessions";

export type DerivedSet = {
  exerciseId: string;
  exerciseName: string;
  movementPattern: string;
  primaryMuscles: string[];
  secondaryMuscles: string[];
  setNumber: number;
  weight: number | null;
  bandColor: string | null;
  reps: number | null;
  rpe: number | null;
  completed: boolean;
  workoutLogId: string;
  date: Date;
  deload: boolean;
};

export type ExerciseSession = {
  workoutLogId: string;
  /** yyyy-mm-dd in the caller's timezone */
  date: string;
  deload: boolean;
  sets: DerivedSet[];
};

export type ExerciseHistory = {
  exerciseId: string;
  name: string;
  movementPattern: string;
  sessions: ExerciseSession[];
};

const round1 = (n: number) => Math.round(n * 10) / 10;

/** Group rows into exercise → sessions (oldest first). */
export function groupByExercise(rows: DerivedSet[], timeZone: string): ExerciseHistory[] {
  const byExercise = new Map<string, ExerciseHistory & { index: Map<string, ExerciseSession> }>();
  for (const r of rows) {
    let ex = byExercise.get(r.exerciseId);
    if (!ex) {
      ex = { exerciseId: r.exerciseId, name: r.exerciseName, movementPattern: r.movementPattern, sessions: [], index: new Map() };
      byExercise.set(r.exerciseId, ex);
    }
    let session = ex.index.get(r.workoutLogId);
    if (!session) {
      session = { workoutLogId: r.workoutLogId, date: localDay(r.date, timeZone), deload: r.deload, sets: [] };
      ex.index.set(r.workoutLogId, session);
      ex.sessions.push(session);
    }
    session.sets.push(r);
  }
  return Array.from(byExercise.values()).map(({ exerciseId, name, movementPattern, sessions }) => ({
    exerciseId,
    name,
    movementPattern,
    sessions: [...sessions].sort((a, b) => a.date.localeCompare(b.date)),
  }));
}

/** One session reduced to the numbers a chart or a plateau check needs. */
export function summarizeSession(session: ExerciseSession) {
  const done = session.sets.filter((s) => s.completed && s.reps != null && s.reps > 0);
  const weights = done.map((s) => s.weight).filter((w): w is number => w != null && w > 0);
  const best = bestE1RM(done);
  return {
    date: session.date,
    deload: session.deload,
    sets: done.length,
    topWeight: weights.length > 0 ? Math.max(...weights) : null,
    repsAtTop:
      weights.length > 0
        ? Math.max(...done.filter((s) => s.weight === Math.max(...weights)).map((s) => s.reps as number))
        : null,
    bestE1RM: best == null ? null : round1(best),
    bestReps: done.length > 0 ? Math.max(...done.map((s) => s.reps as number)) : null,
    volumeLb: Math.round(sessionVolume(done)),
  };
}

// ── Personal records ────────────────────────────────────────────────────────

export type PersonalRecord = {
  exerciseId: string;
  exercise: string;
  maxWeight: { lb: number; reps: number; date: string } | null;
  maxE1RM: { lb: number; fromWeight: number; fromReps: number; date: string } | null;
  /** For exercises never loaded: the most reps in one set. */
  maxReps: { reps: number; date: string } | null;
};

/**
 * Best lifts, computed straight from the logged sets. Milestone rows are
 * achievements, not a record of best lifts, so they never feed this.
 */
export function personalRecords(histories: ExerciseHistory[]): PersonalRecord[] {
  return histories
    .map((h) => {
      let maxWeight: PersonalRecord["maxWeight"] = null;
      let maxE1RM: PersonalRecord["maxE1RM"] = null;
      let maxReps: PersonalRecord["maxReps"] = null;
      for (const session of h.sessions) {
        for (const s of session.sets) {
          if (!s.completed || s.reps == null || s.reps <= 0) continue;
          if (s.weight != null && s.weight > 0) {
            if (!maxWeight || s.weight > maxWeight.lb || (s.weight === maxWeight.lb && s.reps > maxWeight.reps)) {
              maxWeight = { lb: s.weight, reps: s.reps, date: session.date };
            }
            const est = round1(e1RM(s.weight, s.reps));
            if (!maxE1RM || est > maxE1RM.lb) maxE1RM = { lb: est, fromWeight: s.weight, fromReps: s.reps, date: session.date };
          } else if (!maxReps || s.reps > maxReps.reps) {
            maxReps = { reps: s.reps, date: session.date };
          }
        }
      }
      return { exerciseId: h.exerciseId, exercise: h.name, maxWeight, maxE1RM, maxReps: maxWeight ? null : maxReps };
    })
    .filter((r) => r.maxWeight || r.maxReps)
    .sort((a, b) => (b.maxE1RM?.lb ?? 0) - (a.maxE1RM?.lb ?? 0) || a.exercise.localeCompare(b.exercise));
}

// ── Volume ──────────────────────────────────────────────────────────────────

export type VolumeWeek = {
  /** Monday of the week, yyyy-mm-dd */
  week: string;
  tonnageLb: number;
  sets: number;
  /** Bodyweight and band sets: they count as work but add no tonnage. */
  unloadedSets: number;
  byMuscle: Record<string, { tonnageLb: number; sets: number }>;
};

export type Trend = "rising" | "flat" | "falling" | "insufficient_data";

export function volumeByWeek(rows: DerivedSet[], timeZone: string): VolumeWeek[] {
  const weeks = new Map<string, VolumeWeek>();
  for (const r of rows) {
    if (!r.completed || r.reps == null || r.reps <= 0) continue;
    const key = mondayOf(localDay(r.date, timeZone));
    let w = weeks.get(key);
    if (!w) {
      w = { week: key, tonnageLb: 0, sets: 0, unloadedSets: 0, byMuscle: {} };
      weeks.set(key, w);
    }
    const tonnage = r.weight != null && r.weight > 0 ? r.weight * r.reps : 0;
    w.sets += 1;
    w.tonnageLb += tonnage;
    if (tonnage === 0) w.unloadedSets += 1;
    for (const muscle of r.primaryMuscles.length > 0 ? r.primaryMuscles : ["unspecified"]) {
      const m = (w.byMuscle[muscle] ??= { tonnageLb: 0, sets: 0 });
      m.tonnageLb += tonnage;
      m.sets += 1;
    }
  }
  return Array.from(weeks.values())
    .sort((a, b) => a.week.localeCompare(b.week))
    .map((w) => ({
      ...w,
      tonnageLb: Math.round(w.tonnageLb),
      byMuscle: Object.fromEntries(Object.entries(w.byMuscle).map(([k, v]) => [k, { tonnageLb: Math.round(v.tonnageLb), sets: v.sets }])),
    }));
}

/** Compare the later half of a series with the earlier half. ±5% counts as flat. */
export function trendOf(values: number[]): Trend {
  if (values.length < 4) return "insufficient_data";
  const half = Math.floor(values.length / 2);
  const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
  const before = avg(values.slice(0, half));
  const after = avg(values.slice(values.length - half));
  if (before === 0) return after > 0 ? "rising" : "flat";
  const change = (after - before) / before;
  return change > 0.05 ? "rising" : change < -0.05 ? "falling" : "flat";
}

/** Per-muscle direction of weekly set counts (sets, not tonnage, so bodyweight work counts). */
export function muscleTrends(weeks: VolumeWeek[]): Record<string, Trend> {
  const muscles = new Set(weeks.flatMap((w) => Object.keys(w.byMuscle)));
  return Object.fromEntries(Array.from(muscles).map((m) => [m, trendOf(weeks.map((w) => w.byMuscle[m]?.sets ?? 0))]));
}

// ── Plateaus and recommendations ────────────────────────────────────────────

const LOWER_PATTERNS = new Set(["SQUAT", "HINGE", "LUNGE"]);

export function loadTypeOf(history: ExerciseHistory): LoadType {
  const loaded = history.sessions.some((s) => s.sets.some((x) => x.weight != null && x.weight > 0));
  if (!loaded) return "bodyweight";
  return LOWER_PATTERNS.has(history.movementPattern) ? "lower" : "upper";
}

/** The rep target a session is judged against: the plan's, or the least the athlete did that day. */
function prescribedReps(session: ExerciseSession, planned: number | null | undefined): number {
  if (planned != null && planned > 0) return planned;
  const reps = session.sets.filter((s) => s.completed && s.reps != null).map((s) => s.reps as number);
  return reps.length > 0 ? Math.min(...reps) : 1;
}

function verdictAfter(session: ExerciseSession, history: ExerciseHistory, goal: string, planned: number | null | undefined): ProgressionSuggestion {
  return suggestNext({
    lastSets: session.sets.map((s) => ({ weight: s.weight, reps: s.reps, rpe: s.rpe, completed: s.completed })),
    prescribedReps: prescribedReps(session, planned),
    goal,
    exerciseLoadType: loadTypeOf(history),
  });
}

export type PlateauReport = PlateauResult & {
  exerciseId: string;
  exercise: string;
  /** Consecutive "hold" verdicts from the progression engine, most recent backwards. */
  holdStreak: number;
  confidence: "high" | "normal" | null;
};

export function plateauReport(
  history: ExerciseHistory,
  opts: { today: string; goal: string; plannedReps?: number | null }
): PlateauReport {
  const summaries = history.sessions.map(summarizeSession);
  const result = detectPlateau(
    summaries.map((s) => ({ date: s.date, topWeight: s.topWeight, bestE1RM: s.bestE1RM, repsAtTop: s.repsAtTop, deload: s.deload })),
    opts.today
  );
  const counted = history.sessions.filter((s) => !s.deload);
  const streak = holdStreak(counted.slice(-5).map((s) => verdictAfter(s, history, opts.goal, opts.plannedReps).type));
  return {
    exerciseId: history.exerciseId,
    exercise: history.name,
    ...result,
    holdStreak: streak,
    confidence: result.plateaued ? (streak >= 2 ? "high" : "normal") : null,
  };
}

export type Recommendation = {
  exerciseId: string;
  exercise: string;
  action: ProgressionSuggestion["type"];
  suggestedWeightLb: number | null;
  suggestedReps: number | null;
  reasoning: string;
  plateaued: boolean | null;
  volumeTrend: Trend;
};

/**
 * Deterministic: each field comes from the progression engine, the plateau
 * detector or the volume aggregation. No model call, no invented prose.
 */
export function recommend(
  histories: ExerciseHistory[],
  opts: { today: string; goal: string; plannedReps: Record<string, number | null>; muscleTrend: Record<string, Trend>; primaryMuscle: Record<string, string | undefined> }
): Recommendation[] {
  return histories.flatMap((h) => {
    const reference = [...h.sessions].reverse().find((s) => !s.deload) ?? h.sessions[h.sessions.length - 1];
    if (!reference) return [];
    const planned = opts.plannedReps[h.exerciseId];
    const suggestion = verdictAfter(reference, h, opts.goal, planned);
    const plateau = plateauReport(h, { today: opts.today, goal: opts.goal, plannedReps: planned });
    const muscle = opts.primaryMuscle[h.exerciseId];
    return [
      {
        exerciseId: h.exerciseId,
        exercise: h.name,
        action: suggestion.type,
        suggestedWeightLb: suggestion.weight,
        suggestedReps: suggestion.reps,
        reasoning: suggestion.reasoning,
        plateaued: plateau.plateaued,
        volumeTrend: (muscle && opts.muscleTrend[muscle]) || "insufficient_data",
      },
    ];
  });
}
