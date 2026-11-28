/**
 * Database access for MCP tools. Every function takes the scope explicitly
 * (a ScopedClient or a workspaceId) and puts it in the query, so a handler
 * cannot reach outside the caller's workspace by forgetting a filter.
 */

import { prisma } from "@/lib/db/client";
import { liveExercise } from "@/lib/exercises/find";
import { withDerivedStatus } from "@/lib/sessions/status";
import { LIGHTER_SELECT, isLighterWeek } from "@/lib/plan/lighter";
import { displayName } from "@/lib/plan/catalog";
import { durationRange } from "@/lib/sessions/duration";
import { isTimedSet, TIMED_SELECT } from "@/lib/sessions/volume";
import type { ClientLookup, OwnClientLookup } from "./auth";
import type { ScopedClient } from "./context";
import { safeTimeZone } from "@/lib/athlete/sessions";

const CLIENT_SELECT = { id: true, workspaceId: true, fullName: true, primaryGoal: true, keyLiftIds: true, goalTargets: true } as const;
type ClientRow = { id: string; workspaceId: string; fullName: string; primaryGoal: string | null; keyLiftIds: string[] | null; goalTargets: unknown };
const scoped = (c: ClientRow) => ({
  id: c.id,
  workspaceId: c.workspaceId,
  fullName: c.fullName,
  primaryGoal: c.primaryGoal,
  keyLiftIds: c.keyLiftIds ?? [],
  selfServe: (c.goalTargets as { athlete?: unknown } | null)?.athlete != null,
});

export const lookupClient: ClientLookup = async (clientId, workspaceId) => {
  const c = await prisma.clientProfile.findFirst({ where: { id: clientId, workspaceId, deletedAt: null }, select: CLIENT_SELECT });
  return c ? scoped(c) : null;
};

/** A coach's own training profile (the "Me" side) in their workspace. */
export const lookupOwnClient: OwnClientLookup = async (userId, workspaceId) => {
  const c = await prisma.clientProfile.findFirst({ where: { userId, workspaceId, deletedAt: null }, select: CLIENT_SELECT, orderBy: { createdAt: "asc" } });
  return c ? scoped(c) : null;
};

export type SetRow = {
  exerciseId: string;
  exerciseName: string;
  movementPattern: string;
  primaryMuscles: string[];
  secondaryMuscles: string[];
  setNumber: number;
  weight: number | null;
  bandColor: string | null;
  reps: number | null;
  rpe: number | null;
  completed: boolean;
  workoutLogId: string;
  date: Date;
  /** Logged in one of the plan's lighter weeks. */
  deload: boolean;
  /** The reps are seconds (a hold, a carry, cardio): no tonnage. See lib/sessions/volume.ts. */
  timed: boolean;
  /** Bells held (2 = per hand); null = not recorded, one. Tonnage only (lib/exercises/implements.ts). */
  implements: number | null;
};

const asStrings = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);

/** Logged sets for one client, oldest first. Always filtered by client AND workspace. */
export async function loadSetRows(
  client: ScopedClient,
  opts: { exerciseIds?: string[]; since?: Date } = {}
): Promise<SetRow[]> {
  const rows = await prisma.setLog.findMany({
    where: {
      exerciseId: opts.exerciseIds ? { in: opts.exerciseIds } : { not: null },
      workoutLog: {
        clientId: client.id,
        client: { workspaceId: client.workspaceId },
        ...(opts.since && { date: { gte: opts.since } }),
      },
    },
    orderBy: [{ workoutLog: { date: "asc" } }, { setNumber: "asc" }],
    select: {
      exerciseId: true,
      setNumber: true,
      weight: true,
      bandColor: true,
      reps: true,
      rpe: true,
      completed: true,
      workoutLogId: true,
      implements: true,
      ...TIMED_SELECT,
      exercise: { select: { name: true, slug: true, movementPattern: true, primaryMuscles: true, secondaryMuscles: true } },
      workoutLog: {
        select: {
          date: true,
          assignedWorkout: { select: { scheduledDate: true, programAssignment: { select: LIGHTER_SELECT } } },
        },
      },
    },
  });

  return rows.flatMap((r) => {
    if (!r.exerciseId || !r.exercise) return [];
    const aw = r.workoutLog.assignedWorkout;
    const deload = aw != null && isLighterWeek(aw.scheduledDate, aw.programAssignment, client.selfServe);
    return [
      {
        exerciseId: r.exerciseId,
        exerciseName: displayName(r.exercise.slug, r.exercise.name),
        movementPattern: r.exercise.movementPattern,
        primaryMuscles: asStrings(r.exercise.primaryMuscles),
        secondaryMuscles: asStrings(r.exercise.secondaryMuscles),
        setNumber: r.setNumber,
        weight: r.weight,
        bandColor: r.bandColor,
        reps: r.reps,
        rpe: r.rpe,
        completed: r.completed,
        workoutLogId: r.workoutLogId,
        date: r.workoutLog.date,
        deload,
        implements: r.implements,
        timed: isTimedSet(r, r.exercise.slug),
      },
    ];
  });
}

