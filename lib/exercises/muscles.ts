/**
 * Muscle groups for weekly volume. An exercise's first primary muscle
 * decides its group; each set counts once there. Conditioning (bike, sled,
 * ropes) and mobility (stretches, foam rolling) are kept out of volume.
 *
 * Pure: no I/O.
 */

export const MUSCLE_GROUPS = ["Chest", "Back", "Shoulders", "Arms", "Quads", "Hamstrings", "Glutes & hips", "Calves", "Core"] as const;
export type MuscleGroup = (typeof MUSCLE_GROUPS)[number];
export type ExerciseGroup = MuscleGroup | "Conditioning" | "Mobility";

const BY_WORD: Record<string, ExerciseGroup> = {
  chest: "Chest", pecs: "Chest",
  lats: "Back", "middle back": "Back", "lower back": "Back", traps: "Back", back: "Back", neck: "Back",
  shoulders: "Shoulders", delts: "Shoulders",
  biceps: "Arms", triceps: "Arms", forearms: "Arms", arms: "Arms",
  quadriceps: "Quads", quads: "Quads",
  hamstrings: "Hamstrings",
  glutes: "Glutes & hips", abductors: "Glutes & hips", adductors: "Glutes & hips", hips: "Glutes & hips",
  calves: "Calves",
  abdominals: "Core", core: "Core", obliques: "Core", abs: "Core",
  conditioning: "Conditioning",
  mobility: "Mobility",
};

/** The stored word for each group, when a group is assigned by hand. */
export const GROUP_WORD: Record<ExerciseGroup, string> = {
  Chest: "chest", Back: "middle back", Shoulders: "shoulders", Arms: "biceps", Quads: "quadriceps", Hamstrings: "hamstrings",
  "Glutes & hips": "glutes", Calves: "calves", Core: "abdominals", Conditioning: "conditioning", Mobility: "mobility",
};

/** The group an exercise's sets count toward, or null when its muscles aren't known. */
export function exerciseGroup(primaryMuscles: unknown): ExerciseGroup | null {
  if (!Array.isArray(primaryMuscles)) return null;
  for (const m of primaryMuscles) {
    const g = typeof m === "string" ? BY_WORD[m.trim().toLowerCase()] : undefined;
    if (g) return g;
  }
  return null;
}

/** Counted in weekly volume: a muscle group, not conditioning or mobility. */
export const countsTowardVolume = (g: ExerciseGroup | null): g is MuscleGroup => g != null && g !== "Conditioning" && g !== "Mobility";
