/**
 * Plan design rules (docs/plan-design-rules.md), as pure checks shared by the generator and the importer:
 *  A. every rep-based or timed exercise has a range (repMin < repMax), unless the plan fixes it on purpose and says so
 *     in the set's note ("fixed: 3×5"). Cardio and mobility are exempt; they have their own targets.
 *  B. every strength workout has at least one core exercise: anti-rotation, rotation or flexion, or a loaded carry.
 *     A conditioning or mobility day is exempt.
 * Pure: no I/O.
 */

import { CATALOG_BY_SLUG, type CatalogExercise } from "./catalog";
import type { Plan } from "./generator";

export type ExerciseKind = "strength" | "cardio" | "mobility";

/** The catalog's core patterns. A carry counts on its own (a farmer's or suitcase carry is the workout's core work). */
export const CORE_PATTERNS: ReadonlyArray<CatalogExercise["pattern"]> = ["ANTI_ROTATION", "ROTATION", "CARRY"];
export const isCorePattern = (pattern: CatalogExercise["pattern"]) => CORE_PATTERNS.includes(pattern);

/** Core work by its name, for exercises that don't come from the catalog (an imported plan). */
const CORE_NAME =
  /\b(planks?|dead ?bugs?|pallof|bird ?dogs?|(?:knee|leg)s? raises?|crunch\w*|ab wheel|ab roll ?outs?|roll ?outs?|sit ?-?ups?|hollow\w*|v-?ups?|russian twists?|wood ?chop\w*|l-?sits?|toes[ -]to[ -]bar|anti-?rotation\w*|carr(?:y|ies)|farmer'?s?|suitcase|side bridges?|obliques?|core|abs?)\b/i;
export const isCoreName = (name: string) => CORE_NAME.test(name);

/** Cardio by its name. Not a bare "row" or "walk": a barbell row and a farmer's walk are strength. */
const CARDIO_NAME =
  /\b(bike|cycl\w*|spin\w*|run|running|jog\w*|sprints?|rower|rowing|erg|treadmill|elliptical|stair ?(?:master|climb\w*)|swim\w*|zone ?[1-5]|z[1-5]|cardio|conditioning|ski ?erg|assault|airdyne|echo bike|hike|hiking|sled|incline walk|jump rope|skipping)\b/i;
const MOBILITY_NAME = /\b(stretch\w*|foam roll\w*|mobility|yoga|breath\w*)\b/i;

export function kindFromName(name: string): ExerciseKind {
  if (CARDIO_NAME.test(name)) return "cardio";
  if (MOBILITY_NAME.test(name)) return "mobility";
  return "strength";
}

/** A set fixed on purpose carries this in its note ("fixed: 5×5"), so the check can tell intent from a missing range. */
export const FIXED_NOTE = /^fixed\b/i;
export const fixedNote = (sets: number, value: string) => `fixed: ${sets}×${value}`;

/** Longer timed work (over two minutes) is a duration, not a hold: exempt, like cardio. */
export const LONG_SECONDS = 120;

/**
 * A lone number widened down: it becomes the top of the range. Reps: two below (10 → 8–10, 6 → 4–6). Timed work:
 * 15 s below (45 s → 30–45 s). Null when it can't or shouldn't widen: 5 reps or fewer is strength work (or an AMRAP's
 * floor) and stays fixed; a hold under 25 s or over two minutes stays as written.
 */
export function widenDown(value: number, unit: "reps" | "secs"): { repMin: number; repMax: number } | null {
  if (unit === "secs") return value >= 25 && value <= LONG_SECONDS ? { repMin: value - 15, repMax: value } : null;
  return value >= 6 ? { repMin: value - 2, repMax: value } : null;
}

export type CheckedExercise = {
  name: string;
  kind: ExerciseKind;
  core: boolean;
  unit: "reps" | "secs";
  repMin: number;
  repMax: number;
  /** The set's note; "fixed: …" marks a single number on purpose. */
  note?: string | null;
  /** "warmup" | "cooldown" don't make a day a strength workout. */
  section?: string | null;
};
export type CheckedDay = { name: string; exercises: CheckedExercise[] };

export type Violation = { kind: "no_range"; day: string; exercise: string } | { kind: "no_core"; day: string };

const exempt = (e: CheckedExercise) => e.kind !== "strength" || (e.unit === "secs" && e.repMax > LONG_SECONDS);
const isWarm = (section: string | null | undefined) => section === "warmup" || section === "cooldown";

/** Exercises without a range, and strength workouts without core work. */
export function planViolations(days: CheckedDay[]): Violation[] {
  const out: Violation[] = [];
  for (const d of days) {
    for (const e of d.exercises) {
      if (!exempt(e) && !(e.repMin < e.repMax) && !FIXED_NOTE.test((e.note ?? "").trim())) out.push({ kind: "no_range", day: d.name, exercise: e.name });
    }
    const strength = d.exercises.some((e) => e.kind === "strength" && !isWarm(e.section));
    if (strength && !d.exercises.some((e) => e.core)) out.push({ kind: "no_core", day: d.name });
  }
  return out;
}

/** A generated plan, as the rules read it: core and cardio from the catalog. */
export function generatedDays(plan: Pick<Plan, "days">): CheckedDay[] {
  return plan.days.map((d) => ({
    name: d.name,
    exercises: d.exercises.map((e) => {
      const c = CATALOG_BY_SLUG[e.slug];
      return {
        name: e.name,
        kind: c?.muscles.includes("conditioning") ? "cardio" : "strength",
        core: !!c && isCorePattern(c.pattern),
        unit: e.unit,
        repMin: e.repMin,
        repMax: e.repMax,
      };
    }),
  }));
}
