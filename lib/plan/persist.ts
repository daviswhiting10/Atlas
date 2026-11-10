/**
 * Persists a generated plan into the existing program schema:
 * Program → Blocks, ProgramAssignment → AssignedWorkouts → exercises.
 *
 * Everything is written with createMany and pre-generated ids so a full
 * 12-week plan (and, for the demo, eight weeks of history) is a handful of
 * round-trips instead of hundreds.
 */

import { randomUUID } from "crypto";
import { prisma } from "@/lib/db/client";
import type { Prisma } from "@/app/generated/prisma/client";
import { CATALOG, CATALOG_BY_SLUG } from "./catalog";
import {
  GOALS,
  TOTAL_WEEKS,
  generatePlan,
  toPrescribedSets,
  weekInfo,
  weekVariant,
  type Prefs,
} from "./generator";

const id = () => randomUUID().replace(/-/g, "");

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
      select: { id: true, slug: true },
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
        ? await prisma.exercise.findMany({ where: { slug: { in: slugs } }, select: { id: true, slug: true } })
        : existing;
    return Object.fromEntries(all.map((e) => [e.slug, e.id]));
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
export async function createPlanForClient({
  workspaceId,
  clientId,
  prefs,
  startDate,
}: {
  workspaceId: string;
  clientId: string;
  prefs: Prefs;
  startDate: Date;
}): Promise<{ assignmentId: string; workouts: CreatedWorkout[] }> {
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

  for (let week = 1; week <= TOTAL_WEEKS; week++) {
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
        notes: info.deload
          ? "Lighter week — same weights, but stop each set two or three reps early and recover."
          : null,
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
          sets: e.sets,
          repMin: e.repMin,
          repMax: e.repMax,
          unit: e.unit,
        });
      });
      workouts.push(created);
    }
  }

  await prisma.programAssignment.updateMany({
    where: { clientId, status: "ACTIVE" },
    data: { status: "COMPLETED" },
  });

  await prisma.program.create({
    data: {
      id: programId,
      workspaceId,
      name: plan.name,
      description: plan.rationale.join(" "),
      goalTags: { goals: [GOALS[prefs.goal].primaryGoal], conditions: [] },
      durationWeeks: TOTAL_WEEKS,
      isTemplate: false,
      blocks: {
        create: plan.blocks.map((b, i) => ({
          workspaceId,
          name: b.name,
          order: i + 1,
          weeks: b.weeks,
          phase: PHASE_BY_GOAL[prefs.goal],
        })),
      },
    },
  });

  await prisma.programAssignment.create({
    data: {
      id: assignmentId,
      workspaceId,
      clientId,
      sourceProgramId: programId,
      name: plan.name,
      startDate: start,
      status: "ACTIVE",
    },
  });
  await prisma.assignedWorkout.createMany({ data: workoutRows });
  await prisma.assignedWorkoutExercise.createMany({ data: exerciseRows });

  return { assignmentId, workouts };
}

// ── Demo history ────────────────────────────────────────────────────────────

/** Small deterministic PRNG so the demo looks the same every time. */
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const LEVEL_SCALE = { beginner: 0.6, intermediate: 1, advanced: 1.3 } as const;

/**
 * Log realistic history for every workout scheduled before `until`.
 * Each lift follows double progression: reps climb through the range, then
 * the weight goes up — the same rule the app coaches the athlete with.
 */
export async function seedDemoHistory({
  clientId,
  prefs,
  workouts,
  until,
}: {
  clientId: string;
  prefs: Prefs;
  workouts: CreatedWorkout[];
  until: Date;
}): Promise<void> {
  const rand = mulberry32(20260519);
  const state = new Map<string, { weight: number | null; reps: number }>();
  const scale = LEVEL_SCALE[prefs.experience];

  const logRows: Prisma.WorkoutLogCreateManyInput[] = [];
  const setRows: Prisma.SetLogCreateManyInput[] = [];
  const loggedIds: string[] = [];
  const skippedIds: string[] = [];

  const past = workouts.filter((w) => w.scheduledDate.getTime() < until.getTime());

  for (let n = 0; n < past.length; n++) {
    const w = past[n];
    // Miss the occasional session so the consistency view looks human.
    if (n === 9 || n === 22) {
      skippedIds.push(w.id);
      continue;
    }

    const logId = id();
    const date = new Date(w.scheduledDate.getTime() + (17 + Math.floor(rand() * 3)) * 3_600_000);
    logRows.push({
      id: logId,
      clientId,
      assignedWorkoutId: w.id,
      date,
      durationMin: 46 + Math.floor(rand() * 20),
      trainerSeen: true,
    });
    loggedIds.push(w.id);

    for (const e of w.exercises) {
      const cat = CATALOG_BY_SLUG[e.slug];
      const inc = cat?.inc ?? 0;
      let s = state.get(e.slug);
      if (!s) {
        const base = cat?.base ?? null;
        const start = base == null ? null : Math.max(inc, Math.round((base * scale * 0.88) / (inc || 5)) * (inc || 5));
        const span = e.repMax - e.repMin;
        s = { weight: start, reps: e.unit === "secs" ? 30 : e.repMin + Math.floor(span / 2) };
        state.set(e.slug, s);
      }
      // Rep ranges shift between blocks — keep the lift inside today's range.
      if (e.unit === "reps" && s.weight != null) s.reps = Math.min(Math.max(s.reps, e.repMin), e.repMax);

      const topReps = w.deload ? Math.max(1, s.reps - 1) : s.reps;
      for (let i = 0; i < e.sets; i++) {
        const fatigue = e.unit === "secs" ? i * 5 : i >= 2 && rand() < 0.6 ? 1 : 0;
        setRows.push({
          workoutLogId: logId,
          exerciseId: e.exerciseId,
          assignedWorkoutExerciseId: e.id,
          setNumber: i + 1,
          weight: s.weight,
          reps: Math.max(1, topReps - fatigue),
          rpe: Math.min(9.5, 7 + Math.round(rand() * 4) / 2),
          completed: true,
          createdAt: new Date(date.getTime() + i * 150_000),
        });
      }

      if (w.deload) continue; // no progression on a lighter week
      const stalled = rand() < 0.15;
      if (e.unit === "secs") {
        if (!stalled) s.reps = Math.min(s.reps + 5, 120);
      } else if (s.weight == null || inc <= 0) {
        if (!stalled) s.reps += 1;
      } else if (s.reps >= e.repMax) {
        s.weight += inc;
        s.reps = Math.max(e.repMin, e.repMax - 2);
      } else if (!stalled) {
        s.reps += 1;
      }
    }
  }

  await prisma.workoutLog.createMany({ data: logRows });
  await prisma.setLog.createMany({ data: setRows });
  if (loggedIds.length > 0) {
    await prisma.assignedWorkout.updateMany({ where: { id: { in: loggedIds } }, data: { status: "LOGGED" } });
  }
  if (skippedIds.length > 0) {
    await prisma.assignedWorkout.updateMany({ where: { id: { in: skippedIds } }, data: { status: "SKIPPED" } });
  }
}
