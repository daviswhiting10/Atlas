/**
 * The Plan tab's week as a calendar: Monday to Sunday, each workout on its date. Pure: no I/O.
 *
 * Two dates matter. A workout not yet done sits on the day it is scheduled. A done one sits on the day its session was
 * really logged, in the athlete's timezone (as History and Progress count it), even when that isn't the slot's day: a
 * Monday workout done on Tuesday shows on Tuesday. Which slot a session fills is unchanged; only where it is drawn moves.
 * Skipped workouts aren't drawn.
 *
 * Which cell is "up next" is the plan's next workout (plan order, never a date), outlined wherever it is scheduled.
 */
import type { PlanOverview, WorkoutSummary } from "./overview";
import { workoutKind, type ExerciseKind } from "./workout-kind";
import { localDay } from "@/lib/athlete/sessions";

export type DayItem = {
  workout: WorkoutSummary;
  /** Its icon: strength, cardio or mobility (from its exercises). */
  kind: ExerciseKind;
  done: boolean;
  /** The plan's next workout (outlined). */
  upNext: boolean;
};

export type DayCell = {
  /** "2026-11-25". */
  date: string;
  /** 0 = Monday. */
  index: number;
  /** What is on this day, in plan order: none for a rest day. */
  items: DayItem[];
  /** The first item's icon; null on a rest day. */
  kind: ExerciseKind | null;
  /** Every item on the day is done (and there is one). */
  done: boolean;
  today: boolean;
  /** The plan's next workout is on this day. */
  upNext: boolean;
};

const DAY_MS = 86_400_000;
const toTime = (iso: string) => Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10));
export const addDays = (iso: string, k: number) => new Date(toTime(iso) + k * DAY_MS).toISOString().slice(0, 10);
/** The Monday on or before a date. */
export function mondayOf(iso: string): string {
  const dow = (new Date(`${iso.slice(0, 10)}T12:00:00Z`).getUTCDay() + 6) % 7;
  return addDays(iso.slice(0, 10), -dow);
}

/** The day a workout is drawn on: its session's local day when done, else its scheduled date. */
export function dayOfWorkout(w: WorkoutSummary, timeZone: string): string {
  if (w.status === "LOGGED" && w.sessionAt) return localDay(new Date(w.sessionAt), timeZone);
  return w.date.slice(0, 10);
}

/** Every drawn workout with its day. */
function placed(plan: PlanOverview, timeZone: string): Array<{ day: string; workout: WorkoutSummary }> {
  return plan.workouts.filter((w) => w.status !== "SKIPPED").map((workout) => ({ day: dayOfWorkout(workout, timeZone), workout }));
}

/** The seven cells of the calendar week starting `monday`; null when nothing falls in it. */
export function weekGrid(plan: PlanOverview, monday: string, today: string, timeZone: string): { monday: string; cells: DayCell[] } | null {
  const end = addDays(monday, 7);
  const inWeek = placed(plan, timeZone).filter((p) => p.day >= monday && p.day < end);
  if (inWeek.length === 0) return null;
  const cells: DayCell[] = Array.from({ length: 7 }, (_, i) => {
    const date = addDays(monday, i);
    const items: DayItem[] = inWeek
      .filter((p) => p.day === date)
      .map(({ workout }) => ({ workout, kind: workoutKind(workout.exercises), done: workout.status === "LOGGED", upNext: plan.nextUp?.id === workout.id }));
    return { date, index: i, items, kind: items[0]?.kind ?? null, done: items.length > 0 && items.every((x) => x.done), today: date === today, upNext: items.some((x) => x.upNext) };
  });
  return { monday, cells };
}

/** How far Prev and Next go: from the first Monday with anything on it to the last (today's week always included). */
export function weekBounds(plan: PlanOverview, today: string, timeZone: string): { first: string; last: string } {
  const days = [...placed(plan, timeZone).map((p) => p.day), today].sort();
  return { first: mondayOf(days[0]), last: mondayOf(days[days.length - 1]) };
}

/** The week the Plan tab opens on: today's, or (when today's week has nothing) the week of the plan's next workout. */
export function openingMonday(plan: PlanOverview, today: string, timeZone: string): string {
  const mine = mondayOf(today);
  if (weekGrid(plan, mine, today, timeZone) || !plan.nextUp) return mine;
  return mondayOf(plan.nextUp.date);
}

/** The plan week (7-day windows from the start date) a Monday falls in; null outside the plan. */
export function planWeekOf(monday: string, startDate: string, totalWeeks: number): number | null {
  const n = Math.floor(Math.round((toTime(monday) - toTime(startDate)) / DAY_MS) / 7) + 1;
  return n >= 1 && n <= totalWeeks ? n : null;
}

/** The cell the card opens on: today's, else the plan's next workout, else the first day with something on it. */
export function defaultDay(cells: DayCell[]): number {
  const t = cells.find((c) => c.today);
  if (t) return t.index;
  const up = cells.find((c) => c.upNext);
  if (up) return up.index;
  return cells.find((c) => c.items.length > 0)?.index ?? 0;
}

/** "Nov 23 – 29", or "Nov 30 – Dec 6" across a month. */
export function weekRange(monday: string): string {
  const a = new Date(`${monday}T12:00:00Z`);
  const b = new Date(`${addDays(monday, 6)}T12:00:00Z`);
  const m = (d: Date) => d.toLocaleDateString("en-US", { month: "short", timeZone: "UTC" });
  return a.getUTCMonth() === b.getUTCMonth() ? `${m(a)} ${a.getUTCDate()} – ${b.getUTCDate()}` : `${m(a)} ${a.getUTCDate()} – ${m(b)} ${b.getUTCDate()}`;
}
