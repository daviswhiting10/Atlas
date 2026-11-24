/**
 * Exercises added during a session: kept on the session (WorkoutLog.addedExercises) and offered again the next time the
 * same workout opens ("Last time you added Cable Row and Face Pulls."). The pure parts are in ./added.
 *
 * "The same workout" is the coach logger's rule for "last time": the same plan (ProgramAssignment), and the same
 * template workout or the same name (a plan read from a sheet has a template per week, so the name matters too).
 *
 * Callers check who may edit the plan; every query here is also scoped to the client.
 */

import { prisma } from "@/lib/db/client";
import type { Prisma } from "@/app/generated/prisma/client";
import { DONE, PLAN_SOURCE_SELECT, planSessionSource } from "./status";
import { readAdded, toOffer, withAdded, withoutAdded, type AddedExercise } from "./added";

type Db = Prisma.TransactionClient | typeof prisma;

/** Instances of the same workout in the same plan as this one (this one included). */
export function sameWorkout(w: { programAssignmentId: string; sourceWorkoutId: string | null; name: string }): Prisma.AssignedWorkoutWhereInput {
  return {
    programAssignmentId: w.programAssignmentId,
    ...(w.sourceWorkoutId ? { OR: [{ sourceWorkoutId: w.sourceWorkoutId }, { name: w.name }] } : { name: w.name }),
  };
}

/** Lock the session's row and rewrite its list (two adds at once can't lose one). */
async function rewrite(db: Prisma.TransactionClient, logId: string, change: (list: AddedExercise[]) => AddedExercise[]) {
  await db.$queryRaw`SELECT "id" FROM "WorkoutLog" WHERE "id" = ${logId} FOR UPDATE`;
  const row = await db.workoutLog.findUniqueOrThrow({ where: { id: logId }, select: { addedExercises: true } });
  const before = readAdded(row.addedExercises);
  const after = change(before);
  if (JSON.stringify(after) !== JSON.stringify(before)) {
    await db.workoutLog.update({ where: { id: logId }, data: { addedExercises: after.length ? (after as Prisma.InputJsonValue) : ([] as Prisma.InputJsonValue) } });
  }
  return { before, after };
}

/**
 * An exercise was added to this workout during the session: put it on the session's list. The session is started here
 * when there isn't one yet (as the first set would start it: today, or the coach's chosen day). Safe to repeat.
 */
export async function recordAdded(
  input: { clientId: string; assignedWorkoutId: string; aweId: string; date?: Date },
  db: Prisma.TransactionClient
): Promise<{ workoutLogId: string }> {
  const awe = await db.assignedWorkoutExercise.findFirst({
    where: { id: input.aweId, assignedWorkoutId: input.assignedWorkoutId, assignedWorkout: { programAssignment: { clientId: input.clientId } } },
    select: { exerciseId: true, prescribedSets: true, exercise: { select: { name: true } }, assignedWorkout: { select: PLAN_SOURCE_SELECT } },
  });
  if (!awe) throw new Error("Exercise not found");
  const log =
    (await db.workoutLog.findUnique({ where: { assignedWorkoutId: input.assignedWorkoutId }, select: { id: true, clientId: true } })) ??
    (await db.workoutLog.create({
      data: {
        clientId: input.clientId,
        assignedWorkoutId: input.assignedWorkoutId,
        source: planSessionSource(awe.assignedWorkout.programAssignment.sourceProgram),
        date: input.date ?? new Date(),
      },
      select: { id: true, clientId: true },
    }));
  if (log.clientId !== input.clientId) throw new Error("Workout not found");
  const entry: AddedExercise = { exerciseId: awe.exerciseId, name: awe.exercise.name, aweId: input.aweId, prescribedSets: awe.prescribedSets };
  await rewrite(db, log.id, (list) => withAdded(list, entry));
  return { workoutLogId: log.id };
}

/**
 * The exercise was taken out (or swapped) again before the session was finished: drop it from the list, or follow the
 * swap. A session started only to hold the list, now empty again, goes with it. A finished session's list is history.
 */
export async function forgetAdded(input: { clientId: string; assignedWorkoutId: string; aweId: string; swapped?: boolean }): Promise<void> {
  const log = await prisma.workoutLog.findFirst({
    where: { assignedWorkoutId: input.assignedWorkoutId, clientId: input.clientId, completedAt: null },
    select: { id: true, addedExercises: true },
  });
  if (!log || !readAdded(log.addedExercises).some((e) => e.aweId === input.aweId)) return;
  await prisma.$transaction(async (tx) => {
    if (input.swapped) {
      const awe = await tx.assignedWorkoutExercise.findUnique({ where: { id: input.aweId }, select: { exerciseId: true, prescribedSets: true, exercise: { select: { name: true } } } });
      if (awe) {
        await rewrite(tx, log.id, (list) => withAdded(withoutAdded(list, input.aweId), { exerciseId: awe.exerciseId, name: awe.exercise.name, aweId: input.aweId, prescribedSets: awe.prescribedSets }));
        return;
      }
    }
    const { after } = await rewrite(tx, log.id, (list) => withoutAdded(list, input.aweId));
    if (after.length > 0) return;
    // Nothing logged and nothing written on it: it was only ever the list.
    const used = await tx.workoutLog.findUnique({ where: { id: log.id }, select: { completedAt: true, _count: { select: { sets: true, notes: true } } } });
    if (used && used.completedAt == null && used._count.sets === 0 && used._count.notes === 0) await tx.workoutLog.delete({ where: { id: log.id } });
  });
}

export type AddedOffer = { exercises: Array<{ exerciseId: string; name: string }> };
export type OfferWorkout = { id: string; programAssignmentId: string; sourceWorkoutId: string | null; name: string; order: number; done: boolean; exerciseIds: string[] };

/**
 * The exercises added in the last finished session of the same workout (the one before this in plan order), less the ones
 * already in this one. Empty when this workout is done.
 */
export async function lastAdded(input: { clientId: string; workout: OfferWorkout }, db: Db = prisma): Promise<AddedExercise[]> {
  const w = input.workout;
  if (w.done) return [];
  const last = await db.assignedWorkout.findFirst({
    where: { ...sameWorkout(w), id: { not: w.id }, programAssignment: { clientId: input.clientId }, order: { lt: w.order }, ...DONE },
    orderBy: { order: "desc" },
    select: { workoutLog: { select: { addedExercises: true } } },
  });
  return toOffer(readAdded(last?.workoutLog?.addedExercises), w.exerciseIds);
}

/** What the card offers when this workout opens, or null when there's nothing. */
export async function addedOffer(input: { clientId: string; workout: OfferWorkout }, db: Db = prisma): Promise<AddedOffer | null> {
  const offer = await lastAdded(input, db);
  return offer.length ? { exercises: offer.map((e) => ({ exerciseId: e.exerciseId, name: e.name })) } : null;
}
