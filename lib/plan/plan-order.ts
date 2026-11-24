/**
 * Up next: the earliest workout still to do in the plan's own order, whatever its date says (a workout dated last week
 * that was never logged, or whose session was deleted, is still next). Pure.
 *
 * Plan order is `order` when it numbers every workout once (generated plans, library programs). An imported plan numbers
 * each week's days from 1, so there it is the week, then the day.
 */
export function inPlanOrder<T extends { order: number; week: number }>(workouts: T[]): T[] {
  const unique = new Set(workouts.map((w) => w.order)).size === workouts.length;
  return [...workouts].sort((a, b) => (unique ? a.order - b.order : a.week - b.week || a.order - b.order));
}

/** The plan's next workout to do: the first unlogged (PLANNED) one in plan order. Skipped workouts are passed over. */
export function nextInPlan<T extends { order: number; week: number; status: string }>(workouts: T[]): T | null {
  return inPlanOrder(workouts).find((w) => w.status === "PLANNED") ?? null;
}
