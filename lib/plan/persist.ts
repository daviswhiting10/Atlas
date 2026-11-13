/**
 * Persists a generated plan into the existing program schema:
 * Program → Blocks, ProgramAssignment → AssignedWorkouts → exercises.
 *
 * Everything is written with createMany and pre-generated ids so a full
 * 12-week plan (and, for the demo, nine weeks of history) is a handful of
 * round-trips instead of hundreds.
 */

import { randomUUID } from "crypto";
import { prisma } from "@/lib/db/client";
import type { Prisma } from "@/app/generated/prisma/client";
import { CATALOG } from "./catalog";
import { simulateDemoHistory } from "./demo";
import {
  GOALS,
  generatePlan,
  planWeeks,
  toPrescribedSets,
  weekInfo,
  weekVariant,
  type Prefs,
} from "./generator";

const id = () => randomUUID().replace(/-/g, "");

/** The shared client, or a transaction handle when the caller wants all-or-nothing writes. */
type Db = Prisma.TransactionClient;

const PHASE_BY_GOAL = {
  muscle: "HYPERTROPHY",
  strength: "MAX_STRENGTH",
  fat_loss: "STRENGTH_ENDURANCE",
  general: "STABILIZATION_ENDURANCE",
} as const;

let catalogReady: Promise<Record<string, string>> | null = null;

/** Make sure every catalog exercise exists; returns slug → Exercise.id. */
export function ensureCatalog(): Promise<Record<string, string>> {
  catalogReady ??= (async () => {
    const slugs = CATALOG.map((e) => e.slug);
    const existing = await prisma.exercise.findMany({
      where: { slug: { in: slugs } },
      select: { id: true, slug: true, mergedIntoId: true },
    });
    const have = new Set(existing.map((e) => e.slug));
    const missing = CATALOG.filter((e) => !have.has(e.slug));
    if (missing.length > 0) {
      await prisma.exercise.createMany({
        skipDuplicates: true,
        data: missing.map((e) => ({
          name: e.name,
          slug: e.slug,
          movementPattern: e.pattern,
          primaryMuscles: e.muscles,
          secondaryMuscles: [],
          equipment: e.tool === "bodyweight" ? "body only" : e.tool,
          instructions: [],
        })),
      });
    }
    const all =
      missing.length > 0
        ? await prisma.exercise.findMany({ where: { slug: { in: slugs } }, select: { id: true, slug: true, mergedIntoId: true } })
        : existing;
    // A catalog exercise merged into another (Stiff-Legged Dumbbell Deadlift → Dumbbell Romanian Deadlift) plans as that one.
    return Object.fromEntries(all.map((e) => [e.slug, e.mergedIntoId ?? e.id]));
  })().catch((err) => {
    catalogReady = null; // don't cache a failure
    throw err;
  });
  return catalogReady;
}

export type CreatedWorkout = {
  id: string;
  week: number;
  dayIndex: number;
  scheduledDate: Date;
  deload: boolean;
  exercises: Array<{
    id: string;
    exerciseId: string;
    slug: string;
    role: "main" | "secondary" | "accessory";
    sets: number;
    repMin: number;
    repMax: number;
    unit: "reps" | "secs";
  }>;
};

/**
 * Create a plan for a client. Any previous active plan is marked completed —
 * its logged history stays, so charts carry over a rebuild.
 */
