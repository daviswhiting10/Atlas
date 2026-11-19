/**
 * Demo workspaces don't live forever: a demo is about 5,500 rows, and nobody
 * comes back to most of them. Once a demo (a guest coach's workspace) is more
 * than 6 hours old, and every login in it is a @guest.atlas.app address, it and
 * everything under it is deleted. Try-it guest athletes are left alone. It runs lazily, a couple of workspaces each time a new guest
 * is created, so there's no job to schedule.
 *
 * Two safety properties:
 * - A workspace is only ever chosen if it has at least one user, EVERY user is
 *   a guest login, and one of them is a guest coach (`isExpiredGuestWorkspace`). A workspace with any real
 *   login, however old, is never touched. The check is made again inside the
 *   transaction that deletes it.
 * - Each workspace goes in one transaction, leaf rows first. Foreign keys are
 *   RESTRICT almost everywhere, so a table this list doesn't know about stops
 *   the delete and rolls the whole workspace back; nothing is half-deleted.
 *   (The one SET NULL that matters, a workspace's private exercises turning
 *   into shared ones, is why those are deleted explicitly.)
 *
 * No schema change.
 */

import { prisma } from "@/lib/db/client";
import { GUEST_EMAIL_DOMAIN } from "@/lib/auth/route-policy";
import { DEMO_TTL_MS, isExpiredGuestWorkspace, isGuestEmail } from "@/lib/guest-rules";

export { DEMO_TTL_MS, isExpiredGuestWorkspace, isGuestEmail };
/** Workspaces removed per call: small, so a new visitor never waits long. */
export const CLEANUP_BATCH = 2;

type Candidate = { id: string; createdAt: Date; users: Array<{ email: string; role: string }> };

/** The oldest expired guest workspaces (the query narrows; the pure check decides). */
export async function findExpiredGuestWorkspaces(limit: number, now = new Date(), ttlMs = DEMO_TTL_MS): Promise<Candidate[]> {
  const rows = await prisma.workspace.findMany({
    where: {
      createdAt: { lt: new Date(now.getTime() - ttlMs) },
      users: { some: { role: "TRAINER" }, every: { email: { endsWith: `@${GUEST_EMAIL_DOMAIN}`, mode: "insensitive" } } },
    },
    select: { id: true, createdAt: true, users: { select: { email: true, role: true } } },
    orderBy: { createdAt: "asc" },
    take: limit,
  });
  return rows.filter((w) => isExpiredGuestWorkspace(w, now, ttlMs));
}

/**
 * Every table a workspace's rows can be in, in the order they're deleted.
 * `COVERED_TABLES` is checked against the database schema by a test, so a new
 * table that holds a workspace's data can't be forgotten.
 */
export const COVERED_TABLES = [
  "SetLog", "SessionNote", "Assessment", "IntakeForm", "NutritionEntry", "ProgressPhoto", "Measurement", "Milestone", "ExerciseCoachNote",
  "GoalCheckIn", "Goal", "WorkoutLog", "AssignedWorkoutExercise", "AssignedWorkout", "ProgramAssignment", "WorkoutExercise", "Workout", "Block", "Program",
  "OutreachMessage", "Lead", "ExerciseMedia", "ExerciseAlias", "Exercise", "Message", "Conversation", "AuditLog", "UsageLog", "MethodologyDocument",
  "TrainerObservation", "ClientProfile", "TrainerProfile", "Account", "Session", "PasswordReset", "User", "Workspace",
] as const;

export type Counts = Record<string, number>;
export type CleanupResult = { workspaceId: string; deleted: Counts; dryRun: boolean };

class Rollback extends Error {
  constructor(readonly deleted: Counts) {
    super("dry run");
  }
}
class NotAGuestWorkspace extends Error {}

/**
 * Delete one guest workspace and everything under it. With `dryRun`, it does
 * all of it and then rolls back, so the counts are exactly what a real run
 * would delete.
 */
