/**
 * Removing a logged session: the session, every set in it, its notes (the coach's and the athlete's) and any challenge tag
 * that points at it. The plan workout it fulfilled needs nothing: a workout is done only while it has a finished session, so
 * with the session gone it reads as scheduled again. One transaction: all of it or none.
 */
import type { Prisma } from "@/app/generated/prisma/client";

export async function deleteSessionRows(tx: Prisma.TransactionClient, workoutLogId: string): Promise<void> {
  await tx.setLog.deleteMany({ where: { workoutLogId } });
  await tx.sessionNote.deleteMany({ where: { workoutLogId } });
  await tx.goalCheckIn.deleteMany({ where: { workoutLogId } });
  await tx.workoutLog.delete({ where: { id: workoutLogId } });
}
