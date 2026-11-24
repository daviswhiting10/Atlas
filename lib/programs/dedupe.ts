/**
 * A soft dedupe for imported exercise names. The resolver already matches exact names, alternate names, shorthand
 * ("DB RDL" is the Dumbbell Romanian Deadlift) and the same name written differently. What it doesn't match is a
 * coach's cue written into the name, so the same exercise would land as a second row and split its history:
 *
 *   "Hip thrust (lighter, 2 sec pause at top)"  → Hip Thrust, cue "lighter, 2 sec pause at top"
 *   "Machine chest press or incline push-up"    → Machine Chest Press, cue "or incline push-up"
 *   "Goblet squat to box"                       → Goblet Box Squat (the same words)
 *
 * These are only suggestions: the coach confirms each one in the preview. A match renames the exercise in the grid and
 * moves the cue into its note; turning it off puts both back. Pure, except exerciseMatches (one read of the library).
 */

import type { SheetGrid } from "./sheet-plan";

/** A suggestion: the name as imported, the library exercise it is, and the cue that moves to the note. */
export type ExerciseMatch = { name: string; match: string; matchId: string; cue: string | null };

/** Use (or stop using) one suggestion in the grid: the exercise's name, and the cue at the end of its note. */
export function applyMatch(grid: SheetGrid, m: ExerciseMatch, on: boolean): SheetGrid {
  const tag = m.cue ? `(${m.cue})` : null;
  return {
    ...grid,
    days: grid.days.map((d) => ({
      ...d,
      exercises: d.exercises.map((e) => {
        if (on && e.name === m.name) {
          const notes = [e.notes, tag].filter(Boolean).join(" ");
          return { ...e, name: m.match, notes: notes || undefined, matchedFrom: m.name };
        }
        if (!on && e.matchedFrom === m.name) {
          const notes = tag && e.notes?.endsWith(tag) ? e.notes.slice(0, -tag.length).trim() : e.notes;
          const rest = { ...e };
          delete rest.matchedFrom;
          return { ...rest, name: m.name, notes: notes || undefined };
        }
        return e;
      }),
    })),
  };
}
