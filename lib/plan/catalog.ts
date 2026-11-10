/**
 * Curated exercise catalog for the self-serve plan generator.
 *
 * Pure data — safe to import from client components. Each entry maps to a row
 * in the Exercise table by `slug`; `ensureCatalog()` (lib/plan/persist.ts)
 * creates any that are missing, so the generator never depends on the state
 * of the shared library.
 */

export type Equipment = "gym" | "dumbbells" | "bodyweight";
export type Tool = "barbell" | "dumbbell" | "machine" | "cable" | "bodyweight";
export type BodyRegion = "upper" | "lower" | "core";

export type CatalogExercise = {
  slug: string;
  name: string;
  pattern:
    | "SQUAT"
    | "HINGE"
    | "HORIZONTAL_PUSH"
    | "VERTICAL_PUSH"
    | "HORIZONTAL_PULL"
    | "VERTICAL_PULL"
    | "LUNGE"
    | "CARRY"
    | "ROTATION"
    | "ANTI_ROTATION"
    | "LOCOMOTION";
  tool: Tool;
  region: BodyRegion;
  muscles: string[];
  /** Typical working weight (lb) for an intermediate lifter. null = bodyweight. */
  base: number | null;
  /** Smallest sensible load jump in lb. */
  inc: number;
  /** Timed holds are prescribed in seconds instead of reps. */
  unit?: "secs";
};

const ex = (
  slug: string,
  name: string,
  pattern: CatalogExercise["pattern"],
  tool: Tool,
  region: BodyRegion,
  muscles: string[],
  base: number | null,
  inc: number,
  unit?: "secs"
): CatalogExercise => ({ slug, name, pattern, tool, region, muscles, base, inc, unit });

