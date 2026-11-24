/** The You screen's one-line summary and plan card, from the plan overview. Pure: no I/O. */

export type YouPlan = { name: string; goalText: string | null; week: number; totalWeeks: number; done: number; total: number };

export function youPlan(plan: { name: string; goalText: string | null; currentWeek: number; totalWeeks: number; done: number; workouts: Array<{ status: string }> } | null): YouPlan | null {
  if (!plan) return null;
  return {
    name: plan.name,
    goalText: plan.goalText?.trim() || null,
    week: plan.currentWeek,
    totalWeeks: plan.totalWeeks,
    done: plan.done,
    total: plan.workouts.filter((w) => w.status !== "SKIPPED").length,
  };
}

/** "Week 12 of 12 · 36 of 48 workouts done". With no plan, nothing to say. */
export function youLine(p: YouPlan | null): string | null {
  if (!p) return null;
  return `Week ${p.week} of ${p.totalWeeks} · ${p.done} of ${p.total} workouts done`;
}
