/**
 * A plan read from photos (screenshots) of a coach's program: what
 * /api/ai/program-import returns, and the library program it's saved as.
 * Shared by the photo import page and a client's Import plan.
 */

/** What the import route returns: days of sections of exercises. */
export type ImportedProgram = {
  name: string;
  description: string;
  durationWeeks: number;
  goals: string[];
  conditions: string[];
  days: Array<{
    name: string;
    dayOfWeek: number;
    order: number;
    sections: Array<{ name: string; exercises: Array<{ exerciseId: string; order: number; notes: string; prescribedSets: Array<Record<string, unknown>> }> }>;
  }>;
};

/** One block that repeats for the program's length; each day becomes a workout, sections flattened in order. */
export function toProgramBody(p: ImportedProgram) {
  return {
    name: p.name || "Imported program",
    description: p.description || null,
    goalTags: { goals: p.goals ?? [], conditions: p.conditions ?? [] },
    blocks: [
      {
        name: "Block 1",
        order: 1,
        weeks: Math.max(1, Math.round(p.durationWeeks || 1)),
        workouts: p.days.map((d, i) => ({
          name: d.name,
          dayOfWeek: Math.min(7, Math.max(1, d.dayOfWeek)),
          order: i + 1,
          exercises: d.sections
            .flatMap((section) => section.exercises.map((e) => ({ ...e, section: section.name })))
            .map((e, j) => ({
              exerciseId: e.exerciseId,
              order: j + 1,
              notes: e.notes || null,
              section: e.section,
              prescribedSets: e.prescribedSets.map((set, k) => ({ ...set, setNumber: k + 1 })),
            })),
        })),
      },
    ],
  };
}

/** Image types the photo reader takes. */
export const PHOTO_TYPES = ["image/png", "image/jpeg", "image/gif", "image/webp"];
