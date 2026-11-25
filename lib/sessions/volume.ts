/**
 * "Weight lifted": weight × reps, summed over completed sets. Pure, no I/O.
 *
 * A timed exercise (a plank, a carry, a hold) and cardio keep seconds in `reps`, so weight × reps would count a 60 lb carry
 * for 45 s as 2,700 lb. Those sets add nothing here; they count by their time instead (see lib/history/work.ts).
 *
 * How a set is known to be timed, everywhere: by the prescription it was logged against (its first set's unit is "secs",
 * or the plan exercise is logged as cardio). A set with no prescription behind it (an import, a removed workout) falls back
 * to the library's unit for the exercise.
 */
import { CATALOG_BY_SLUG } from "@/lib/plan/catalog";
import { bellCount } from "@/lib/exercises/implements";

/** `implements`: bells held (2 = a dumbbell in each hand); null or missing counts as one (lib/exercises/implements.ts). */
export type VolumeSet = { weight: number | null; reps: number | null; completed?: boolean; timed?: boolean; implements?: number | null };

/**
 * Weight × reps (× bells held) of one completed, loaded, rep-based set; 0 for anything else (a timed or cardio set,
 * bodyweight, unticked). Load moved only: records, e1RM and charts stay per bell.
 */
export function setVolume(s: VolumeSet): number {
  if (s.timed || s.completed === false || s.weight == null || s.weight <= 0 || s.reps == null || s.reps <= 0) return 0;
  return s.weight * s.reps * bellCount(s.implements);
}

/** The weight lifted over a list of sets (see `setVolume`). */
export const volumeOf = (sets: VolumeSet[]): number => sets.reduce((n, s) => n + setVolume(s), 0);

/** The athlete done screen's "Weight lifted": each exercise's ticked sets, a timed one (unit "secs", cardio too) left out. */
export const loggedVolume = (exercises: Array<{ unit: "reps" | "secs"; sets: Array<{ weight: number | null; reps: number | null; done: boolean; implements?: number | null }> }>): number =>
  exercises.reduce((sum, e) => sum + volumeOf(e.sets.map((s) => ({ weight: s.weight, reps: s.reps, completed: s.done, timed: e.unit === "secs", implements: s.implements }))), 0);

/** A prescription whose reps are seconds: its first set's unit is "secs", or it is logged as cardio. */
export function timedRx(prescribedSets: unknown, mode?: string | null): boolean {
  if (mode === "CARDIO") return true;
  const first = Array.isArray(prescribedSets) ? (prescribedSets[0] as { unit?: string } | undefined) : undefined;
  return first?.unit === "secs";
}

/** Prisma select for what `isTimedSet` needs from a SetLog row (plus the exercise's slug). */
export const TIMED_SELECT = { assignedWorkoutExercise: { select: { prescribedSets: true, mode: true } } } as const;

/** Whether a logged set's reps are seconds: its prescription says so, or with none, the library's exercise does. */
export function isTimedSet(row: { assignedWorkoutExercise?: { prescribedSets: unknown; mode?: string | null } | null }, slug?: string | null): boolean {
  const awe = row.assignedWorkoutExercise;
  if (awe) return timedRx(awe.prescribedSets, awe.mode);
  return slug != null && CATALOG_BY_SLUG[slug]?.unit === "secs";
}
