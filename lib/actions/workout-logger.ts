"use server";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db/client";
import {
  checkStrengthMilestones,
  checkSessionMilestones,
} from "@/lib/progress/milestones";

// ── Auth helper ────────────────────────────────────────────────────────────────

async function requireWorkspace(): Promise<{ userId: string; workspaceId: string }> {
  const session = await auth();
  const userId = session?.user?.id;
  const workspaceId = session?.user?.workspaceId;
  if (!userId || !workspaceId) throw new Error("Unauthorized");
  return { userId, workspaceId };
}

// ── logSet ─────────────────────────────────────────────────────────────────────
//
// Called when trainer taps [✓] on a set.
//
// Behaviour:
//  - If workoutLogId is provided, use it directly.
//  - Otherwise, find the existing WorkoutLog for assignedWorkoutId or create one
//    (idempotent — first set write creates the session, subsequent ones reuse it).
//  - If setLogId is provided, update that row.
//  - Otherwise, create a new SetLog row.
//
// Returns the workoutLogId and setLogId so the client can store them for
// subsequent edits to the same set.

export async function logSet(input: {
  workoutLogId?: string;
  assignedWorkoutId: string;
  clientId: string;
  exerciseId: string;
  assignedWorkoutExerciseId?: string;
  setLogId?: string;
  setNumber: number;
  weight: number | null;
  reps: number | null;
  rpe: number | null;
  completed: boolean;
}): Promise<{ workoutLogId: string; setLogId: string }> {
  const { workspaceId } = await requireWorkspace();

  // ── Verify the AssignedWorkout belongs to this workspace ───────────────────
  const assignedWorkout = await prisma.assignedWorkout.findFirst({
    where: {
      id: input.assignedWorkoutId,
      programAssignment: { workspaceId },
    },
    select: { id: true },
  });
  if (!assignedWorkout) throw new Error("Workout not found");

  // ── Find or create WorkoutLog ──────────────────────────────────────────────
  let workoutLogId = input.workoutLogId;

  if (!workoutLogId) {
    const existing = await prisma.workoutLog.findUnique({
      where: { assignedWorkoutId: input.assignedWorkoutId },
      select: { id: true },
    });
    if (existing) {
      workoutLogId = existing.id;
    } else {
      const created = await prisma.workoutLog.create({
        data: {
          clientId: input.clientId,
          assignedWorkoutId: input.assignedWorkoutId,
          date: new Date(),
        },
        select: { id: true },
      });
      workoutLogId = created.id;
    }
  }

  // ── Upsert SetLog ──────────────────────────────────────────────────────────
  let setLogId: string;

  if (input.setLogId) {
    // Update existing set (trainer edited weight/reps after initial save)
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
    // Create new set
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

    // Fire-and-forget: check strength milestones on completed sets
    if (input.completed && input.exerciseId) {
      const exercise = await prisma.exercise.findUnique({
        where: { id: input.exerciseId },
        select: { name: true },
      });
      if (exercise) {
        checkStrengthMilestones(
          workspaceId,
          input.clientId,
          input.exerciseId,
          exercise.name,
          { weight: input.weight, reps: input.reps, completed: input.completed },
          setLogId
        ).catch((err: unknown) => console.error("[milestones] strength check:", err));
      }
    }
  }

  return { workoutLogId, setLogId };
}

// ── completeSession ────────────────────────────────────────────────────────────
//
// Called when trainer presses "Save & Complete Session".
//
// Behaviour:
//  - Flips AssignedWorkout.status → LOGGED.
//  - Computes rpeAvg from all SetLog.rpe values for this WorkoutLog.
//  - Persists clientNotes + rpeAvg on WorkoutLog.
//  - Optionally creates a SessionNote (SOAP) if rawInput is provided.
//  - Updates ClientProfile.lastContactAt.

