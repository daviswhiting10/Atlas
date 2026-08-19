import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db/client";
import { getClientLastPerformance } from "@/lib/actions/client-workout-logger";
import ClientWorkoutLogger from "./ClientWorkoutLogger";

export type PrescribedSet = {
  setNumber: number;
  weight: number | null;
  unit?: "reps" | "secs";
  repMin: number;
  repMax: number;
  restSeconds: number | null;
};

export type ClientLoggerExercise = {
  aweId: string;
  exerciseId: string;
  name: string;
  equipment: string;
  section: string | null;
  prescribedSets: PrescribedSet[];
  lastSets: Array<{ setNumber: number; weight: number | null; reps: number | null; rpe: number | null; completed: boolean }>;
};

export type ExistingSetLog = {
  id: string;
  exerciseId: string | null;
  assignedWorkoutExerciseId: string | null;
  setNumber: number;
  weight: number | null;
  reps: number | null;
  rpe: number | null;
  completed: boolean;
};

export default async function ClientWorkoutPage({
  params,
}: {
  params: Promise<{ assignedWorkoutId: string }>;
}) {
  const [session, { assignedWorkoutId }] = await Promise.all([auth(), params]);

  const clientProfileId = session?.user?.clientProfileId;
  if (session?.user?.role !== "CLIENT" || !clientProfileId) redirect("/login");

  const assignedWorkout = await prisma.assignedWorkout.findFirst({
    where: {
      id: assignedWorkoutId,
      programAssignment: { clientId: clientProfileId },
    },
    include: {
      exercises: {
        orderBy: { order: "asc" },
        include: {
          exercise: { select: { id: true, name: true, equipment: true } },
        },
      },
      programAssignment: { select: { name: true, startDate: true } },
    },
  });
  if (!assignedWorkout) notFound();

  const workspaceId = session.user.workspaceId;
  const weekNum =
    Math.floor(
      (assignedWorkout.scheduledDate.getTime() - assignedWorkout.programAssignment.startDate.getTime()) /
        (7 * 24 * 60 * 60 * 1000)
    ) + 1;

  const [existingLog, exercises, trainer] = await Promise.all([
    prisma.workoutLog.findUnique({
      where: { assignedWorkoutId: assignedWorkout.id },
      select: {
        id: true,
        clientNotes: true,
        durationMin: true,
        sets: {
          orderBy: { createdAt: "asc" },
          select: {
            id: true,
            exerciseId: true,
            assignedWorkoutExerciseId: true,
            setNumber: true,
            weight: true,
            reps: true,
            rpe: true,
            completed: true,
          },
        },
      },
    }),
    Promise.all(
      assignedWorkout.exercises.map(async (awe) => {
        const lastSets = await getClientLastPerformance(awe.exerciseId);
        return {
          aweId: awe.id,
          exerciseId: awe.exerciseId,
          name: awe.exercise.name,
          equipment: awe.exercise.equipment,
          section: awe.section,
          prescribedSets: awe.prescribedSets as PrescribedSet[],
          lastSets,
        } satisfies ClientLoggerExercise;
      })
    ),
    workspaceId
      ? prisma.user.findFirst({ where: { workspaceId, role: "TRAINER" }, select: { name: true } })
      : Promise.resolve(null),
  ]);

  return (
    <ClientWorkoutLogger
      assignedWorkoutId={assignedWorkout.id}
      workoutName={assignedWorkout.name}
      assignmentName={assignedWorkout.programAssignment.name}
      weekNum={weekNum}
      scheduledDate={assignedWorkout.scheduledDate.toISOString()}
      status={assignedWorkout.status}
      coachName={trainer?.name ?? null}
      coachNote={assignedWorkout.notes}
      exercises={exercises}
      existingWorkoutLogId={existingLog?.id ?? null}
      existingSetLogs={(existingLog?.sets ?? []) as ExistingSetLog[]}
      existingClientNotes={existingLog?.clientNotes ?? ""}
      existingDurationMin={existingLog?.durationMin ?? null}
    />
  );
}
