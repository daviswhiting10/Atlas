/**
 * How a client's plan week is going: workouts done of those planned in the plan's current week (counted from the
 * plan's start day, seven days at a time). Skipped workouts aren't planned. Null when the plan hasn't started
 * or has run out of workouts. Pure: no I/O.
 */

import { DAY_MS, weekOf } from "@/lib/athlete/sessions";

export type WeekWorkout = { scheduledDate: Date; status: string; done: boolean };
export type WeekCount = { done: number; planned: number; week: number };

export function weekCount(startDate: Date, workouts: WeekWorkout[], now: Date = new Date()): WeekCount | null {
  const start = startDate.getTime();
  if (now.getTime() < start - DAY_MS / 2) return null; // not started
  const week = weekOf(now.getTime(), start);
  const mine = workouts.filter((w) => w.status !== "SKIPPED" && weekOf(w.scheduledDate.getTime(), start) === week);
  return mine.length === 0 ? null : { done: mine.filter((w) => w.done).length, planned: mine.length, week };
}
