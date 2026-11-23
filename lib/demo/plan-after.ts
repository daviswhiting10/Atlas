/**
 * The sample plan after the visitor finished some workouts in this tab: those read as done, and Up next moves on to the
 * first one still planned (in order, from the start, as the real plan does). Pure: nothing is stored or read.
 */
import type { PlanOverview } from "@/lib/plan/overview";

export function planAfter(plan: PlanOverview, finished: ReadonlySet<string>): PlanOverview {
  if (finished.size === 0) return plan;
  const workouts = plan.workouts.map((w) => (finished.has(w.id) && w.status === "PLANNED" ? { ...w, status: "LOGGED" as const } : w));
  const nextUp = workouts.find((w) => w.status === "PLANNED") ?? null;
  return {
    ...plan,
    workouts,
    nextUp,
    currentWeek: nextUp?.week ?? plan.totalWeeks,
    done: workouts.filter((w) => w.status === "LOGGED").length,
  };
}
