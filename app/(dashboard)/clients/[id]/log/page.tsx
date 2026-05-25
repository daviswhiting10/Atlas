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
  unit?: "reps" | "secs"; // "secs" for holds; undefined = reps (legacy)
  repMin: number;
  repMax: number;
  rpe: number | null;
  restSeconds: number | null;
  notes: string;
};

export type PrevSet = {
  weight: number | null;
  bandColor: string | null;
  reps: number | null;
  rpe: number | null;
};

export type LoggerExercise = {
  aweId: string;
  exerciseId: string;
  name: string;
  movementPattern: string;
  section: string | null; // "warmup" | "block_a" | "block_b" | "finisher" | null
  prescribedSets: PrescribedSet[];
  lastSets: Array<{
    weight: number | null;
    reps: number | null;
    rpe: number | null;
    completed: boolean;
  }>;
  /** Sets logged in the previous occurrence of this same workout (e.g. Week 1 when currently in Week 2). */
  prevWorkoutSets: PrevSet[];
  lastNote: string | null;
  suggestion: ProgressionSuggestion;
};

export type ExistingSetLog = {
  id: string;
  exerciseId: string | null;
  assignedWorkoutExerciseId: string | null;
  setNumber: number;
  weight: number | null;
  bandColor: string | null;
  reps: number | null;
  rpe: number | null;
  note: string | null;
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
      <div className="px-5 pt-5 md:px-8 md:pt-8 md:max-w-2xl">
        <p className="text-muted-foreground text-sm mb-2">
          No planned workouts found for {client.fullName}.
        </p>
        <a href={`/clients/${clientId}`} className="text-sm underline">
          Back to client profile
        </a>
      </div>
    );
  }

  // ── Fallback: load source workout sections (repairs data wiped by old Zod bug) ─
  // When AssignedWorkoutExercise.section is null (caused by the pre-fix update path
  // that didn't include section in the Zod schema), we read section directly from
  // the template WorkoutExercise, matching by order.
  const anyMissingSection = assignedWorkout.exercises.some((e) => e.section == null);
  const sourceSectionByOrder = new Map<number, string | null>();
  if (anyMissingSection && assignedWorkout.sourceWorkoutId) {
    const sourceExercises = await prisma.workoutExercise.findMany({
      where: { workoutId: assignedWorkout.sourceWorkoutId },
      select: { order: true, section: true },
    });
    for (const ex of sourceExercises) {
      sourceSectionByOrder.set(ex.order, ex.section ?? null);
    }
  }

  // ── Previous occurrence of this same workout template (for "Prev week" reference) ─
  // Find the most recent LOGGED assigned workout with the same sourceWorkoutId,
  // scheduled before today's workout. Used to show "Performed X lb last time."
  const prevWorkoutSetsByExercise: Record<string, PrevSet[]> = {};
  if (assignedWorkout.sourceWorkoutId) {
    const prevWorkout = await prisma.assignedWorkout.findFirst({
      where: {
        sourceWorkoutId: assignedWorkout.sourceWorkoutId,
        programAssignment: { clientId, workspaceId },
        status: "LOGGED",
        scheduledDate: { lt: assignedWorkout.scheduledDate },
      },
      orderBy: { scheduledDate: "desc" },
      select: {
        workoutLog: {
          select: {
            sets: {
              where: { completed: true },
              orderBy: { setNumber: "asc" },
              select: {
                exerciseId: true,
                weight: true,
                bandColor: true,
                reps: true,
                rpe: true,
              },
            },
          },
        },
      },
    });

    for (const set of prevWorkout?.workoutLog?.sets ?? []) {
      if (!set.exerciseId) continue;
      (prevWorkoutSetsByExercise[set.exerciseId] ??= []).push({
        weight: set.weight,
        bandColor: set.bandColor,
        reps: set.reps,
        rpe: set.rpe,
      });
    }
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

      // Use the assigned section, falling back to the source workout's section
      const section = awe.section ?? sourceSectionByOrder.get(awe.order) ?? null;

      return {
        aweId: awe.id,
        exerciseId: awe.exerciseId,
        name: awe.exercise.name,
        movementPattern: awe.exercise.movementPattern,
        section,
        prescribedSets,
        lastSets,
        prevWorkoutSets: prevWorkoutSetsByExercise[awe.exerciseId] ?? [],
        lastNote,
        suggestion,
      };
    })
  );

  // ── All workouts for this client (day-picker) — include logged so they show blurred ──
  const availableWorkouts = await prisma.assignedWorkout.findMany({
    where: {
      programAssignment: { clientId, workspaceId, status: "ACTIVE" },
      // No status filter — show PLANNED + LOGGED + SKIPPED so completed days appear blurred
    },
    orderBy: { order: "asc" },
    select: {
      id: true,
      name: true,
      scheduledDate: true,
      status: true,
      _count: { select: { exercises: true } },
    },
  });

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
          bandColor: true,
          reps: true,
          rpe: true,
          note: true,
          completed: true,
        },
      },
    },
  });

  return (
    <WorkoutLogger
      key={assignedWorkout.id}
      clientId={clientId}
      clientName={client.fullName}
      assignedWorkoutId={assignedWorkout.id}
      workoutName={assignedWorkout.name}
      scheduledDate={assignedWorkout.scheduledDate.toISOString()}
      assignmentName={assignedWorkout.programAssignment.name}
      assignmentStartDate={assignedWorkout.programAssignment.startDate.toISOString()}
      exercises={exercises}
      existingWorkoutLogId={existingLog?.id ?? null}
      existingSetLogs={(existingLog?.sets ?? []) as ExistingSetLog[]}
      availableWorkouts={availableWorkouts.map((w) => ({
        id: w.id,
        name: w.name,
        scheduledDate: w.scheduledDate.toISOString(),
        exerciseCount: w._count.exercises,
        status: w.status,
      }))}
    />
  );
}