export const CATALOG: CatalogExercise[] = [
  // ── Squat ────────────────────────────────────────────────────────────────
  ex("barbell-squat", "Back Squat", "SQUAT", "barbell", "lower", ["quads", "glutes"], 185, 5),
  ex("goblet-squat", "Goblet Squat", "SQUAT", "dumbbell", "lower", ["quads", "glutes"], 50, 5),
  ex("bodyweight-squat", "Bodyweight Squat", "SQUAT", "bodyweight", "lower", ["quads", "glutes"], null, 0),
  ex("atlas-leg-press", "Leg Press", "SQUAT", "machine", "lower", ["quads", "glutes"], 270, 10),
  ex("atlas-leg-extension", "Leg Extension", "SQUAT", "machine", "lower", ["quads"], 90, 5),
  // ── Hinge ────────────────────────────────────────────────────────────────
  ex("barbell-deadlift", "Deadlift", "HINGE", "barbell", "lower", ["hamstrings", "glutes", "back"], 225, 5),
  ex("romanian-deadlift", "Romanian Deadlift", "HINGE", "barbell", "lower", ["hamstrings", "glutes"], 155, 5),
  ex("stiff-legged-dumbbell-deadlift", "Dumbbell RDL", "HINGE", "dumbbell", "lower", ["hamstrings", "glutes"], 50, 5),
  ex("barbell-hip-thrust", "Hip Thrust", "HINGE", "barbell", "lower", ["glutes"], 185, 10),
  ex("atlas-dumbbell-hip-thrust", "Dumbbell Hip Thrust", "HINGE", "dumbbell", "lower", ["glutes"], 60, 5),
  ex("single-leg-glute-bridge", "Single-Leg Glute Bridge", "HINGE", "bodyweight", "lower", ["glutes", "hamstrings"], null, 0),
  ex("atlas-leg-curl", "Leg Curl", "HINGE", "machine", "lower", ["hamstrings"], 80, 5),
  // ── Lunge ────────────────────────────────────────────────────────────────
  ex("dumbbell-lunges", "Dumbbell Lunge", "LUNGE", "dumbbell", "lower", ["quads", "glutes"], 35, 5),
  ex("split-squat-with-dumbbells", "Dumbbell Split Squat", "LUNGE", "dumbbell", "lower", ["quads", "glutes"], 30, 5),
  ex("bodyweight-walking-lunge", "Walking Lunge", "LUNGE", "bodyweight", "lower", ["quads", "glutes"], null, 0),
  ex("split-squats", "Split Squat", "LUNGE", "bodyweight", "lower", ["quads", "glutes"], null, 0),
  // ── Horizontal push ──────────────────────────────────────────────────────
  ex("barbell-bench-press-medium-grip", "Bench Press", "HORIZONTAL_PUSH", "barbell", "upper", ["chest", "triceps"], 155, 5),
  ex("dumbbell-bench-press", "Dumbbell Bench Press", "HORIZONTAL_PUSH", "dumbbell", "upper", ["chest", "triceps"], 55, 5),
  ex("incline-dumbbell-press", "Incline Dumbbell Press", "HORIZONTAL_PUSH", "dumbbell", "upper", ["upper chest", "shoulders"], 45, 5),
  ex("pushups", "Push-Up", "HORIZONTAL_PUSH", "bodyweight", "upper", ["chest", "triceps"], null, 0),
  ex("decline-push-up", "Decline Push-Up", "HORIZONTAL_PUSH", "bodyweight", "upper", ["upper chest", "shoulders"], null, 0),
  ex("push-ups-close-triceps-position", "Close-Grip Push-Up", "HORIZONTAL_PUSH", "bodyweight", "upper", ["triceps", "chest"], null, 0),
  ex("low-cable-crossover", "Cable Fly", "HORIZONTAL_PUSH", "cable", "upper", ["chest"], 25, 5),
  // ── Vertical push ────────────────────────────────────────────────────────
  ex("standing-military-press", "Overhead Press", "VERTICAL_PUSH", "barbell", "upper", ["shoulders", "triceps"], 95, 5),
  ex("dumbbell-shoulder-press", "Dumbbell Shoulder Press", "VERTICAL_PUSH", "dumbbell", "upper", ["shoulders", "triceps"], 40, 5),
  ex("atlas-pike-push-up", "Pike Push-Up", "VERTICAL_PUSH", "bodyweight", "upper", ["shoulders", "triceps"], null, 0),
  ex("side-lateral-raise", "Lateral Raise", "VERTICAL_PUSH", "dumbbell", "upper", ["shoulders"], 15, 2.5),
  ex("atlas-triceps-pushdown", "Triceps Pushdown", "VERTICAL_PUSH", "cable", "upper", ["triceps"], 50, 5),
  ex("atlas-overhead-triceps-extension", "Overhead Triceps Extension", "VERTICAL_PUSH", "dumbbell", "upper", ["triceps"], 35, 5),
  // ── Horizontal pull ──────────────────────────────────────────────────────
  ex("bent-over-barbell-row", "Barbell Row", "HORIZONTAL_PULL", "barbell", "upper", ["back", "biceps"], 135, 5),
  ex("one-arm-dumbbell-row", "One-Arm Dumbbell Row", "HORIZONTAL_PULL", "dumbbell", "upper", ["back", "biceps"], 55, 5),
  ex("seated-cable-rows", "Seated Cable Row", "HORIZONTAL_PULL", "cable", "upper", ["back", "biceps"], 120, 10),
  ex("dumbbell-incline-row", "Chest-Supported Row", "HORIZONTAL_PULL", "dumbbell", "upper", ["back", "rear delts"], 40, 5),
  ex("inverted-row", "Inverted Row", "HORIZONTAL_PULL", "bodyweight", "upper", ["back", "biceps"], null, 0),
  ex("face-pull", "Face Pull", "HORIZONTAL_PULL", "cable", "upper", ["rear delts", "upper back"], 40, 5),
  ex("seated-bent-over-rear-delt-raise", "Rear Delt Raise", "HORIZONTAL_PULL", "dumbbell", "upper", ["rear delts"], 12.5, 2.5),
  // ── Vertical pull ────────────────────────────────────────────────────────
  ex("wide-grip-lat-pulldown", "Lat Pulldown", "VERTICAL_PULL", "cable", "upper", ["lats", "biceps"], 120, 10),
  ex("pullups", "Pull-Up", "VERTICAL_PULL", "bodyweight", "upper", ["lats", "biceps"], null, 0),
  ex("chin-up", "Chin-Up", "VERTICAL_PULL", "bodyweight", "upper", ["lats", "biceps"], null, 0),
  ex("bent-arm-dumbbell-pullover", "Dumbbell Pullover", "VERTICAL_PULL", "dumbbell", "upper", ["lats", "chest"], 35, 5),
  ex("atlas-dumbbell-curl", "Dumbbell Curl", "VERTICAL_PULL", "dumbbell", "upper", ["biceps"], 25, 2.5),
  // ── Lower accessories ────────────────────────────────────────────────────
  ex("atlas-standing-calf-raise", "Standing Calf Raise", "LOCOMOTION", "machine", "lower", ["calves"], 135, 10),
  ex("atlas-dumbbell-calf-raise", "Dumbbell Calf Raise", "LOCOMOTION", "dumbbell", "lower", ["calves"], 40, 5),
  // ── Core & carries ───────────────────────────────────────────────────────
  ex("plank", "Plank", "ANTI_ROTATION", "bodyweight", "core", ["core"], null, 0, "secs"),
  ex("dead-bug", "Dead Bug", "ANTI_ROTATION", "bodyweight", "core", ["core"], null, 0),
  ex("pallof-press", "Pallof Press", "ANTI_ROTATION", "cable", "core", ["core", "obliques"], 30, 5),
  ex("russian-twist", "Russian Twist", "ROTATION", "bodyweight", "core", ["obliques"], null, 0),
  ex("atlas-hanging-knee-raise", "Hanging Knee Raise", "ANTI_ROTATION", "bodyweight", "core", ["core"], null, 0),
  ex("farmer-s-walk", "Farmer's Carry", "CARRY", "dumbbell", "core", ["grip", "core"], 60, 5, "secs"),
  ex("atlas-mountain-climber", "Mountain Climbers", "LOCOMOTION", "bodyweight", "core", ["core", "conditioning"], null, 0, "secs"),
];

