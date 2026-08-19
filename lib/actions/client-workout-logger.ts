"use server";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db/client";
import { checkSessionMilestones } from "@/lib/progress/milestones";

// ── Auth helper ────────────────────────────────────────────────────────────────
// Unlike the trainer-side actions (lib/actions/workout-logger.ts), every write here
// derives clientId from the session — never from client-supplied input — so a client
// can never touch another client's data even if they tamper with the request.

async function requireClient(): Promise<{ workspaceId: string; clientProfileId: string }> {
  const session = await auth();
  if (session?.user?.role !== "CLIENT") throw new Error("Unauthorized");
  const workspaceId = session.user.workspaceId;
  const clientProfileId = session.user.clientProfileId;
  if (!workspaceId || !clientProfileId) throw new Error("Unauthorized");
  return { workspaceId, clientProfileId };
}

// ── logClientSet ─────────────────────────────────────────────────────────────

export async function logClientSet(input: {
  workoutLogId?: string;
  assignedWorkoutId: string;
  exerciseId: string;
  assignedWorkoutExerciseId?: string;
  setLogId?: string;
  setNumber: number;
  weight: number | null;
  reps: number | null;
  rpe: number | null;
  completed: boolean;
}): Promise<{ workoutLogId: string; setLogId: string }> {
  const { clientProfileId } = await requireClient();

  const assignedWorkout = await prisma.assignedWorkout.findFirst({
    where: {
      id: input.assignedWorkoutId,
      programAssignment: { clientId: clientProfileId },
    },
    select: { id: true, scheduledDate: true },
  });
  if (!assignedWorkout) throw new Error("Workout not found");

  let workoutLogId = input.workoutLogId;

  if (!workoutLogId) {
    const existing = await prisma.workoutLog.findUnique({
      where: { assignedWorkoutId: input.assignedWorkoutId },
      select: { id: true, clientId: true },
    });
    if (existing) {
      if (existing.clientId !== clientProfileId) throw new Error("Workout not found");
      workoutLogId = existing.id;
    } else {
      const created = await prisma.workoutLog.create({
        data: {
          clientId: clientProfileId,
          assignedWorkoutId: input.assignedWorkoutId,
          date: assignedWorkout.scheduledDate,
        },
        select: { id: true },
      });
      workoutLogId = created.id;
    }
  } else {
    // Verify the caller-supplied workoutLogId actually belongs to this client
    const owned = await prisma.workoutLog.findFirst({
      where: { id: workoutLogId, clientId: clientProfileId },
      select: { id: true },
    });
    if (!owned) throw new Error("Workout not found");
  }

  let setLogId: string;

  if (input.setLogId) {
    const owned = await prisma.setLog.findFirst({
      where: { id: input.setLogId, workoutLogId },
      select: { id: true },
    });
    if (!owned) throw new Error("Set not found");
    await prisma.setLog.update({
      where: { id: input.setLogId },
      data: {
        weight: input.weight,
        reps: input.reps,
        rpe: input.rpe,
        completed: input.completed,
      },
    });
    setLogId = input.setLogId;
  } else {
    const created = await prisma.setLog.create({
      data: {
        workoutLogId,
        exerciseId: input.exerciseId,
        assignedWorkoutExerciseId: input.assignedWorkoutExerciseId ?? null,
        setNumber: input.setNumber,
        weight: input.weight,
        reps: input.reps,
        rpe: input.rpe,
        completed: input.completed,
      },
      select: { id: true },
    });
    setLogId = created.id;
  }

  return { workoutLogId, setLogId };
}

// ── completeClientSession ─────────────────────────────────────────────────────

export async function completeClientSession(input: {
  workoutLogId: string;
  assignedWorkoutId: string;
  clientNotes?: string;
  durationMin?: number;
}): Promise<void> {
  const { workspaceId, clientProfileId } = await requireClient();

  const workoutLog = await prisma.workoutLog.findFirst({
    where: { id: input.workoutLogId, clientId: clientProfileId },
    include: { sets: { select: { rpe: true } } },
  });
  if (!workoutLog) throw new Error("Workout log not found");

  const rpeValues = workoutLog.sets.map((s) => s.rpe).filter((r): r is number => r != null);
  const rpeAvg = rpeValues.length > 0 ? rpeValues.reduce((a, b) => a + b, 0) / rpeValues.length : null;

  await prisma.$transaction([
    prisma.assignedWorkout.updateMany({
      where: { id: input.assignedWorkoutId, programAssignment: { clientId: clientProfileId } },
      data: { status: "LOGGED" },
    }),
    prisma.workoutLog.update({
      where: { id: input.workoutLogId },
      data: { rpeAvg, clientNotes: input.clientNotes ?? null, durationMin: input.durationMin ?? null },
    }),
    prisma.clientProfile.updateMany({
      where: { id: clientProfileId, workspaceId },
      data: { lastContactAt: new Date() },
    }),
  ]);

  checkSessionMilestones(workspaceId, clientProfileId).catch((err: unknown) =>
    console.error("[milestones] session check:", err)
  );
}

// ── getLastPerformance (client-scoped) ────────────────────────────────────────

export async function getClientLastPerformance(
  exerciseId: string
): Promise<Array<{ setNumber: number; weight: number | null; reps: number | null; rpe: number | null; completed: boolean }>> {
  const { clientProfileId } = await requireClient();

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 90);

  const sets = await prisma.setLog.findMany({
    where: {
      exerciseId,
      workoutLog: { clientId: clientProfileId, date: { gte: cutoff } },
    },
    orderBy: [{ workoutLog: { date: "desc" } }, { setNumber: "asc" }],
    select: { setNumber: true, weight: true, reps: true, rpe: true, completed: true, workoutLog: { select: { date: true } } },
    take: 20,
  });

  if (sets.length === 0) return [];

  const mostRecentDate = sets[0].workoutLog.date.toISOString().slice(0, 10);
  return sets
    .filter((s) => s.workoutLog.date.toISOString().slice(0, 10) === mostRecentDate)
    .map(({ setNumber, weight, reps, rpe, completed }) => ({ setNumber, weight, reps, rpe, completed }));
}
