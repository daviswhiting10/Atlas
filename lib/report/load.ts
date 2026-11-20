/**
 * Reading a client's progress reports from the data that is already there. Nothing is stored: a block's
 * report is worked out each time it is opened, from the plan's sessions and sets.
 */

import { cache } from "react";
import { iso, localDay } from "@/lib/athlete/sessions";
import { prisma } from "@/lib/db/client";
import { LIGHTER_SELECT, lighterWeeksOn } from "@/lib/plan/lighter";
import type { HistorySession } from "@/lib/history/types";
import { buildReport, type Report } from "./build";
import { blockRange, reportBlocks, type PlanForReports, type ReportEntry, BLOCK_DAYS } from "./blocks";

const REPORTABLE = ["ACTIVE", "PAUSED", "COMPLETED"] as const;

async function plansOf(clientId: string, workspaceId: string, timeZone: string): Promise<PlanForReports[]> {
  const plans = await prisma.programAssignment.findMany({
    where: { clientId, workspaceId, status: { in: [...REPORTABLE] } },
    select: {
      id: true,
      status: true,
      startDate: true,
      assignedWorkouts: { select: { scheduledDate: true, workoutLog: { select: { date: true, completedAt: true } } } },
    },
  });
  return plans.map((p) => ({
    id: p.id,
    status: p.status,
    startDay: iso(p.startDate),
    lastDay: iso(p.assignedWorkouts.reduce((last, w) => (w.scheduledDate > last ? w.scheduledDate : last), p.startDate)),
    sessionDays: p.assignedWorkouts.flatMap((w) => (w.workoutLog?.completedAt ? [localDay(w.workoutLog.date, timeZone)] : [])),
  }));
}

/** The reports a client can open, newest first. One light read: no sets. Cached for the request. */
export const listReports = cache(async (clientId: string, workspaceId: string, timeZone: string): Promise<ReportEntry[]> =>
  reportBlocks(await plansOf(clientId, workspaceId, timeZone), localDay(new Date(), timeZone))
);

export type Viewer = { role: string; workspaceId?: string; clientProfileId?: string; id?: string };

/**
 * One block's report, or null (not found, not finished, too little data, or not the viewer's to see).
 * A coach sees clients in their workspace; an athlete sees their own plans only.
 */
export async function loadReport({ assignmentId, block, viewer, timeZone }: { assignmentId: string; block: number; viewer: Viewer; timeZone: string }): Promise<Report | null> {
  if (!viewer.workspaceId || !Number.isInteger(block) || block < 1) return null;
  const plan = await prisma.programAssignment.findFirst({
    where: { id: assignmentId, workspaceId: viewer.workspaceId, status: { in: [...REPORTABLE] }, client: { deletedAt: null } },
    select: { clientId: true, ...LIGHTER_SELECT },
  });
  if (!plan) return null;
  if (viewer.role === "CLIENT" && plan.clientId !== viewer.clientProfileId) return null;
  // A coach's own training is a client profile of theirs in their own workspace: theirs to see.

  const entry = reportBlocks(await plansOf(plan.clientId, viewer.workspaceId, timeZone), localDay(new Date(), timeZone)).find((e) => e.assignmentId === assignmentId && e.block === block);
  if (!entry) return null;

  const { start } = blockRange(iso(plan.startDate), block);
  const [logs, planned] = await Promise.all([
    prisma.workoutLog.findMany({
      where: { assignedWorkout: { programAssignmentId: assignmentId }, completedAt: { not: null } },
      select: { id: true, date: true, completedAt: true, durationMin: true, sets: { select: { exerciseId: true, weight: true, reps: true, rpe: true, bandColor: true, completed: true, exercise: { select: { name: true } } } } },
    }),
    prisma.assignedWorkout.count({
      where: { programAssignmentId: assignmentId, status: { not: "SKIPPED" }, scheduledDate: { gte: new Date(start + "T00:00:00Z"), lt: new Date(new Date(start + "T00:00:00Z").getTime() + BLOCK_DAYS * 86_400_000) } },
    }),
  ]);
  const names: Record<string, string> = {};
  const sessions: HistorySession[] = logs.map((l) => ({
    id: l.id,
    date: l.date,
    completedAt: l.completedAt,
    durationMin: l.durationMin,
    sets: l.sets.map(({ exercise, ...s }) => {
      if (s.exerciseId && exercise) names[s.exerciseId] = exercise.name;
      return s;
    }),
  }));
  return buildReport({ startDay: iso(plan.startDate), block, sessions, names, planned, lighterLastWeek: lighterWeeksOn(plan), timeZone });
}
