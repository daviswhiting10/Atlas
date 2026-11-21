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

export type WeekChip = { name: string; date: string; done: boolean };

/** The plan's current week as chips: each planned workout and whether it's done, in date order (skipped ones left out). */
export function weekChips(startDate: Date, workouts: Array<WeekWorkout & { name: string }>, now: Date = new Date()): (WeekCount & { chips: WeekChip[] }) | null {
  const count = weekCount(startDate, workouts, now);
  if (!count) return null;
  const start = startDate.getTime();
  const chips = workouts
    .filter((w) => w.status !== "SKIPPED" && weekOf(w.scheduledDate.getTime(), start) === count.week)
    .sort((a, b) => a.scheduledDate.getTime() - b.scheduledDate.getTime())
    .map((w) => ({ name: w.name, date: w.scheduledDate.toISOString().slice(0, 10), done: w.done }));
  return { ...count, chips };
}

type SeriesPoint = { date: string; e1rm: number | null; reps: number; deload: boolean };
export type MainLift = { name: string; loaded: boolean; /** Oldest first, at most the last eight counted sessions. */ values: number[]; latest: number; /** Latest minus first (estimated max in lb, or reps). */ delta: number };

/**
 * The main lifts' lines: for each lift the plan leads its workouts with, its estimated max (reps for bodyweight work)
 * over her counted sessions. Lighter weeks are left out (they are expected to dip), and a lift needs two sessions.
 * In the order the plan lists them, at most `max`.
 */
export function mainLifts(exercises: Array<{ exerciseId: string; name: string; loaded: boolean; series: SeriesPoint[] }>, mainIds: string[], max = 4): MainLift[] {
  const out: MainLift[] = [];
  for (const id of mainIds) {
    const e = exercises.find((x) => x.exerciseId === id);
    if (!e) continue;
    const all = e.series.filter((p) => !p.deload).map((p) => (e.loaded ? p.e1rm : p.reps)).filter((v): v is number => v != null && v > 0).map((v) => Math.round(v));
    if (all.length < 2) continue;
    out.push({ name: e.name, loaded: e.loaded, values: all.slice(-8), latest: all[all.length - 1], delta: all[all.length - 1] - all[0] });
    if (out.length === max) break;
  }
  return out;
}
