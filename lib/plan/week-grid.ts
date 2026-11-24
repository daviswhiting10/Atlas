/**
 * The Plan tab's week as a grid: Monday to Sunday, the week's workouts spread across it in plan order (a workout is not
 * pinned to a weekday; the plan has only a week and an order). Pure: no I/O.
 *
 * Which cell is "up next" is the plan's next workout (the first one still planned), never a date: skip Tuesday's lift
 * and the outline moves to the next one in sequence.
 */
import type { PlanOverview, WorkoutSummary } from "./overview";

/** Which of the seven days the week's workouts fall on, by how many there are. */
const SPREAD: Record<number, number[]> = {
  1: [2],
  2: [0, 3],
  3: [0, 2, 4],
  4: [0, 2, 3, 4],
  5: [0, 1, 2, 3, 4],
  6: [0, 1, 2, 3, 4, 5],
  7: [0, 1, 2, 3, 4, 5, 6],
};

export type DayCell = {
  /** "2026-11-25". */
  date: string;
  /** 0 = Monday. */
  index: number;
  /** The workout on this day; none for a rest day. */
  workout: WorkoutSummary | null;
  today: boolean;
  /** The plan's next workout (outlined). */
  upNext: boolean;
};

const addDays = (iso: string, k: number) => new Date(Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10) + k)).toISOString().slice(0, 10);
/** The Monday on or before a date. */
export function mondayOf(iso: string): string {
  const dow = (new Date(`${iso.slice(0, 10)}T12:00:00Z`).getUTCDay() + 6) % 7;
  return addDays(iso.slice(0, 10), -dow);
}

/**
 * The seven cells of plan week `week`. The week's Monday comes from its own workouts' dates (the earliest), so a week
 * shows the dates the plan gave it. A week with no workouts has no dates to go by: null.
 */
export function weekGrid(plan: PlanOverview, week: number, today: string): { monday: string; cells: DayCell[] } | null {
  const inWeek = plan.workouts.filter((w) => w.week === week && w.status !== "SKIPPED");
  if (inWeek.length === 0) return null;
  const monday = mondayOf(inWeek.map((w) => w.date.slice(0, 10)).sort()[0]);
  const slots = SPREAD[Math.min(inWeek.length, 7)] ?? [];
  const cells: DayCell[] = Array.from({ length: 7 }, (_, i) => {
    const at = slots.indexOf(i);
    const date = addDays(monday, i);
    const workout = at >= 0 ? inWeek[at] : null;
    return { date, index: i, workout, today: date === today, upNext: workout != null && plan.nextUp?.id === workout.id };
  });
  return { monday, cells };
}

/** The cell the card opens on: today's, else the plan's next workout, else the first workout of the week. */
export function defaultDay(cells: DayCell[]): number {
  const t = cells.find((c) => c.today);
  if (t) return t.index;
  const up = cells.find((c) => c.upNext);
  if (up) return up.index;
  return cells.find((c) => c.workout)?.index ?? 0;
}

/** "Nov 23 – 29", or "Nov 30 – Dec 6" across a month. */
export function weekRange(monday: string): string {
  const a = new Date(`${monday}T12:00:00Z`);
  const b = new Date(`${addDays(monday, 6)}T12:00:00Z`);
  const m = (d: Date) => d.toLocaleDateString("en-US", { month: "short", timeZone: "UTC" });
  return a.getUTCMonth() === b.getUTCMonth() ? `${m(a)} ${a.getUTCDate()} – ${b.getUTCDate()}` : `${m(a)} ${a.getUTCDate()} – ${m(b)} ${b.getUTCDate()}`;
}
