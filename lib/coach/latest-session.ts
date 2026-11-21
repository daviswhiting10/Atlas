/**
 * The client's latest finished plan session, judged against what was prescribed (lib/coach/review.ts), for the
 * "Latest session" card on the client page. Nothing is stored: it is worked out from the plan and the sets.
 */

import { localDay } from "@/lib/athlete/sessions";
import { prisma } from "@/lib/db/client";
import type { PrescribedSet } from "@/lib/plan/prescription";
import { finishedByClient } from "./finished-by";
import { reviewSession, type Review } from "./review";

export type LatestSession = {
  logId: string;
  workout: string;
  date: string;
  minutes: number | null;
  note: string | null;
  /** The client tapped Finish on this workout (AssignedWorkout.loggedBy); says nothing about who entered each set. */
  finishedByClient: boolean;
  review: Review;
  /** The day it happened, in her time zone (the PR chips are matched on it). */
  day: string;
};

export async function loadLatestSession({
  clientId,
  workspaceId,
  timeZone,
}: {
  clientId: string;
  workspaceId: string;
  timeZone: string;
}): Promise<LatestSession | null> {
  const log = await prisma.workoutLog.findFirst({
    where: { clientId, client: { workspaceId }, completedAt: { not: null }, assignedWorkoutId: { not: null } },
    orderBy: { date: "desc" },
    select: {
      id: true,
      date: true,
      durationMin: true,
      clientNotes: true,
      completedAt: true,
      sets: { select: { assignedWorkoutExerciseId: true, setNumber: true, weight: true, reps: true, completed: true } },
      assignedWorkout: { select: { name: true, loggedBy: true, exercises: { orderBy: { order: "asc" }, select: { id: true, prescribedSets: true, notes: true, exercise: { select: { name: true } } } } } },
    },
  });
  if (!log?.assignedWorkout) return null;
  const review = reviewSession(
    log.assignedWorkout.exercises.map((e) => ({
      name: e.exercise.name,
      note: e.notes,
      prescribedSets: (e.prescribedSets as PrescribedSet[]) ?? [],
      sets: log.sets.filter((s) => s.assignedWorkoutExerciseId === e.id),
    }))
  );
  // A workout with no prescription has nothing to judge against.
  if (review.planned === 0) return null;
  return {
    logId: log.id,
    workout: log.assignedWorkout.name,
    date: log.date.toISOString(),
    minutes: log.durationMin,
    note: log.clientNotes,
    finishedByClient: finishedByClient({ loggedBy: log.assignedWorkout.loggedBy, completedAt: log.completedAt }),
    review,
    day: localDay(log.date, timeZone),
  };
}
