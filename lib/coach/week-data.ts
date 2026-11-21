/**
 * The client page's week view, read from the live plan: this plan week's workouts (done or not), whether it is a
 * lighter week, and which lifts the plan leads its workouts with. Nothing is stored.
 */

import { prisma } from "@/lib/db/client";
import { LIGHTER_SELECT, lighterWeeksOn } from "@/lib/plan/lighter";
import { BLOCK_WEEKS } from "@/lib/plan/generator";
import { weekChips, type WeekChip } from "./week";

export type WeekData = { done: number; planned: number; week: number; chips: WeekChip[]; lighter: boolean; mainIds: string[] };

export async function loadWeek({ clientId, workspaceId, now = new Date() }: { clientId: string; workspaceId: string; now?: Date }): Promise<WeekData | null> {
  const plan = await prisma.programAssignment.findFirst({
    where: { clientId, workspaceId, status: "ACTIVE", client: { deletedAt: null } },
    orderBy: { createdAt: "desc" },
    select: {
      ...LIGHTER_SELECT,
      assignedWorkouts: {
        orderBy: { order: "asc" },
        select: {
          name: true,
          scheduledDate: true,
          status: true,
          workoutLog: { select: { completedAt: true } },
          // The plan's lead lifts: the first two exercises of each workout.
          exercises: { where: { order: { lte: 2 } }, orderBy: { order: "asc" }, select: { exerciseId: true } },
        },
      },
    },
  });
  if (!plan) return null;
  const week = weekChips(
    plan.startDate,
    plan.assignedWorkouts.map((w) => ({ name: w.name, scheduledDate: w.scheduledDate, status: w.status, done: !!w.workoutLog?.completedAt })),
    now
  );
  if (!week) return null;
  const mainIds = Array.from(new Set(plan.assignedWorkouts.flatMap((w) => w.exercises.map((e) => e.exerciseId))));
  return { ...week, lighter: lighterWeeksOn(plan) && week.week % BLOCK_WEEKS === 0, mainIds };
}
