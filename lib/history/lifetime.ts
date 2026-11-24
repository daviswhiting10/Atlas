/**
 * Lifetime stats: the hairline row under the big count on the History page
 * (docs/archive-and-chapters.md, 1b).
 *
 * - **Sessions:** finished sessions, any source.
 * - **Sets:** completed sets with reps.
 * - **Moved:** tonnage in lb for loaded sets (weight x reps). Bodyweight and
 *   band sets have no weight, so they add nothing to tonnage and are counted
 *   separately in `unloadedReps`, for the hint "plus 9,400 bodyweight reps".
 *   Timed sets (a plank, a carry) hold seconds, not reps: they are in neither
 *   (a loaded carry is never weight x seconds), only in sets and time.
 * - **Time:** the sum of `durationMin`, shown only when at least half of the
 *   sessions have one, so the number never looks smaller than the truth.
 * - **Records** are new heaviest weights (gold); **bests** are new best
 *   estimated 1-rep maxes that were not also a record, a quieter number.
 *   Both count every exercise, from the second time it was done (a first session
 *   is a baseline, not a record).
 * - **Active weeks:** Monday-first weeks with a session, out of the weeks from
 *   the first session to this week. **Longest run:** the longest run of
 *   consecutive such weeks. There is deliberately no lifetime day streak.
 * - **Best stretch:** the most sessions in any 28 days.
 *
 * Pure: no I/O.
 */

import { setVolume } from "@/lib/sessions/volume";
import { datedFinished, isLoggedSet } from "./days";
import { prsOverTime } from "./records";
import { bestStretch, weeklyStreaks } from "./streaks";
import type { HistorySession } from "./types";

export type LifetimeStats = {
  /** The day of the first finished session, or null when there are none. */
  since: string | null;
  sessions: number;
  sets: number;
  moved: { tonnageLb: number; unloadedReps: number };
  /** Null when fewer than half of the sessions have a duration. */
  time: { minutes: number; fromSessions: number; ofSessions: number } | null;
  records: number;
  bests: number;
  activeWeeks: { active: number; of: number };
  longestRun: { weeks: number; from: string; to: string } | null;
  /** Consecutive weeks with a session, ending now (the week in progress never breaks it). */
  currentRun: number;
  bestStretch: { sessions: number; from: string; to: string } | null;
};

export function lifetimeStats(sessions: HistorySession[], opts: { timeZone: string; today: string }): LifetimeStats {
  const dated = datedFinished(sessions, opts.timeZone, opts.today);
  const finished = dated.map((d) => d.session);

  let sets = 0;
  let tonnage = 0;
  let unloadedReps = 0;
  let minutes = 0;
  let withDuration = 0;
  for (const s of finished) {
    if (s.durationMin != null && s.durationMin > 0) {
      minutes += s.durationMin;
      withDuration += 1;
    }
    for (const set of s.sets) {
      if (!isLoggedSet(set)) continue;
      sets += 1;
      if (set.timed) continue;
      if (set.weight != null && set.weight > 0) tonnage += setVolume(set);
      else unloadedReps += set.reps as number;
    }
  }

  // Records and bests, from sessions that are not in the future either.
  const inRange = finished;
  const weight = prsOverTime(inRange, { metric: "weight", timeZone: opts.timeZone });
  const e1rm = prsOverTime(inRange, { metric: "e1rm", timeZone: opts.timeZone });
  let records = 0;
  let bests = 0;
  for (const id of Object.keys(weight)) records += weight[id].records.length;
  for (const id of Object.keys(e1rm)) {
    const recordSessions = new Set((weight[id]?.records ?? []).map((p) => p.sessionId));
    bests += e1rm[id].records.filter((p) => !recordSessions.has(p.sessionId)).length;
  }

  const weeks = weeklyStreaks(inRange, { timeZone: opts.timeZone, today: opts.today, target: 1 });

  return {
    since: dated.length > 0 ? dated[0].day : null,
    sessions: finished.length,
    sets,
    moved: { tonnageLb: Math.round(tonnage), unloadedReps },
    time: finished.length > 0 && withDuration * 2 >= finished.length ? { minutes, fromSessions: withDuration, ofSessions: finished.length } : null,
    records,
    bests,
    activeWeeks: { active: weeks.weeks.filter((w) => w.hit).length, of: weeks.weeks.length },
    longestRun: weeks.longest,
    currentRun: weeks.current,
    bestStretch: bestStretch(inRange, { timeZone: opts.timeZone }),
  };
}
