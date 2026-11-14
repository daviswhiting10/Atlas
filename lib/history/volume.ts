/**
 * Weekly hard sets per muscle group, Monday-first calendar weeks.
 *
 * Each hard set counts once, toward the group of its exercise's first main
 * muscle (lib/exercises/muscles.ts). Conditioning and mobility are left out.
 * A set whose exercise has no known group (or no exercise at all) is not lost
 * silently: it is counted in `unassigned`, so a caller can say how much of the
 * picture is missing.
 *
 * Weeks run from the week of the first finished session to the week of
 * `today`, with no gaps: a quiet week is a row of zeros, not a missing row.
 * The week containing `today` is marked `partial`.
 *
 * Pure: no I/O.
 */

import { mondayOf } from "@/lib/athlete/sessions";
import { countsTowardVolume, exerciseGroup, MUSCLE_GROUPS, type ExerciseGroup, type MuscleGroup } from "@/lib/exercises/muscles";
import { addDays } from "@/lib/goals/days";
import { datedFinished, hardSetsOf } from "./days";
import type { HistorySession } from "./types";

export type WeekVolume = {
  /** The Monday (yyyy-mm-dd) the week starts on. */
  week: string;
  /** True for the week that contains `today`: it isn't over yet. */
  partial: boolean;
  sets: Record<MuscleGroup, number>;
  /** Hard sets in the nine muscle groups. */
  total: number;
  /** Hard sets whose exercise has no known muscle group. Not in `total`. */
  unassigned: number;
};

/** Turn exercise rows into the lookup `weeklyHardSets` takes. */
export function groupLookup(exercises: Array<{ id: string; primaryMuscles: unknown }>): (exerciseId: string | null) => ExerciseGroup | null {
  const byId = new Map(exercises.map((e) => [e.id, exerciseGroup(e.primaryMuscles)] as const));
  return (id) => (id == null ? null : (byId.get(id) ?? null));
}

const emptySets = (): Record<MuscleGroup, number> => Object.fromEntries(MUSCLE_GROUPS.map((g) => [g, 0])) as Record<MuscleGroup, number>;

export function weeklyHardSets(
  sessions: HistorySession[],
  groupOf: (exerciseId: string | null) => ExerciseGroup | null,
  opts: { timeZone: string; today: string }
): WeekVolume[] {
  const dated = datedFinished(sessions, opts.timeZone, opts.today);
  if (dated.length === 0) return [];

  const thisWeek = mondayOf(opts.today);
  const rows = new Map<string, WeekVolume>();
  for (let w = mondayOf(dated[0].day); w <= thisWeek; w = addDays(w, 7)) {
    rows.set(w, { week: w, partial: w === thisWeek, sets: emptySets(), total: 0, unassigned: 0 });
  }

  for (const { session, day } of dated) {
    const row = rows.get(mondayOf(day));
    if (!row) continue;
    for (const s of hardSetsOf(session)) {
      const g = groupOf(s.exerciseId);
      if (g == null) row.unassigned += 1;
      else if (countsTowardVolume(g)) {
        row.sets[g] += 1;
        row.total += 1;
      }
    }
  }
  return Array.from(rows.values());
}
