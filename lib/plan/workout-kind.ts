/**
 * What kind of workout a plan day is, for the Plan week grid's icon: strength (dumbbell), cardio (shoe), or mobility
 * (stretch). It comes from the exercises: each one is cardio when it is conditioning work, mobility when it is stretching
 * or foam rolling, otherwise strength (lib/exercises/muscles). The workout's kind is the one most of its exercises are;
 * a tie goes to the first exercise's kind. Warm-up and cool-down exercises don't vote while there is main work.
 * Pure: no I/O.
 */
import { exerciseGroup } from "@/lib/exercises/muscles";

export type ExerciseKind = "strength" | "cardio" | "mobility";

/** One exercise's kind, from its primary muscles. */
export function exerciseKind(primaryMuscles: unknown): ExerciseKind {
  const g = exerciseGroup(primaryMuscles);
  return g === "Conditioning" ? "cardio" : g === "Mobility" ? "mobility" : "strength";
}

const isWarm = (section: string | null | undefined) => section === "warmup" || section === "cooldown";

export function workoutKind(exercises: Array<{ kind?: ExerciseKind; section?: string | null }>): ExerciseKind {
  const main = exercises.filter((e) => !isWarm(e.section));
  const voters = main.length > 0 ? main : exercises;
  if (voters.length === 0) return "strength";
  const count: Record<ExerciseKind, number> = { strength: 0, cardio: 0, mobility: 0 };
  for (const e of voters) count[e.kind ?? "strength"]++;
  const top = Math.max(count.strength, count.cardio, count.mobility);
  const first = voters[0].kind ?? "strength";
  if (count[first] === top) return first;
  return (["strength", "cardio", "mobility"] as ExerciseKind[]).find((k) => count[k] === top) ?? "strength";
}