export const CATALOG_BY_SLUG: Record<string, CatalogExercise> = Object.fromEntries(
  CATALOG.map((e) => [e.slug, e])
);

/** Clean display name for an exercise — falls back to the stored DB name. */
export function displayName(slug: string | null | undefined, fallback: string): string {
  return (slug && CATALOG_BY_SLUG[slug]?.name) || fallback;
}

/**
 * Movement slots. A training day is a list of slots; each slot resolves to a
 * concrete exercise depending on the equipment the athlete has.
 * `null` means the slot is skipped for that equipment tier.
 */
export type Slot =
  | "squat" | "quad" | "deadlift" | "hinge" | "glute" | "lunge" | "legcurl" | "legext" | "calf"
  | "press" | "incline" | "overhead" | "lateral" | "fly" | "triceps"
  | "row" | "row2" | "pull" | "reardelt" | "curl"
  | "core" | "core2" | "core3" | "finisher";

export const SLOTS: Record<Slot, Record<Equipment, string | null>> = {
  squat:    { gym: "barbell-squat", dumbbells: "goblet-squat", bodyweight: "bodyweight-squat" },
  quad:     { gym: "atlas-leg-press", dumbbells: "split-squat-with-dumbbells", bodyweight: "split-squats" },
  deadlift: { gym: "barbell-deadlift", dumbbells: "stiff-legged-dumbbell-deadlift", bodyweight: "single-leg-glute-bridge" },
  hinge:    { gym: "romanian-deadlift", dumbbells: "stiff-legged-dumbbell-deadlift", bodyweight: "single-leg-glute-bridge" },
  glute:    { gym: "barbell-hip-thrust", dumbbells: "atlas-dumbbell-hip-thrust", bodyweight: "single-leg-glute-bridge" },
  lunge:    { gym: "dumbbell-lunges", dumbbells: "dumbbell-lunges", bodyweight: "bodyweight-walking-lunge" },
  legcurl:  { gym: "atlas-leg-curl", dumbbells: "atlas-dumbbell-hip-thrust", bodyweight: "single-leg-glute-bridge" },
  legext:   { gym: "atlas-leg-extension", dumbbells: "split-squat-with-dumbbells", bodyweight: "split-squats" },
  calf:     { gym: "atlas-standing-calf-raise", dumbbells: "atlas-dumbbell-calf-raise", bodyweight: null },
  press:    { gym: "barbell-bench-press-medium-grip", dumbbells: "dumbbell-bench-press", bodyweight: "pushups" },
  incline:  { gym: "incline-dumbbell-press", dumbbells: "incline-dumbbell-press", bodyweight: "decline-push-up" },
  overhead: { gym: "standing-military-press", dumbbells: "dumbbell-shoulder-press", bodyweight: "atlas-pike-push-up" },
  lateral:  { gym: "side-lateral-raise", dumbbells: "side-lateral-raise", bodyweight: null },
  fly:      { gym: "low-cable-crossover", dumbbells: null, bodyweight: null },
  triceps:  { gym: "atlas-triceps-pushdown", dumbbells: "atlas-overhead-triceps-extension", bodyweight: "push-ups-close-triceps-position" },
  row:      { gym: "bent-over-barbell-row", dumbbells: "one-arm-dumbbell-row", bodyweight: "inverted-row" },
  row2:     { gym: "seated-cable-rows", dumbbells: "dumbbell-incline-row", bodyweight: "inverted-row" },
  pull:     { gym: "wide-grip-lat-pulldown", dumbbells: "bent-arm-dumbbell-pullover", bodyweight: "pullups" },
  reardelt: { gym: "face-pull", dumbbells: "seated-bent-over-rear-delt-raise", bodyweight: null },
  curl:     { gym: "atlas-dumbbell-curl", dumbbells: "atlas-dumbbell-curl", bodyweight: "chin-up" },
  core:     { gym: "plank", dumbbells: "plank", bodyweight: "plank" },
  core2:    { gym: "atlas-hanging-knee-raise", dumbbells: "dead-bug", bodyweight: "dead-bug" },
  core3:    { gym: "pallof-press", dumbbells: "russian-twist", bodyweight: "russian-twist" },
  finisher: { gym: "farmer-s-walk", dumbbells: "farmer-s-walk", bodyweight: "atlas-mountain-climber" },
};
