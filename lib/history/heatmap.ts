/**
 * Calendar heatmap data: the athlete's training days over the last 12 months.
 *
 * Intensity is relative to the athlete's own training days, so someone who
 * trains 20 minutes at a time still sees full colour on their big days.
 *
 * - **Work** for a session is the larger of `minutes ÷ 60` and `hard sets ÷ 12`.
 *   It is not tonnage, which is zero for bodyweight, bands and walking. A session
 *   with neither minutes nor sets gets a tiny presence value, so it lands in
 *   step 1: present, no more. (The doc says "1" for presence; that would rank an
 *   empty session above a 20-minute one, so this is a floor instead.)
 * - A day's work is the **largest** of its sessions, not the sum: two sessions in
 *   a day show as a second dot (`sessions: 2`), not a darker colour.
 * - **Levels:** 0 is a day with no finished session. Training days are 1 to 4 by
 *   the 25th, 50th and 75th percentile (nearest rank) of every training day in
 *   the sessions given. Pass the whole history, so old days keep their colour
 *   when new data arrives; only the last 12 months are returned.
 * - The range starts at the first session if that is under a year ago ("never a
 *   blank year"), and weeks are Monday-first.
 *
 * Pure: no I/O.
 */

import { mondayOf } from "@/lib/athlete/sessions";
import { addDays } from "@/lib/goals/days";
import { datedFinished, hardSetsOf, isLoggedSet } from "./days";
import type { HistorySession } from "./types";

export type HeatLevel = 0 | 1 | 2 | 3 | 4;

export type HeatDay = {
  day: string;
  /** Finished sessions that day (2 = draw a second dot). */
  sessions: number;
  minutes: number;
  /** Logged sets. */
  sets: number;
  hardSets: number;
  work: number;
  level: HeatLevel;
};

export type Heatmap = {
  /** First and last day returned (inclusive). */
  from: string;
  to: string;
  /** The 25th, 50th and 75th percentile of work over all training days; null when there are none. */
  thresholds: [number, number, number] | null;
  /** Every day from `from` to `to`, oldest first, rest days included. */
  days: HeatDay[];
  /** The same days in Monday-first rows, oldest week first. A slot outside `from`..`to` is null. */
  weeks: Array<{ monday: string; days: Array<HeatDay | null> }>;
  /** Days with a finished session inside the range. */
  trainingDays: number;
  /** Weeks in the range, and how many had at least one session ("41 of 52 weeks"). */
  weeksInRange: number;
  activeWeeks: number;
};

/** Work for a session that has nothing logged: above zero, below any real value. */
export const PRESENCE_WORK = 0.01;

const WINDOW_DAYS = 365;

/** Nearest-rank percentile of an ascending list. */
const percentile = (sorted: number[], q: number) => sorted[Math.max(0, Math.ceil(q * sorted.length) - 1)];

export function heatmap(sessions: HistorySession[], opts: { timeZone: string; today: string }): Heatmap {
  const dated = datedFinished(sessions, opts.timeZone, opts.today);

  const byDay = new Map<string, Omit<HeatDay, "level">>();
  for (const { session, day } of dated) {
    const minutes = session.durationMin ?? 0;
    const hardSets = hardSetsOf(session).length;
    const w = Math.max(minutes / 60, hardSets / 12);
    const work = w > 0 ? w : PRESENCE_WORK;
    const sets = session.sets.filter(isLoggedSet).length;
    const cur = byDay.get(day);
    if (!cur) {
      byDay.set(day, { day, sessions: 1, minutes, sets, hardSets, work });
    } else {
      cur.sessions += 1;
      cur.minutes += minutes;
      cur.sets += sets;
      cur.hardSets += hardSets;
      cur.work = Math.max(cur.work, work);
    }
  }

  const sortedWork = Array.from(byDay.values())
    .map((d) => d.work)
    .sort((a, b) => a - b);
  const thresholds: Heatmap["thresholds"] =
    sortedWork.length === 0 ? null : [percentile(sortedWork, 0.25), percentile(sortedWork, 0.5), percentile(sortedWork, 0.75)];
  const levelOf = (work: number): HeatLevel =>
    thresholds == null ? 1 : work <= thresholds[0] ? 1 : work <= thresholds[1] ? 2 : work <= thresholds[2] ? 3 : 4;

  if (dated.length === 0) {
    return { from: opts.today, to: opts.today, thresholds, days: [], weeks: [], trainingDays: 0, weeksInRange: 0, activeWeeks: 0 };
  }

  const windowStart = addDays(opts.today, -(WINDOW_DAYS - 1));
  const from = dated[0].day > windowStart ? dated[0].day : windowStart;
  const to = opts.today;

  const days: HeatDay[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) {
    const rec = byDay.get(d);
    days.push(rec ? { ...rec, level: levelOf(rec.work) } : { day: d, sessions: 0, minutes: 0, sets: 0, hardSets: 0, work: 0, level: 0 });
  }

  const index = new Map(days.map((d) => [d.day, d] as const));
  const weeks: Heatmap["weeks"] = [];
  for (let monday = mondayOf(from); monday <= to; monday = addDays(monday, 7)) {
    weeks.push({ monday, days: Array.from({ length: 7 }, (_, i) => index.get(addDays(monday, i)) ?? null) });
  }

  return {
    from,
    to,
    thresholds,
    days,
    weeks,
    trainingDays: days.filter((d) => d.sessions > 0).length,
    weeksInRange: weeks.length,
    activeWeeks: weeks.filter((w) => w.days.some((d) => d != null && d.sessions > 0)).length,
  };
}
