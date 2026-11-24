/**
 * Restart a plan: delete every session on it and put every workout back to scheduled, so up next is Week 1 Day 1 again
 * (up next is the first workout in plan order with no finished session that isn't skipped: lib/plan/plan-order.ts).
 *
 * "On the plan" means a session linked to one of the plan's workouts, whatever its source (PLAN, GENERATED, MANUAL,
 * SCREENSHOT, or an IMPORT that filled a plan workout), finished or only started. Sessions with no plan workout (OFF_PLAN
 * and quick logs, imported history not tied to a workout) are left alone. Dates are not moved.
 */
import type { Prisma } from "@/app/generated/prisma/client";

/** The confirm sheet's question, from the sessions a restart deletes and the workouts it brings back (skipped). Pure. */
export function resetQuestion(sessions: number, skipped = 0): string {
  if (sessions > 0) return `Delete ${sessions} ${sessions === 1 ? "session" : "sessions"} and restart at Week 1 Day 1?`;
  if (skipped > 0) return "No sessions to delete. Bring back skipped workouts and restart at Week 1 Day 1?";
  return "Nothing to delete. You're already at Week 1 Day 1.";
}

/** Prisma filter: the sessions on one plan, for one athlete. */
export const sessionsOnPlan = (assignmentId: string, clientId: string) =>
  ({ clientId, assignedWorkout: { is: { programAssignmentId: assignmentId } } }) as const;

/**
 * Inside one transaction: each session goes the way a single delete takes it (lib/sessions/delete.ts: its sets, its notes,
 * its challenge tags, then the session), in one statement per table rather than four per session. Then every workout that
 * isn't plain scheduled (skipped, rescheduled) is scheduled again: a restart starts from the top.
 */
export async function resetPlanRows(
  tx: Prisma.TransactionClient,
  { assignmentId, clientId }: { assignmentId: string; clientId: string }
): Promise<{ sessions: number; sets: number; workouts: number }> {
  const ids = (await tx.workoutLog.findMany({ where: sessionsOnPlan(assignmentId, clientId), select: { id: true } })).map((l) => l.id);
  const workoutLogId = { in: ids };
  const sets = ids.length ? (await tx.setLog.deleteMany({ where: { workoutLogId } })).count : 0;
  if (ids.length) {
    await tx.sessionNote.deleteMany({ where: { workoutLogId } });
    await tx.goalCheckIn.deleteMany({ where: { workoutLogId } });
    await tx.workoutLog.deleteMany({ where: { id: { in: ids }, clientId } });
  }
  const { count: workouts } = await tx.assignedWorkout.updateMany({
    where: { programAssignmentId: assignmentId, status: { not: "PLANNED" } },
    data: { status: "PLANNED" },
  });
  return { sessions: ids.length, sets, workouts };
}
