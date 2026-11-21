/**
 * Deleting a client for good, from the roster: her record, everything logged under it, her plans, and her login.
 * One transaction, leaf rows first (the order the demo cleanup uses). Foreign keys are RESTRICT almost everywhere,
 * so a table this list doesn't know about stops the delete and rolls it all back: nothing is ever half-deleted.
 *
 * Never: someone else's client (scoped to the coach's workspace), the coach's own training profile or any coach
 * login, a demo guest's anything, or when a demo guest is asking. The coach's program library is never touched
 * (a plan's copy, its assigned workouts, goes; the program it came from stays).
 */

import { prisma } from "@/lib/db/client";
import { GUEST_EMAIL_DOMAIN } from "@/lib/auth/route-policy";

export type DeletePreview = { ok: true; name: string; sessions: number; login: string | null } | { ok: false; status: 403 | 404; error: string };
export type DeleteResult = { ok: true; name: string; deleted: Record<string, number> } | { ok: false; status: 403 | 404; error: string };

const isGuest = (email: string | null | undefined) => !!email && email.toLowerCase().endsWith(`@${GUEST_EMAIL_DOMAIN}`);

/** What would go, and whether it may: the confirm sheet shows this. */
export async function clientDeletePreview(clientId: string, workspaceId: string, coachUserId: string): Promise<DeletePreview> {
  const coach = await prisma.user.findUnique({ where: { id: coachUserId }, select: { email: true } });
  if (!coach || isGuest(coach.email)) return { ok: false, status: 403, error: "Not available in the demo" };
  const client = await prisma.clientProfile.findFirst({ where: { id: clientId, workspaceId }, select: { fullName: true, userId: true, user: { select: { email: true, role: true } } } });
  if (!client) return { ok: false, status: 404, error: "Client not found" };
  if (client.userId === coachUserId || (client.user && client.user.role !== "CLIENT")) return { ok: false, status: 403, error: "That's your own training. It can't be deleted here." };
  if (isGuest(client.user?.email)) return { ok: false, status: 403, error: "Not available in the demo" };
  const sessions = await prisma.workoutLog.count({ where: { clientId } });
  return { ok: true, name: client.fullName, sessions, login: client.user?.email ?? null };
}

class Rollback extends Error {
  constructor(readonly deleted: Record<string, number>) {
    super("dry run");
  }
}

/** Delete her completely. With dryRun, everything is deleted and then rolled back, so the counts are exact. */
export async function deleteClientCompletely(clientId: string, workspaceId: string, coachUserId: string, opts: { dryRun?: boolean } = {}): Promise<DeleteResult> {
  const preview = await clientDeletePreview(clientId, workspaceId, coachUserId);
  if (!preview.ok) return preview;
  try {
    const deleted = await prisma.$transaction(
      async (tx) => {
        // Checked again inside the transaction.
        const client = await tx.clientProfile.findFirst({ where: { id: clientId, workspaceId }, select: { id: true, userId: true, user: { select: { id: true, email: true, role: true } } } });
        if (!client) throw new Error("gone");
        const login = client.user && client.user.role === "CLIENT" && client.userId !== coachUserId && !isGuest(client.user.email) ? client.user : null;
        if (client.user && !login) throw new Error("refused");

        const n: Record<string, number> = {};
        const step = async (table: string, run: Promise<{ count: number }>) => void (n[table] = (n[table] ?? 0) + (await run).count);
        const byClient = { clientId };
        const logIds = (await tx.workoutLog.findMany({ where: byClient, select: { id: true } })).map((l) => l.id);
        const planIds = (await tx.programAssignment.findMany({ where: byClient, select: { id: true } })).map((p) => p.id);

        await step("SetLog", tx.setLog.deleteMany({ where: { workoutLogId: { in: logIds } } }));
        await step("SessionNote", tx.sessionNote.deleteMany({ where: byClient }));
        await step("Assessment", tx.assessment.deleteMany({ where: byClient }));
        await step("IntakeForm", tx.intakeForm.deleteMany({ where: byClient }));
        await step("NutritionEntry", tx.nutritionEntry.deleteMany({ where: byClient }));
        await step("ProgressPhoto", tx.progressPhoto.deleteMany({ where: byClient }));
        await step("Measurement", tx.measurement.deleteMany({ where: byClient }));
        await step("Milestone", tx.milestone.deleteMany({ where: byClient }));
        await step("ExerciseCoachNote", tx.exerciseCoachNote.deleteMany({ where: byClient }));
        await step("GoalCheckIn", tx.goalCheckIn.deleteMany({ where: { goal: { clientId } } }));
        await step("Goal", tx.goal.deleteMany({ where: byClient }));
        await step("WorkoutLog", tx.workoutLog.deleteMany({ where: byClient }));
        await step("AssignedWorkoutExercise", tx.assignedWorkoutExercise.deleteMany({ where: { assignedWorkout: { programAssignmentId: { in: planIds } } } }));
        await step("AssignedWorkout", tx.assignedWorkout.deleteMany({ where: { programAssignmentId: { in: planIds } } }));
        await step("ProgramAssignment", tx.programAssignment.deleteMany({ where: { id: { in: planIds } } }));
        await step("WorkoutExercise", tx.workoutExercise.deleteMany({ where: { workout: { clientId } } }));
        await step("Workout", tx.workout.deleteMany({ where: byClient }));
        await step("OutreachMessage", tx.outreachMessage.deleteMany({ where: byClient }));
        await step("ClientProfile", tx.clientProfile.deleteMany({ where: { id: clientId, workspaceId } }));
        if (login) {
          await step("VerificationToken", tx.verificationToken.deleteMany({ where: { identifier: { in: [login.email, `code:${login.email}`] } } }));
          await step("Message", tx.message.deleteMany({ where: { senderId: login.id } }));
          await step("UsageLog", tx.usageLog.deleteMany({ where: { userId: login.id } }));
          await step("PasswordReset", tx.passwordReset.deleteMany({ where: { userId: login.id } }));
          await step("Session", tx.session.deleteMany({ where: { userId: login.id } }));
          await step("Account", tx.account.deleteMany({ where: { userId: login.id } }));
          await step("User", tx.user.deleteMany({ where: { id: login.id, role: "CLIENT" } }));
        }
        if (opts.dryRun) throw new Rollback(n);
        return n;
      },
      { timeout: 60_000, maxWait: 10_000 }
    );
    return { ok: true, name: preview.name, deleted };
  } catch (err) {
    if (err instanceof Rollback) return { ok: true, name: preview.name, deleted: err.deleted };
    throw err;
  }
}
