/**
 * Editing a plan after it has been built.
 *
 * One set of functions, used by every surface that can change a plan: the
 * athlete's Plan screen, the workout logger, the coach's editor and the MCP
 * tools. Each takes the scope explicitly — which client, in which workspace —
 * and puts it in the query, so a caller can only ever touch their own plan.
 *
 * Nothing here deletes training history. Removing a workout or an exercise
 * detaches the sets already logged against it; they stay in the charts.
 */

import { prisma } from "@/lib/db/client";
import type { Prisma } from "@/app/generated/prisma/client";
import { CATALOG_BY_SLUG } from "./catalog";
import { ensureCatalog } from "./persist";

/**
 * Whose plan, and which one. Without an assignmentId the edit applies to the
 * client's live plan only. A coach editing a draft passes its id explicitly,
 * so the athlete's live plan can never be changed by mistake.
 */
export type PlanScope = { clientId: string; workspaceId: string; assignmentId?: string };

export class PlanEditError extends Error {
  constructor(
    public readonly kind: "not_found" | "invalid",
    message: string
  ) {
    super(message);
    this.name = "PlanEditError";
  }
}
const notFound = (what = "That workout") => new PlanEditError("not_found", `${what} isn't part of this plan.`);
const invalid = (message: string) => new PlanEditError("invalid", message);

export const LIMITS = { workoutsPerWeek: 14, exercisesPerWorkout: 12, sets: 10, reps: 100, seconds: 600, weight: 1000, note: 2000, name: 60 } as const;

const DAY_MS = 86_400_000;
/** The plan an edit may touch: the named one (live or a coach's draft), or else the live plan. */
const planWhere = (scope: PlanScope): Prisma.ProgramAssignmentWhereInput => ({
  clientId: scope.clientId,
  workspaceId: scope.workspaceId,
  ...(scope.assignmentId ? { id: scope.assignmentId, status: { in: ["ACTIVE", "PAUSED"] } } : { status: "ACTIVE" }),
});

type SetShape = { setNumber: number; weight: number | null; unit?: "reps" | "secs"; repMin: number; repMax: number; rpe: number | null; restSeconds: number | null };

const clampInt = (n: unknown, min: number, max: number, fallback: number) => {
  const v = Math.round(Number(n));
  return Number.isFinite(v) ? Math.min(Math.max(v, min), max) : fallback;
};
const cleanText = (text: unknown, max: number): string | null => {
  const t = typeof text === "string" ? text.replace(/\r\n/g, "\n").trim().slice(0, max) : "";
  return t.length > 0 ? t : null;
};

/** The workout, if it belongs to this client's editable plan. */
async function ownWorkout(scope: PlanScope, workoutId: string) {
  const w = await prisma.assignedWorkout.findFirst({
    where: { id: workoutId, workspaceId: scope.workspaceId, programAssignment: planWhere(scope) },
    select: { id: true, name: true, order: true, scheduledDate: true, status: true, programAssignmentId: true, _count: { select: { exercises: true } } },
  });
  if (!w) throw notFound();
  return w;
}

/** The exercise row, if it sits inside one of this client's editable workouts. */
async function ownExercise(scope: PlanScope, aweId: string) {
  const e = await prisma.assignedWorkoutExercise.findFirst({
    where: { id: aweId, workspaceId: scope.workspaceId, assignedWorkout: { programAssignment: planWhere(scope) } },
    select: { id: true, exerciseId: true, assignedWorkoutId: true, prescribedSets: true, order: true },
  });
  if (!e) throw notFound("That exercise");
  return e;
}

/** A catalog slug, or the id of any exercise this workspace may see. */
async function resolveExercise(scope: PlanScope, ref: { slug?: string; exerciseId?: string }) {
  if (ref.slug) {
    if (!CATALOG_BY_SLUG[ref.slug]) throw invalid("Unknown exercise.");
    const ids = await ensureCatalog();
    const id = ids[ref.slug];
    if (!id) throw invalid("Unknown exercise.");
    return { id, unit: CATALOG_BY_SLUG[ref.slug].unit ?? ("reps" as const) };
  }
  if (ref.exerciseId) {
    const e = await prisma.exercise.findFirst({
      where: { id: ref.exerciseId, OR: [{ workspaceId: null }, { workspaceId: scope.workspaceId }] },
      select: { id: true, slug: true },
    });
    if (!e) throw notFound("That exercise");
    return { id: e.id, unit: CATALOG_BY_SLUG[e.slug]?.unit ?? ("reps" as const) };
  }
  throw invalid("Say which exercise.");
}

export type TargetInput = { sets?: number; repMin?: number; repMax?: number; weight?: number | null; restSeconds?: number };

