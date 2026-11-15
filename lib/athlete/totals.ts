/**
 * The headline "Workouts" and "Streak" numbers: finished sessions, however they were logged.
 *
 * A session counts once it is finished (completedAt set), whether it has sets or only a name and a time
 * (the one-tap "Workout, 45 min"). Before, only sessions with a completed set counted, so a walk or a
 * one-tap workout never showed. The streak is consecutive weeks (Monday first) with a session, counting back
 * from this week; a week still in progress never breaks it. Pure: no I/O.
 */

import { lifetimeStats } from "@/lib/history/lifetime";

export type FinishedRow = { id: string; date: Date; completedAt: Date | null };

export function finishedTotals(rows: FinishedRow[], timeZone: string, today: string): { sessions: number; streak: number; since: string | null } {
  const s = lifetimeStats(rows.map((r) => ({ ...r, durationMin: null, sets: [] })), { timeZone, today });
  return { sessions: s.sessions, streak: s.currentRun, since: s.since };
}
