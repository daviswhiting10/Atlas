/**
 * The session (WorkoutLog) is the single source of truth for whether a plan
 * workout is done: done = it has a session with completedAt set. The plan
 * workout's stored status only ever says PLANNED, SKIPPED or RESCHEDULED
 * (a CHECK constraint keeps LOGGED out of the table).
 *
 * Pure: no I/O.
 */

import type { SessionSource, WorkoutStatus } from "@/app/generated/prisma/client";

export type { SessionSource, WorkoutStatus };

/** What a plan workout's status reads as, given its session (if any). */
export function planWorkoutStatus(stored: WorkoutStatus, session: { completedAt: Date | null } | null | undefined): WorkoutStatus {
  if (session?.completedAt) return "LOGGED";
  return stored === "LOGGED" ? "PLANNED" : stored;
}

/** A plan workout's row with its status read from its session. */
export function withDerivedStatus<T extends { status: WorkoutStatus; workoutLog?: { completedAt: Date | null } | null }>(w: T): T {
  return { ...w, status: planWorkoutStatus(w.status, w.workoutLog) };
}

/** The source of a session done from a plan: Atlas-generated plans are the only non-template programs. */
export function planSessionSource(program: { isTemplate: boolean }): SessionSource {
  return program.isTemplate ? "PLAN" : "GENERATED";
}

/** The Prisma select that planSessionSource needs, from an AssignedWorkout. */
export const PLAN_SOURCE_SELECT = { programAssignment: { select: { sourceProgram: { select: { isTemplate: true } } } } } as const;

/** Prisma filter: plan workouts that are done. */
export const DONE = { workoutLog: { is: { completedAt: { not: null } } } } as const;