/** An exercise the workspace may see: its own, or the global library (workspaceId null). */
/**
 * The timezone a person's days are in, for placing a session on a calendar day: the one the AI passed, else the zone the
 * app saw when they last started a goal (the profile keeps no zone of its own; the app reads it from the device), else UTC,
 * the app's own default (safeTimeZone).
 */
export async function zoneFor(client: ScopedClient, given: string | undefined): Promise<string> {
  if (given && safeTimeZone(given) === given) return given;
  const goal = await prisma.goal.findFirst({ where: { clientId: client.id }, orderBy: { createdAt: "desc" }, select: { timeZone: true } });
  return safeTimeZone(goal?.timeZone);
}

export async function findVisibleExercise(exerciseId: string, workspaceId: string) {
  // An exercise merged into another stands for that one.
  const live = await liveExercise(exerciseId);
  const e = live && (live.workspaceId === null || live.workspaceId === workspaceId)
    ? await prisma.exercise.findUnique({ where: { id: live.id }, select: { id: true, name: true, slug: true, movementPattern: true, equipment: true } })
    : null;
  return e ? { ...e, name: displayName(e.slug, e.name) } : null;
}

type RawSet = { repMin?: number; repMax?: number; unit?: "reps" | "secs" };

/** The client's active plan with every assigned workout, or null. */
export async function loadActiveAssignment(client: ScopedClient) {
  const assignment = await prisma.programAssignment.findFirst({
    where: { clientId: client.id, workspaceId: client.workspaceId, status: "ACTIVE" },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      startDate: true,
      sourceProgramId: true,
      goalText: true,
      notes: true,
      lighterWeeks: true,
      sourceProgram: { select: { goalTags: true, isTemplate: true } },
      assignedWorkouts: {
        // By date: `order` is the day within its week (each week of an imported plan starts again at 1), so it only breaks ties.
        orderBy: [{ scheduledDate: "asc" }, { order: "asc" }],
        select: {
          id: true,
          name: true,
          scheduledDate: true,
          order: true,
          status: true,
          workoutLog: { select: { completedAt: true } },
          notes: true,
          exercises: {
            orderBy: { order: "asc" },
            select: { id: true, exerciseId: true, prescribedSets: true, section: true, exercise: { select: { name: true, slug: true } } },
          },
        },
      },
    },
  });
  // Done is read from the session.
  return assignment && { ...assignment, assignedWorkouts: assignment.assignedWorkouts.map(withDerivedStatus) };
}

export function describePrescription(prescribedSets: unknown): { sets: number; reps: string; repMin: number | null } {
  const sets = (Array.isArray(prescribedSets) ? prescribedSets : []) as RawSet[];
  const first = sets[0];
  if (!first) return { sets: 0, reps: "", repMin: null };
  const range = first.repMin === first.repMax ? `${first.repMax}` : `${first.repMin}–${first.repMax}`;
  return { sets: sets.length, reps: first.unit === "secs" ? durationRange(first.repMin ?? 0, first.repMax ?? first.repMin ?? 0) : range, repMin: first.repMin ?? null };
}
