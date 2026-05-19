import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db/client";
import { suggestNext, type LoadType, type ProgressionSuggestion } from "@/lib/progression";
import {
  getLastPerformance,
  getLastExerciseNote,
} from "@/lib/actions/workout-logger";
import WorkoutLogger from "./WorkoutLogger";

// ── Types ──────────────────────────────────────────────────────────────────────

export type PrescribedSet = {
  setNumber: number;
  weight: number | null;
  repMin: number;
  repMax: number;
  rpe: number | null;
  restSeconds: number | null;
  notes: string;
};

export type LoggerExercise = {
  aweId: string;
  exerciseId: string;
  name: string;
  movementPattern: string;
  prescribedSets: PrescribedSet[];
  lastSets: Array<{
    weight: number | null;
    reps: number | null;
    rpe: number | null;
    completed: boolean;
  }>;
  lastNote: string | null;
  suggestion: ProgressionSuggestion;
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

// ── Helpers ────────────────────────────────────────────────────────────────────

function getLoadType(movementPattern: string, equipment: string): LoadType {
  const lower = ["SQUAT", "HINGE", "LUNGE", "LOCOMOTION"];
  if (equipment?.toLowerCase() === "bodyweight") return "bodyweight";
  if (lower.includes(movementPattern)) return "lower";
  return "upper";
}

// ── Page (Server Component) ────────────────────────────────────────────────────

export default async function LogPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ workoutId?: string }>;
}) {
  const session = await auth();
  const workspaceId = session?.user?.workspaceId;
  if (!workspaceId) redirect("/login");

  const { id: clientId } = await params;
  const { workoutId } = await searchParams;

  // ── Load client ─────────────────────────────────────────────────────────────
  const client = await prisma.clientProfile.findFirst({
    where: { id: clientId, workspaceId, deletedAt: null },
    select: { id: true, fullName: true, primaryGoal: true },
  });
  if (!client) notFound();

  // ── Load target workout ─────────────────────────────────────────────────────
  const workoutWhere = workoutId
    ? { id: workoutId, programAssignment: { clientId, workspaceId } }
    : {
        programAssignment: {
          clientId,
          workspaceId,
          status: "ACTIVE" as const,
        },
        status: "PLANNED" as const,
      };

  const assignedWorkout = await prisma.assignedWorkout.findFirst({
    where: workoutWhere,
    orderBy: workoutId ? undefined : { scheduledDate: "asc" },
    include: {
      exercises: {
        orderBy: { order: "asc" },
        include: {
          exercise: {
            select: {
              id: true,
              name: true,
              movementPattern: true,
              equipment: true,
            },
          },
        },
      },
      programAssignment: {
        select: {
          name: true,
          startDate: true,
          sourceProgram: {
            select: { goalTags: true },
          },
        },
      },
    },
  });

  // ── No workout to log ───────────────────────────────────────────────────────
  if (!assignedWorkout) {
    return (
      <div className="p-8 max-w-2xl">
        <p className="text-muted-foreground text-sm mb-2">
          No planned workouts found for {client.fullName}.
        </p>
        <a href={`/clients/${clientId}`} className="text-sm underline">
          Back to client profile
        </a>
      </div>
    );
  }

  // ── Per-exercise: last performance + note + suggestion ──────────────────────
  const goal = client.primaryGoal ?? "general";

  const exercises: LoggerExercise[] = await Promise.all(
    assignedWorkout.exercises.map(async (awe) => {
      const [lastSets, lastNote] = await Promise.all([
        getLastPerformance(clientId, awe.exerciseId),
        getLastExerciseNote(clientId, awe.exerciseId),
      ]);

      const prescribedSets = awe.prescribedSets as PrescribedSet[];
      const prescribedReps = prescribedSets[0]?.repMax ?? 10;
      const loadType = getLoadType(
        awe.exercise.movementPattern,
        awe.exercise.equipment
      );

      const suggestion = suggestNext({
        lastSets,
        prescribedReps,
        goal,
        exerciseLoadType: loadType,
      });

      return {
        aweId: awe.id,
        exerciseId: awe.exerciseId,
        name: awe.exercise.name,
        movementPattern: awe.exercise.movementPattern,
        prescribedSets,
        lastSets,
        lastNote,
        suggestion,
      };
    })
  );

  // ── Check for existing partial session (resume support) ────────────────────
  const existingLog = await prisma.workoutLog.findUnique({
    where: { assignedWorkoutId: assignedWorkout.id },
    select: {
      id: true,
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
  });

  return (
    <WorkoutLogger
      clientId={clientId}
      clientName={client.fullName}
      assignedWorkoutId={assignedWorkout.id}
      workoutName={assignedWorkout.name}
      scheduledDate={assignedWorkout.scheduledDate.toISOString()}
      assignmentName={assignedWorkout.programAssignment.name}
      exercises={exercises}
      existingWorkoutLogId={existingLog?.id ?? null}
      existingSetLogs={(existingLog?.sets ?? []) as ExistingSetLog[]}
    />
  );
}
