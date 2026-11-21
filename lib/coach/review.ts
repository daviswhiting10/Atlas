/**
 * Judging a finished session against what the coach prescribed, set by set. Each set is measured against
 * its own prescription (set 1 of 95 lb, set 3 of 115 lb), never against the first set's, so a heavier planned
 * set doesn't read as "short". Pure: no I/O.
 *
 *   skipped  no logged set (or one with no reps)
 *   beat     heavier than planned (at the planned reps or more), or more reps than the top of the range
 *   short    fewer reps than the bottom of the range, or lighter than planned
 *   met      anything else, including heavier than planned but under the rep floor (reps traded for weight)
 *
 * Sets she added beyond the plan are not counted: the plan is the yardstick.
 */

import type { PrescribedSet } from "@/lib/plan/prescription";

export type Outcome = "beat" | "met" | "short" | "skipped";
export type LoggedSetLike = { setNumber: number; weight: number | null; reps: number | null; completed: boolean };

export function judgeSet(plan: PrescribedSet, actual: Pick<LoggedSetLike, "weight" | "reps" | "completed"> | undefined): Outcome {
  if (!actual || !actual.completed || actual.reps == null || actual.reps <= 0) return "skipped";
  const w0 = typeof plan.weight === "number" && plan.weight > 0 ? plan.weight : null;
  const w1 = actual.weight ?? 0;
  const reps = actual.reps;
  const rmin = typeof plan.repMin === "number" && plan.repMin > 0 ? plan.repMin : null;
  const rmax = typeof plan.repMax === "number" && plan.repMax > 0 ? plan.repMax : null;

  const heavier = w0 != null && w1 > w0;
  const lighter = w0 != null && w1 < w0;
  const underFloor = rmin != null && reps < rmin;
  const overTop = rmax != null && reps > rmax;

  if (heavier && !underFloor) return "beat";
  if (overTop && !lighter) return "beat";
  if (lighter || (underFloor && !heavier)) return "short";
  return "met";
}

export type ReviewedSet = { n: number; plan: PrescribedSet; actual: { weight: number | null; reps: number | null } | null; outcome: Outcome };
export type ReviewedExercise = { name: string; note: string | null; sets: ReviewedSet[] };
export type Review = {
  /** Sets in the plan for this workout. */
  planned: number;
  counts: Record<Outcome, number>;
  /** Beat plus met: sets done as planned or better. */
  onPlan: number;
  exercises: ReviewedExercise[];
};

export function reviewSession(exercises: Array<{ name: string; note?: string | null; prescribedSets: PrescribedSet[]; sets: LoggedSetLike[] }>): Review {
  const reviewed: ReviewedExercise[] = exercises.map((e) => ({
    name: e.name,
    note: e.note ?? null,
    sets: e.prescribedSets.map((plan, i) => {
      const n = plan && typeof (plan as { setNumber?: number }).setNumber === "number" ? (plan as { setNumber: number }).setNumber : i + 1;
      const a = e.sets.find((s) => s.setNumber === n);
      return { n, plan, actual: a ? { weight: a.weight, reps: a.reps } : null, outcome: judgeSet(plan, a) };
    }),
  }));
  const counts: Record<Outcome, number> = { beat: 0, met: 0, short: 0, skipped: 0 };
  for (const e of reviewed) for (const s of e.sets) counts[s.outcome]++;
  return { planned: counts.beat + counts.met + counts.short + counts.skipped, counts, onPlan: counts.beat + counts.met, exercises: reviewed };
}

/** The sets that need a look, grouped by exercise and outcome ("all 3 sets", "set 3", "sets 1–2"); on-plan sets are left out. */
export type ExceptionGroup = { kind: Exclude<Outcome, "met">; exercise: string; sets: ReviewedSet[]; total: number };

export function exceptionGroups(review: Review): ExceptionGroup[] {
  const out: ExceptionGroup[] = [];
  for (const kind of ["beat", "short", "skipped"] as const) {
    for (const e of review.exercises) {
      const sets = e.sets.filter((s) => s.outcome === kind);
      if (sets.length > 0) out.push({ kind, exercise: e.name, sets, total: e.sets.length });
    }
  }
  return out;
}

/** "all 3 sets", "set 3" or "sets 1–2". */
export function setRange(ns: number[], total: number): string {
  if (ns.length === total && total > 1) return `all ${total} sets`;
  if (ns.length === 1) return `set ${ns[0]}`;
  return `sets ${ns[0]}–${ns[ns.length - 1]}`;
}

type PointLike = { date: string; weight: number | null; reps: number; e1rm: number | null; record: boolean; best: boolean };

/** Lifts whose best (a weight record or a new best estimated max) came in the session on `day`. */
export function sessionPrs(exercises: Array<{ name: string; loaded: boolean; series: PointLike[] }>, day: string): Array<{ name: string; value: number }> {
  const out: Array<{ name: string; value: number }> = [];
  for (const e of exercises) {
    const p = e.series.find((x) => x.date === day && (x.record || x.best));
    if (!p) continue;
    const value = e.loaded && p.e1rm != null ? Math.round(p.e1rm) : p.reps;
    out.push({ name: e.name, value });
  }
  return out;
}
