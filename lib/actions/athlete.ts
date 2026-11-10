"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db/client";
import { GOALS, normalizePrefs } from "@/lib/plan/generator";
import { createPlanForClient } from "@/lib/plan/persist";

// Every write derives the athlete from the session — never from the request —
// and re-checks ownership of the row it touches.
async function requireAthlete() {
  const session = await auth();
  const clientId = session?.user?.clientProfileId;
  const workspaceId = session?.user?.workspaceId;
  if (session?.user?.role !== "CLIENT" || !clientId || !workspaceId) throw new Error("Unauthorized");
  return { clientId, workspaceId };
}

const clean = (n: number | null, max: number) =>
  n == null || !Number.isFinite(n) || n < 0 ? null : Math.min(n, max);

function refresh() {
  revalidatePath("/today");
  revalidatePath("/plan");
  revalidatePath("/progress");
}

/** Save (or update) one set. Creates today's workout log on the first set. */
export async function saveSet(input: {
  assignedWorkoutId: string;
  aweId: string;
  setNumber: number;
  weight: number | null;
  reps: number | null;
  done: boolean;
  setLogId?: string | null;
}): Promise<{ workoutLogId: string; setLogId: string }> {
  const { clientId } = await requireAthlete();

  const awe = await prisma.assignedWorkoutExercise.findFirst({
    where: {
      id: input.aweId,
      assignedWorkoutId: input.assignedWorkoutId,
      assignedWorkout: { programAssignment: { clientId } },
    },
    select: { exerciseId: true },
  });
  if (!awe) throw new Error("Workout not found");

  const log =
    (await prisma.workoutLog.findUnique({
      where: { assignedWorkoutId: input.assignedWorkoutId },
      select: { id: true, clientId: true },
    })) ??
    (await prisma.workoutLog.create({
      data: { clientId, assignedWorkoutId: input.assignedWorkoutId, date: new Date() },
      select: { id: true, clientId: true },
    }));
  if (log.clientId !== clientId) throw new Error("Workout not found");

  const data = {
    weight: clean(input.weight, 2000),
    reps: clean(input.reps, 1000) == null ? null : Math.round(clean(input.reps, 1000) as number),
    completed: input.done,
  };

  const existing = input.setLogId
    ? await prisma.setLog.findFirst({ where: { id: input.setLogId, workoutLogId: log.id }, select: { id: true } })
    : await prisma.setLog.findFirst({
        where: { workoutLogId: log.id, assignedWorkoutExerciseId: input.aweId, setNumber: input.setNumber },
        select: { id: true },
      });

  const setLogId = existing
    ? (await prisma.setLog.update({ where: { id: existing.id }, data, select: { id: true } })).id
    : (
        await prisma.setLog.create({
          data: {
            ...data,
            workoutLogId: log.id,
            exerciseId: awe.exerciseId,
            assignedWorkoutExerciseId: input.aweId,
            setNumber: input.setNumber,
          },
          select: { id: true },
        })
      ).id;

  return { workoutLogId: log.id, setLogId };
}

export async function finishWorkout(input: { assignedWorkoutId: string; durationMin?: number }): Promise<void> {
  const { clientId } = await requireAthlete();
  const workout = await prisma.assignedWorkout.findFirst({
    where: { id: input.assignedWorkoutId, programAssignment: { clientId } },
    select: { id: true, workoutLog: { select: { id: true } } },
  });
  if (!workout) throw new Error("Workout not found");

  await prisma.assignedWorkout.update({ where: { id: workout.id }, data: { status: "LOGGED", loggedBy: "CLIENT" } });
  if (workout.workoutLog) {
    await prisma.workoutLog.update({
      where: { id: workout.workoutLog.id },
      data: { durationMin: clean(input.durationMin ?? null, 600) },
    });
  }
  await prisma.clientProfile.update({ where: { id: clientId }, data: { lastContactAt: new Date() } });
  refresh();
}

/** Skip a workout so the next one moves up, or bring a skipped one back. */
export async function setWorkoutSkipped(input: { assignedWorkoutId: string; skipped: boolean }): Promise<void> {
  const { clientId } = await requireAthlete();
  await prisma.assignedWorkout.updateMany({
    where: {
      id: input.assignedWorkoutId,
      programAssignment: { clientId },
      status: input.skipped ? "PLANNED" : "SKIPPED",
    },
    data: { status: input.skipped ? "SKIPPED" : "PLANNED" },
  });
  refresh();
}

/** Regenerate the plan from new goals. Logged history is kept. */
export async function rebuildPlan(rawPrefs: unknown): Promise<void> {
  const { clientId, workspaceId } = await requireAthlete();
  const prefs = normalizePrefs(rawPrefs);

  const profile = await prisma.clientProfile.findUnique({ where: { id: clientId }, select: { goalTargets: true } });
  const existing = (profile?.goalTargets as Record<string, unknown> | null) ?? {};
  const meta = (existing.athlete as { demo?: boolean } | undefined) ?? {};

  await createPlanForClient({ workspaceId, clientId, prefs, startDate: new Date() });
  await prisma.clientProfile.update({
    where: { id: clientId },
    data: {
      primaryGoal: GOALS[prefs.goal].primaryGoal,
      goalTargets: { ...existing, athlete: { prefs, demo: meta.demo === true } },
    },
  });
  refresh();
  revalidatePath("/you");
}