export async function createPlanForClient(
  {
    workspaceId,
    clientId,
    prefs,
    startDate,
    draft = false,
  }: {
    workspaceId: string;
    clientId: string;
    prefs: Prefs;
    startDate: Date;
    /** A coach's draft: saved but not yet the client's live plan. */
    draft?: boolean;
  },
  db: Db = prisma
): Promise<{ assignmentId: string; workouts: CreatedWorkout[] }> {
  const plan = generatePlan(prefs);
  const exerciseIds = await ensureCatalog();

  const start = new Date(startDate);
  start.setHours(0, 0, 0, 0);

  const programId = id();
  const assignmentId = id();

  const workouts: CreatedWorkout[] = [];
  const workoutRows: Prisma.AssignedWorkoutCreateManyInput[] = [];
  const exerciseRows: Prisma.AssignedWorkoutExerciseCreateManyInput[] = [];
  let order = 1;

  for (let week = 1; week <= planWeeks(plan); week++) {
    const info = weekInfo(plan, week);
    const days = weekVariant(plan, week);
    for (let d = 0; d < days.length; d++) {
      const day = days[d];
      const workoutId = id();
      // Calendar-day arithmetic (not milliseconds) so daylight-saving shifts
      // never push a workout onto the wrong day.
      const scheduledDate = new Date(start);
      scheduledDate.setDate(start.getDate() + (week - 1) * 7 + day.offset);
      const created: CreatedWorkout = {
        id: workoutId,
        week,
        dayIndex: d,
        scheduledDate,
        deload: info.deload,
        exercises: [],
      };
      workoutRows.push({
        id: workoutId,
        workspaceId,
        programAssignmentId: assignmentId,
        name: day.name,
        scheduledDate,
        loggedBy: "CLIENT" as const,
        status: "PLANNED" as const,
        order: order++,
        // Left empty for the athlete's or coach's own notes. The lighter-week
        // reminder is derived from the week number wherever it is shown.
        notes: null,
      });
      day.exercises.forEach((e, i) => {
        const exerciseId = exerciseIds[e.slug];
        if (!exerciseId) return;
        const aweId = id();
        exerciseRows.push({
          id: aweId,
          workspaceId,
          assignedWorkoutId: workoutId,
          exerciseId,
          order: i + 1,
          prescribedSets: toPrescribedSets(e),
          section: e.role,
        });
        created.exercises.push({
          id: aweId,
          exerciseId,
          slug: e.slug,
          role: e.role,
          sets: e.sets,
          repMin: e.repMin,
          repMax: e.repMax,
          unit: e.unit,
        });
      });
      workouts.push(created);
    }
  }

  // A new live plan replaces the old one. A draft (status PAUSED until a
  // coach assigns it) leaves the live plan alone.
  if (!draft) {
    await db.programAssignment.updateMany({
      where: { clientId, status: "ACTIVE" },
      data: { status: "COMPLETED" },
    });
  }

  await db.program.create({
    data: {
      id: programId,
      workspaceId,
      name: plan.name,
      description: plan.rationale.join(" "),
      // The preferences travel with the program, so any screen can rebuild
      // the plan's phases and reasoning without knowing who generated it.
      goalTags: { goals: [GOALS[plan.prefs.goal].primaryGoal], conditions: plan.prefs.conditions, prefs },
      durationWeeks: planWeeks(plan),
      isTemplate: false,
      isDraft: draft,
      blocks: {
        create: plan.blocks.map((b, i) => ({
          workspaceId,
          name: b.name,
          order: i + 1,
          weeks: b.weeks,
          phase: PHASE_BY_GOAL[plan.prefs.goal],
        })),
      },
    },
  });

  await db.programAssignment.create({
    data: {
      id: assignmentId,
      workspaceId,
      clientId,
      sourceProgramId: programId,
      name: plan.name,
      startDate: start,
      status: draft ? "PAUSED" : "ACTIVE",
      goalText: prefs.goalText ?? null,
    },
  });
  await db.assignedWorkout.createMany({ data: workoutRows });
  await db.assignedWorkoutExercise.createMany({ data: exerciseRows });

  return { assignmentId, workouts };
}

// ── Demo history ────────────────────────────────────────────────────────────

/**
 * Write the simulated history (lib/plan/demo.ts) for every workout scheduled
 * before `until`.
 */
export async function seedDemoHistory(
  {
    clientId,
    prefs,
    workouts,
    until,
  }: {
    clientId: string;
    prefs: Prefs;
    workouts: CreatedWorkout[];
    until: Date;
  },
  db: Db = prisma
): Promise<void> {
  const { logs, skipped } = simulateDemoHistory({ prefs, workouts, until });

  const logRows: Prisma.WorkoutLogCreateManyInput[] = [];
  const setRows: Prisma.SetLogCreateManyInput[] = [];
  for (const log of logs) {
    const logId = id();
    // A generated plan's history: each session finished the day it was done.
    logRows.push({ id: logId, clientId, assignedWorkoutId: log.workoutId, source: "GENERATED", date: log.date, completedAt: log.date, durationMin: log.durationMin, trainerSeen: true });
    for (const s of log.sets) {
      setRows.push({
        workoutLogId: logId,
        exerciseId: s.exerciseId,
        assignedWorkoutExerciseId: s.aweId,
        setNumber: s.setNumber,
        weight: s.weight,
        reps: s.reps,
        rpe: s.rpe,
        completed: true,
        createdAt: s.at,
      });
    }
  }

  await db.workoutLog.createMany({ data: logRows });
  await db.setLog.createMany({ data: setRows });
  // Done is the session's to say (completedAt above); nothing to mark on the plan workouts.
  if (skipped.length > 0) {
    await db.assignedWorkout.updateMany({ where: { id: { in: skipped } }, data: { status: "SKIPPED" } });
  }
}