export async function completeSession(input: {
  workoutLogId: string;
  assignedWorkoutId: string;
  clientId: string;
  clientNotes?: string;
  rawInput?: string;
  structuredNote?: Record<string, unknown>;
}): Promise<void> {
  const { workspaceId } = await requireWorkspace();

  // Verify ownership
  const workoutLog = await prisma.workoutLog.findFirst({
    where: {
      id: input.workoutLogId,
      client: { workspaceId },
    },
    include: {
      sets: { select: { rpe: true } },
    },
  });
  if (!workoutLog) throw new Error("Workout log not found");

  // Compute rpeAvg from all logged sets
  const rpeValues = workoutLog.sets
    .map((s) => s.rpe)
    .filter((r): r is number => r != null);
  const rpeAvg =
    rpeValues.length > 0
      ? rpeValues.reduce((a, b) => a + b, 0) / rpeValues.length
      : null;

  await prisma.$transaction([
    // Mark the planned workout as done
    prisma.assignedWorkout.updateMany({
      where: {
        id: input.assignedWorkoutId,
        programAssignment: { workspaceId },
      },
      data: { status: "LOGGED" },
    }),

    // Persist session-level fields
    prisma.workoutLog.update({
      where: { id: input.workoutLogId },
      data: {
        rpeAvg,
        clientNotes: input.clientNotes ?? null,
      },
    }),

    // Update client's last contact timestamp
    prisma.clientProfile.updateMany({
      where: { id: input.clientId, workspaceId },
      data: { lastContactAt: new Date() },
    }),
  ]);

  // Fire-and-forget: session milestones
  checkSessionMilestones(workspaceId, input.clientId).catch(
    (err: unknown) => console.error("[milestones] session check:", err)
  );

  // Create SessionNote if trainer provided narrative notes
  if (input.rawInput && input.structuredNote) {
    const rpeFromNote =
      typeof input.structuredNote.rpeAvg === "number"
        ? input.structuredNote.rpeAvg
        : rpeAvg;
    await prisma.sessionNote.create({
      data: {
        clientId: input.clientId,
        date: workoutLog.date,
        rawInput: input.rawInput,
        structuredNote: input.structuredNote as import('@/app/generated/prisma/client').Prisma.InputJsonValue,
        rpeAvg: rpeFromNote,
      },
    });
  }
}

// ── addExerciseNote ────────────────────────────────────────────────────────────
//
// Persists a per-exercise coach observation for a client.
// These survive across program assignments — queried by (clientId, exerciseId).

export async function addExerciseNote(input: {
  clientId: string;
  exerciseId: string;
  note: string;
}): Promise<{ id: string }> {
  const { workspaceId } = await requireWorkspace();

  // Verify client belongs to workspace
  const client = await prisma.clientProfile.findFirst({
    where: { id: input.clientId, workspaceId },
    select: { id: true },
  });
  if (!client) throw new Error("Client not found");

  const created = await prisma.exerciseCoachNote.create({
    data: {
      workspaceId,
      clientId: input.clientId,
      exerciseId: input.exerciseId,
      note: input.note.trim(),
    },
    select: { id: true },
  });

  return { id: created.id };
}

// ── getLastPerformance ─────────────────────────────────────────────────────────
//
// Fetches the most recent SetLog rows for a specific client + exercise,
// within a 90-day lookback window. Returns [] if no history.
// Called server-side when rendering the logger page (not an action —
// used in a Server Component data fetch).

export async function getLastPerformance(
  clientId: string,
  exerciseId: string
): Promise<Array<{ weight: number | null; reps: number | null; rpe: number | null; completed: boolean }>> {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 90);

  const sets = await prisma.setLog.findMany({
    where: {
      exerciseId,
      workoutLog: {
        clientId,
        date: { gte: cutoff },
      },
    },
    orderBy: [
      { workoutLog: { date: "desc" } },
      { createdAt: "asc" },
    ],
    select: { weight: true, reps: true, rpe: true, completed: true, workoutLog: { select: { date: true } } },
    take: 20, // cap: most recent session might have many sets
  });

  if (sets.length === 0) return [];

  // Return only sets from the most recent session date
  const mostRecentDate = sets[0].workoutLog.date.toISOString().slice(0, 10);
  return sets
    .filter((s) => s.workoutLog.date.toISOString().slice(0, 10) === mostRecentDate)
    .map(({ weight, reps, rpe, completed }) => ({ weight, reps, rpe, completed }));
}

// ── getLastExerciseNote ────────────────────────────────────────────────────────
//
// Returns the most recent coach note for a client + exercise, or null.

export async function getLastExerciseNote(
  clientId: string,
  exerciseId: string
): Promise<string | null> {
  const note = await prisma.exerciseCoachNote.findFirst({
    where: { clientId, exerciseId },
    orderBy: { createdAt: "desc" },
    select: { note: true },
  });
  return note?.note ?? null;
}