function buildSets(input: TargetInput, unit: "reps" | "secs", previous?: SetShape[]): SetShape[] {
  const before = previous?.[0];
  const top = unit === "secs" ? LIMITS.seconds : LIMITS.reps;
  const sets = clampInt(input.sets ?? previous?.length, 1, LIMITS.sets, 3);
  const repMin = clampInt(input.repMin ?? before?.repMin, 1, top, unit === "secs" ? 30 : 8);
  const repMax = Math.max(repMin, clampInt(input.repMax ?? before?.repMax, 1, top, unit === "secs" ? 60 : 12));
  const rawWeight = input.weight === undefined ? (before?.weight ?? null) : input.weight;
  const weight = rawWeight == null || !Number.isFinite(rawWeight) || rawWeight <= 0 ? null : Math.min(rawWeight, LIMITS.weight);
  const restSeconds = clampInt(input.restSeconds ?? before?.restSeconds, 15, 600, 90);
  return Array.from({ length: sets }, (_, i) => ({ setNumber: i + 1, weight, unit, repMin, repMax, rpe: null, restSeconds }));
}

// ── Workouts ────────────────────────────────────────────────────────────────

/**
 * Add a workout to a week of the plan. It lands on the first free day of that
 * week, after the workouts already there. Start empty, or as a copy of an
 * existing workout.
 */
export async function addWorkout(scope: PlanScope, input: { week: number; name: string; copyFromWorkoutId?: string }): Promise<{ workoutId: string }> {
  const name = cleanText(input.name, LIMITS.name);
  if (!name) throw invalid("Give the workout a name.");

  const plan = await prisma.programAssignment.findFirst({
    where: planWhere(scope),
    orderBy: { createdAt: "desc" },
    select: { id: true, startDate: true, assignedWorkouts: { select: { id: true, order: true, scheduledDate: true } } },
  });
  if (!plan) throw notFound("An active plan");

  const lastWeek = plan.assignedWorkouts.reduce((m, w) => Math.max(m, Math.floor(Math.round((w.scheduledDate.getTime() - plan.startDate.getTime()) / DAY_MS) / 7) + 1), 1);
  const week = clampInt(input.week, 1, Math.max(lastWeek, 12), 1);
  const weekStart = new Date(plan.startDate);
  weekStart.setDate(weekStart.getDate() + (week - 1) * 7);
  const dayOf = (d: Date) => Math.round((d.getTime() - weekStart.getTime()) / DAY_MS);

  const inWeek = plan.assignedWorkouts.filter((w) => dayOf(w.scheduledDate) >= 0 && dayOf(w.scheduledDate) < 7);
  if (inWeek.length >= LIMITS.workoutsPerWeek) throw invalid("That week is full.");
  const taken = new Set(inWeek.map((w) => dayOf(w.scheduledDate)));
  const offset = [0, 1, 2, 3, 4, 5, 6].find((d) => !taken.has(d)) ?? 6;
  const scheduledDate = new Date(weekStart);
  scheduledDate.setDate(scheduledDate.getDate() + offset);

  // Slot it in after everything scheduled up to the end of that week.
  const weekEnd = weekStart.getTime() + 7 * DAY_MS;
  const order = plan.assignedWorkouts.filter((w) => w.scheduledDate.getTime() < weekEnd).reduce((m, w) => Math.max(m, w.order), 0) + 1;

  const source = input.copyFromWorkoutId
    ? await prisma.assignedWorkout.findFirst({
        where: { id: input.copyFromWorkoutId, programAssignmentId: plan.id },
        select: { exercises: { orderBy: { order: "asc" }, select: { exerciseId: true, order: true, prescribedSets: true, section: true } } },
      })
    : null;
  if (input.copyFromWorkoutId && !source) throw notFound("The workout to copy");

  const created = await prisma.$transaction(async (tx) => {
    await tx.assignedWorkout.updateMany({ where: { programAssignmentId: plan.id, order: { gte: order } }, data: { order: { increment: 1 } } });
    return tx.assignedWorkout.create({
      data: {
        workspaceId: scope.workspaceId,
        programAssignmentId: plan.id,
        name,
        scheduledDate,
        loggedBy: "CLIENT",
        status: "PLANNED",
        order,
        exercises: {
          create: (source?.exercises ?? []).map((e) => ({
            workspaceId: scope.workspaceId,
            exerciseId: e.exerciseId,
            order: e.order,
            prescribedSets: e.prescribedSets as Prisma.InputJsonValue,
            section: e.section,
          })),
        },
      },
      select: { id: true },
    });
  });
  return { workoutId: created.id };
}

/**
 * Take a workout out of the plan. Anything already logged in it is kept: the
 * session becomes a standalone one and its sets stay in the charts.
 */
export async function removeWorkout(scope: PlanScope, workoutId: string): Promise<void> {
  const w = await ownWorkout(scope, workoutId);
  await prisma.$transaction(async (tx) => {
    await tx.setLog.updateMany({ where: { assignedWorkoutExercise: { assignedWorkoutId: w.id } }, data: { assignedWorkoutExerciseId: null } });
    await tx.workoutLog.updateMany({ where: { assignedWorkoutId: w.id }, data: { assignedWorkoutId: null } });
    await tx.assignedWorkout.delete({ where: { id: w.id } });
    await tx.assignedWorkout.updateMany({ where: { programAssignmentId: w.programAssignmentId, order: { gt: w.order } }, data: { order: { decrement: 1 } } });
  });
}

