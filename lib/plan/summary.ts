import { prisma } from "@/lib/db/client";
import { planWorkoutStatus } from "@/lib/sessions/status";
import { weekOf } from "@/lib/athlete/sessions";
import { nextInPlan } from "./plan-order";
import { storedPrefs } from "./overview";
import type { Prefs } from "./generator";
import type { YouPlan } from "@/lib/athlete/you-summary";

/**
 * The You screen's plan line and card: name, goal, week and how many workouts are done. The same answer as
 * youPlan(loadPlanOverview(...)), from the workouts' status and dates alone: no exercises, no pictures, no notes (the
 * overview reads every exercise of every workout of the plan, and a second query for the coach's photos, to throw all of that away).
 */
export async function loadPlanSummary({ clientId, workspaceId, fallbackPrefs = null }: { clientId: string; workspaceId: string; fallbackPrefs?: Prefs | null }): Promise<YouPlan | null> {
  const a = await prisma.programAssignment.findFirst({
    relationLoadStrategy: "join",
    where: { clientId, workspaceId, status: "ACTIVE" },
    orderBy: { createdAt: "desc" },
    select: {
      name: true,
      startDate: true,
      goalText: true,
      sourceProgram: { select: { goalTags: true, isTemplate: true } },
      assignedWorkouts: {
        select: { id: true, order: true, scheduledDate: true, status: true, workoutLog: { select: { id: true, completedAt: true } } },
      },
    },
  });
  return a ? summarizePlan(a, fallbackPrefs) : null;
}

type Row = {
  name: string;
  startDate: Date;
  goalText: string | null;
  sourceProgram: { goalTags: unknown; isTemplate: boolean };
  assignedWorkouts: Array<{ id: string; order: number; scheduledDate: Date; status: string; workoutLog: { completedAt: Date | null } | null }>;
};

/** Pure: the rows to the You card. Mirrors loadPlanOverview line for line where it counts and where it picks the week. */
export function summarizePlan(a: Row, fallbackPrefs: Prefs | null): YouPlan {
  const prefs = storedPrefs(a.sourceProgram.goalTags) ?? (a.sourceProgram.isTemplate ? null : fallbackPrefs);
  const start = a.startDate.getTime();
  const workouts = [...a.assignedWorkouts]
    .sort((x, y) => x.scheduledDate.getTime() - y.scheduledDate.getTime() || x.order - y.order)
    .map((w) => ({ order: w.order, week: weekOf(w.scheduledDate.getTime(), start), status: planWorkoutStatus(w.status as never, w.workoutLog as never) }));
  const totalWeeks = workouts.reduce((m, w) => Math.max(m, w.week), 1);
  const next = nextInPlan(workouts);
  return {
    name: a.name,
    goalText: (a.goalText ?? prefs?.goalText ?? null)?.trim() || null,
    week: next?.week ?? totalWeeks,
    totalWeeks,
    done: workouts.filter((w) => w.status === "LOGGED").length,
    total: workouts.filter((w) => w.status !== "SKIPPED").length,
  };
}
