/** Small builders for the history tests. Not a test file, so vitest doesn't run it. */

import type { HistorySession, HistorySet } from "./types";

export const UTC = "UTC";
/** UTC+13 all year (no daylight saving). */
export const TONGA = "Pacific/Tongatapu";
/** UTC−10 all year (no daylight saving). */
export const HONOLULU = "Pacific/Honolulu";

export const set = (exerciseId: string | null, weight: number | null, reps: number | null, extra: Partial<HistorySet> = {}): HistorySet => ({
  exerciseId,
  weight,
  reps,
  rpe: null,
  bandColor: null,
  completed: true,
  ...extra,
});

/** A finished session done at `at` (an ISO instant). Override `completedAt` for a late log, or set it to null for one still running. */
export const sess = (id: string, at: string, sets: HistorySet[] = [], extra: Partial<HistorySession> = {}): HistorySession => ({
  id,
  date: new Date(at),
  completedAt: new Date(at),
  durationMin: null,
  sets,
  ...extra,
});

/** One finished session at noon UTC on each of the days. */
export const onDays = (days: string[]): HistorySession[] => days.map((d, i) => sess(`s${i}-${d}`, `${d}T12:00:00Z`));
