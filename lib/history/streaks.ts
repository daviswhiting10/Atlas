/**
 * Weekly streaks and the best 28 days.
 *
 * A week (Monday-first) is a **hit** when it has at least `target` finished
 * sessions (default 3; a target of 1 gives the doc's "weeks active"). There is
 * deliberately no daily streak (docs/archive-and-chapters.md): for someone who
 * lifts three or four days a week it would always read 1 to 3.
 *
 * - **Current** streak: consecutive hit weeks ending now. The week in progress
 *   counts if it is already a hit, and never breaks the streak if it isn't yet.
 * - **Longest** streak: the longest run of hit weeks ever (the most recent one
 *   if two tie), with the Monday it started and the Monday it ended.
 * - **Best stretch**: the most sessions in any 28 days, anchored on the first
 *   session of the window (the earliest one if two tie).
 *
 * Sessions count individually, so two sessions in a day are two. Pure: no I/O.
 */

import { mondayOf } from "@/lib/athlete/sessions";
import { addDays, daysBetween } from "@/lib/goals/days";
import { datedFinished } from "./days";
import type { HistorySession } from "./types";

export const DEFAULT_WEEKLY_TARGET = 3;

export type WeekCount = { week: string; sessions: number; hit: boolean };

export type WeeklyStreaks = {
  target: number;
  current: number;
  longest: { weeks: number; from: string; to: string } | null;
  /** Every week from the first session to the week of `today`, quiet weeks included. */
  weeks: WeekCount[];
};

export function weeklyStreaks(sessions: HistorySession[], opts: { timeZone: string; today: string; target?: number }): WeeklyStreaks {
  const target = Math.max(1, Math.floor(opts.target ?? DEFAULT_WEEKLY_TARGET));
  const dated = datedFinished(sessions, opts.timeZone, opts.today);
  if (dated.length === 0) return { target, current: 0, longest: null, weeks: [] };

  const counts = new Map<string, number>();
  for (const { day } of dated) {
    const w = mondayOf(day);
    counts.set(w, (counts.get(w) ?? 0) + 1);
  }

  const thisWeek = mondayOf(opts.today);
  const weeks: WeekCount[] = [];
  for (let w = mondayOf(dated[0].day); w <= thisWeek; w = addDays(w, 7)) {
    const n = counts.get(w) ?? 0;
    weeks.push({ week: w, sessions: n, hit: n >= target });
  }

  let current = 0;
  for (let i = weeks.length - 1; i >= 0; i--) {
    if (weeks[i].hit) current += 1;
    else if (i === weeks.length - 1) continue; // the week in progress doesn't break it
    else break;
  }

  let longest: WeeklyStreaks["longest"] = null;
  let runStart = -1;
  for (let i = 0; i <= weeks.length; i++) {
    if (i < weeks.length && weeks[i].hit) {
      if (runStart < 0) runStart = i;
      continue;
    }
    if (runStart >= 0) {
      const len = i - runStart;
      if (longest == null || len >= longest.weeks) longest = { weeks: len, from: weeks[runStart].week, to: weeks[i - 1].week };
      runStart = -1;
    }
  }

  return { target, current, longest, weeks };
}

/** The most sessions in any `days` days (28 by default), with the window's first and last day. */
export function bestStretch(sessions: HistorySession[], opts: { timeZone: string; days?: number }): { sessions: number; from: string; to: string } | null {
  const span = Math.max(1, Math.floor(opts.days ?? 28));
  const days = datedFinished(sessions, opts.timeZone).map((d) => d.day);
  if (days.length === 0) return null;

  let best = { sessions: 0, i: 0 };
  let j = 0;
  for (let i = 0; i < days.length; i++) {
    if (j < i) j = i;
    while (j < days.length && daysBetween(days[i], days[j]) < span) j++;
    if (j - i > best.sessions) best = { sessions: j - i, i };
  }
  const from = days[best.i];
  return { sessions: best.sessions, from, to: addDays(from, span - 1) };
}