export async function renameWorkout(scope: PlanScope, workoutId: string, name: string): Promise<void> {
  const w = await ownWorkout(scope, workoutId);
  const clean = cleanText(name, LIMITS.name);
  if (!clean) throw invalid("Give the workout a name.");
  await prisma.assignedWorkout.update({ where: { id: w.id }, data: { name: clean } });
}

// ── Exercises ───────────────────────────────────────────────────────────────

export async function addExercise(
  scope: PlanScope,
  input: { workoutId: string; slug?: string; exerciseId?: string } & TargetInput
): Promise<{ aweId: string }> {
  const w = await ownWorkout(scope, input.workoutId);
  if (w._count.exercises >= LIMITS.exercisesPerWorkout) throw invalid("That workout is full.");
  const exercise = await resolveExercise(scope, input);

  const existing = await prisma.assignedWorkoutExercise.findMany({ where: { assignedWorkoutId: w.id }, select: { exerciseId: true, order: true } });
  if (existing.some((e) => e.exerciseId === exercise.id)) throw invalid("That exercise is already in this workout.");

  const created = await prisma.assignedWorkoutExercise.create({
    data: {
      workspaceId: scope.workspaceId,
      assignedWorkoutId: w.id,
      exerciseId: exercise.id,
      order: existing.reduce((m, e) => Math.max(m, e.order), 0) + 1,
      prescribedSets: buildSets(input, exercise.unit),
      section: "accessory",
    },
    select: { id: true },
  });
  return { aweId: created.id };
}

/** Remove an exercise from a workout. Sets already logged for it are kept as history. */
export async function removeExercise(scope: PlanScope, aweId: string): Promise<void> {
  const e = await ownExercise(scope, aweId);
  await prisma.$transaction([
    prisma.setLog.updateMany({ where: { assignedWorkoutExerciseId: e.id }, data: { assignedWorkoutExerciseId: null } }),
    prisma.assignedWorkoutExercise.delete({ where: { id: e.id } }),
  ]);
}

/**
 * Replace an exercise with another in this one workout. Sets already logged
 * stay with the exercise they were actually done on.
 */
export async function swapExercise(scope: PlanScope, input: { aweId: string; slug?: string; exerciseId?: string }): Promise<void> {
  const e = await ownExercise(scope, input.aweId);
  const next = await resolveExercise(scope, input);
  if (next.id === e.exerciseId) return;

  const clash = await prisma.assignedWorkoutExercise.findFirst({ where: { assignedWorkoutId: e.assignedWorkoutId, exerciseId: next.id }, select: { id: true } });
  if (clash) throw invalid("That exercise is already in this workout.");

  const previous = (e.prescribedSets as SetShape[] | null) ?? [];
  // Keep the set count; the rep range carries over unless the unit changes; the weight never does.
  const sameUnit = (previous[0]?.unit ?? "reps") === next.unit;
  const sets = buildSets({ sets: previous.length || 3, weight: null, ...(sameUnit ? {} : { repMin: undefined, repMax: undefined }) }, next.unit, sameUnit ? previous : undefined);

  await prisma.$transaction([
    prisma.setLog.updateMany({ where: { assignedWorkoutExerciseId: e.id }, data: { assignedWorkoutExerciseId: null } }),
    prisma.assignedWorkoutExercise.update({ where: { id: e.id }, data: { exerciseId: next.id, prescribedSets: sets } }),
  ]);
}

/** Change the sets, rep range or target weight of one exercise in one workout. */
export async function setTargets(scope: PlanScope, input: { aweId: string } & TargetInput): Promise<void> {
  const e = await ownExercise(scope, input.aweId);
  const previous = (e.prescribedSets as SetShape[] | null) ?? [];
  const unit = previous[0]?.unit === "secs" ? "secs" : "reps";
  await prisma.assignedWorkoutExercise.update({ where: { id: e.id }, data: { prescribedSets: buildSets(input, unit, previous) } });
}

// ── Notes ───────────────────────────────────────────────────────────────────

export async function setWorkoutNote(scope: PlanScope, workoutId: string, text: string | null): Promise<void> {
  const w = await ownWorkout(scope, workoutId);
  await prisma.assignedWorkout.update({ where: { id: w.id }, data: { notes: cleanText(text, LIMITS.note) } });
}

/**
 * Turn the plan's lighter weeks on or off. Nothing stored is rewritten: the
 * weeks are read from this switch, so turning it back restores the plan.
 */
export async function setLighterWeeks(scope: PlanScope, on: boolean): Promise<void> {
  const { count } = await prisma.programAssignment.updateMany({ where: planWhere(scope), data: { lighterWeeks: on } });
  if (count === 0) throw notFound("An active plan");
}

export async function setPlanNote(scope: PlanScope, text: string | null): Promise<void> {
  const { count } = await prisma.programAssignment.updateMany({
    where: planWhere(scope),
    data: { notes: cleanText(text, LIMITS.note) },
  });
  if (count === 0) throw notFound("An active plan");
}