export async function deleteGuestWorkspace(workspaceId: string, opts: { dryRun?: boolean; now?: Date; ttlMs?: number; includeAthletes?: boolean } = {}): Promise<CleanupResult> {
  const dryRun = opts.dryRun === true;
  try {
    const deleted = await prisma.$transaction(
      async (tx) => {
        // Decided again inside the transaction: a guest who saved their account a moment ago is a real user now.
        const ws = await tx.workspace.findUnique({ where: { id: workspaceId }, select: { id: true, createdAt: true, users: { select: { id: true, email: true, role: true } } } });
        if (!ws || !isExpiredGuestWorkspace(ws, opts.now ?? new Date(), opts.ttlMs ?? DEMO_TTL_MS, opts.includeAthletes === true)) throw new NotAGuestWorkspace(workspaceId);

        const W = workspaceId;
        const userIds = ws.users.map((u) => u.id);
        const clientIds = (await tx.clientProfile.findMany({ where: { workspaceId: W }, select: { id: true } })).map((c) => c.id);
        const logIds = (await tx.workoutLog.findMany({ where: { clientId: { in: clientIds } }, select: { id: true } })).map((l) => l.id);
        const conversationIds = (await tx.conversation.findMany({ where: { workspaceId: W }, select: { id: true } })).map((c) => c.id);
        const counts: Counts = {};
        const step = async (table: (typeof COVERED_TABLES)[number], run: Promise<{ count: number }>) => {
          counts[table] = (counts[table] ?? 0) + (await run).count;
        };
        const byClient = { clientId: { in: clientIds } };

        await step("SetLog", tx.setLog.deleteMany({ where: { workoutLogId: { in: logIds } } }));
        await step("SessionNote", tx.sessionNote.deleteMany({ where: byClient }));
        await step("Assessment", tx.assessment.deleteMany({ where: byClient }));
        await step("IntakeForm", tx.intakeForm.deleteMany({ where: byClient }));
        await step("NutritionEntry", tx.nutritionEntry.deleteMany({ where: byClient }));
        await step("ProgressPhoto", tx.progressPhoto.deleteMany({ where: byClient }));
        await step("Measurement", tx.measurement.deleteMany({ where: { OR: [{ workspaceId: W }, byClient] } }));
        await step("Milestone", tx.milestone.deleteMany({ where: { OR: [{ workspaceId: W }, byClient] } }));
        await step("ExerciseCoachNote", tx.exerciseCoachNote.deleteMany({ where: { OR: [{ workspaceId: W }, byClient] } }));
        await step("GoalCheckIn", tx.goalCheckIn.deleteMany({ where: { goal: { workspaceId: W } } }));
        await step("Goal", tx.goal.deleteMany({ where: { OR: [{ workspaceId: W }, byClient] } }));
        await step("WorkoutLog", tx.workoutLog.deleteMany({ where: byClient }));
        await step("AssignedWorkoutExercise", tx.assignedWorkoutExercise.deleteMany({ where: { workspaceId: W } }));
        await step("AssignedWorkout", tx.assignedWorkout.deleteMany({ where: { workspaceId: W } }));
        await step("ProgramAssignment", tx.programAssignment.deleteMany({ where: { OR: [{ workspaceId: W }, byClient] } }));
        await step("WorkoutExercise", tx.workoutExercise.deleteMany({ where: { workspaceId: W } }));
        await step("Workout", tx.workout.deleteMany({ where: { workspaceId: W } }));
        await step("Block", tx.block.deleteMany({ where: { workspaceId: W } }));
        await step("Program", tx.program.deleteMany({ where: { workspaceId: W } }));
        await step("OutreachMessage", tx.outreachMessage.deleteMany({ where: { OR: [{ workspaceId: W }, byClient] } }));
        await step("Lead", tx.lead.deleteMany({ where: { workspaceId: W } }));
        // The workspace's own (private) exercises: deleted, never left to turn into shared ones.
        await step("ExerciseMedia", tx.exerciseMedia.deleteMany({ where: { workspaceId: W } }));
        await step("ExerciseAlias", tx.exerciseAlias.deleteMany({ where: { OR: [{ workspaceId: W }, { exercise: { workspaceId: W } }] } }));
        await step("Exercise", tx.exercise.deleteMany({ where: { workspaceId: W } }));
        await step("Message", tx.message.deleteMany({ where: { OR: [{ conversationId: { in: conversationIds } }, { senderId: { in: userIds } }] } }));
        await step("Conversation", tx.conversation.deleteMany({ where: { workspaceId: W } }));
        await step("AuditLog", tx.auditLog.deleteMany({ where: { workspaceId: W } }));
        await step("UsageLog", tx.usageLog.deleteMany({ where: { OR: [{ workspaceId: W }, { userId: { in: userIds } }] } }));
        await step("MethodologyDocument", tx.methodologyDocument.deleteMany({ where: { workspaceId: W } }));
        await step("TrainerObservation", tx.trainerObservation.deleteMany({ where: { workspaceId: W } }));
        await step("ClientProfile", tx.clientProfile.deleteMany({ where: { workspaceId: W } }));
        await step("TrainerProfile", tx.trainerProfile.deleteMany({ where: { userId: { in: userIds } } }));
        await step("Account", tx.account.deleteMany({ where: { userId: { in: userIds } } }));
        await step("Session", tx.session.deleteMany({ where: { userId: { in: userIds } } }));
        await step("PasswordReset", tx.passwordReset.deleteMany({ where: { userId: { in: userIds } } }));
        await step("User", tx.user.deleteMany({ where: { id: { in: userIds }, workspaceId: W } }));
        await step("Workspace", tx.workspace.deleteMany({ where: { id: W } }));

        if (dryRun) throw new Rollback(counts);
        return counts;
      },
      { timeout: 60_000, maxWait: 10_000 }
    );
    return { workspaceId, deleted, dryRun: false };
  } catch (err) {
    if (err instanceof Rollback) return { workspaceId, deleted: err.deleted, dryRun: true };
    throw err;
  }
}

/**
 * Called when a new guest is created. Deletes up to `limit` expired guest
 * workspaces; one that fails is logged and skipped (it was rolled back, so
 * nothing is half-deleted), and it never makes the visitor's sign-in fail.
 */
export async function cleanupExpiredGuests(limit = CLEANUP_BATCH): Promise<number> {
  let removed = 0;
  try {
    for (const ws of await findExpiredGuestWorkspaces(limit)) {
      try {
        await deleteGuestWorkspace(ws.id);
        removed++;
      } catch (err) {
        console.error("[guest cleanup] kept a workspace (rolled back):", ws.id, err instanceof Error ? err.message.slice(0, 200) : err);
      }
    }
  } catch (err) {
    console.error("[guest cleanup]", err instanceof Error ? err.message.slice(0, 200) : err);
  }
  return removed;
}
