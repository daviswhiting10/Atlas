"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { athleteIdentity } from "@/lib/athlete/identity";
import { prisma } from "@/lib/db/client";
import { GOALS, normalizePrefs, resolvePrefs } from "@/lib/plan/generator";
import { createPlanForClient, ensureCatalog } from "@/lib/plan/persist";
import { assignProgram } from "@/lib/db/programs";
import { checkSessionMilestones } from "@/lib/progress/milestones";
import { MAX_SETS } from "@/lib/athlete/data";
import {
  LIMITS,
  PlanEditError,
  addExercise,
  addWorkout,
  removeExercise,
  removeWorkout,
  setLighterWeeks,
  setPlanNote,
  setTargets,
  setWorkoutNote,
  swapExercise,
  type PlanScope,
} from "@/lib/plan/edit";

// Every write derives the athlete from the session — never from the request —
// and re-checks ownership of the row it touches.
async function requireAthlete() {
  const session = await auth();
  // A client's own profile, or a coach's My training.
  const identity = await athleteIdentity(session?.user);
  if (!identity) throw new Error("Unauthorized");
  return { clientId: identity.clientId, workspaceId: identity.workspaceId };
}

const clean = (n: number | null, max: number) =>
  n == null || !Number.isFinite(n) || n < 0 ? null : Math.min(n, max);

// Server actions are public endpoints: TypeScript types are not enforced at
// runtime, so every input is parsed.
const SaveSetInput = z.object({
  assignedWorkoutId: z.string().min(1).max(64),
  aweId: z.string().min(1).max(64),
  setNumber: z.number().int().min(1).max(MAX_SETS),
  weight: z.number().nullable(),
  reps: z.number().nullable(),
  done: z.boolean(),
  setLogId: z.string().max(64).nullish(),
});
const WorkoutRef = z.object({ assignedWorkoutId: z.string().min(1).max(64) });

const MAX_REBUILDS_PER_HOUR = 5;

function refresh() {
  revalidatePath("/today");
  revalidatePath("/plan");
  revalidatePath("/progress");
}

/** Save (or update) one set. Creates today's workout log on the first set. */
export async function saveSet(raw: z.input<typeof SaveSetInput>): Promise<{ workoutLogId: string; setLogId: string }> {
  const { clientId } = await requireAthlete();
  const input = SaveSetInput.parse(raw);

  const awe = await prisma.assignedWorkoutExercise.findFirst({
    where: {
      id: input.aweId,
      assignedWorkoutId: input.assignedWorkoutId,
      assignedWorkout: { programAssignment: { clientId } },
    },
    select: { exerciseId: true },
  });
  if (!awe) throw new Error("Workout not found");

  const findLog = () =>
    prisma.workoutLog.findUnique({
      where: { assignedWorkoutId: input.assignedWorkoutId },
      select: { id: true, clientId: true },
    });
  const log =
    (await findLog()) ??
    (await prisma.workoutLog
      .create({
        data: { clientId, assignedWorkoutId: input.assignedWorkoutId, date: new Date() },
        select: { id: true, clientId: true },
      })
      // Two tabs logging the first set at once: the loser of the race reuses the winner's log.
      .catch(() => findLog()));
  if (!log || log.clientId !== clientId) throw new Error("Workout not found");

  const data = {
    weight: clean(input.weight, 1000),
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

export async function finishWorkout(raw: { assignedWorkoutId: string; durationMin?: number }): Promise<void> {
  const { clientId, workspaceId } = await requireAthlete();
  const input = WorkoutRef.extend({ durationMin: z.number().optional() }).parse(raw);
  const workout = await prisma.assignedWorkout.findFirst({
    where: { id: input.assignedWorkoutId, programAssignment: { clientId } },
    select: { id: true, workoutLog: { select: { id: true, sets: { where: { completed: true }, select: { id: true }, take: 1 } } } },
  });
  if (!workout) throw new Error("Workout not found");
  if (!workout.workoutLog || workout.workoutLog.sets.length === 0) throw new Error("Log at least one set first");

  const duration = clean(input.durationMin ?? null, 600);
  await prisma.$transaction([
    prisma.assignedWorkout.update({ where: { id: workout.id }, data: { status: "LOGGED", loggedBy: "CLIENT" } }),
    prisma.workoutLog.update({
      where: { id: workout.workoutLog.id },
      data: duration == null ? {} : { durationMin: Math.round(duration) },
    }),
    prisma.clientProfile.update({ where: { id: clientId }, data: { lastContactAt: new Date() } }),
  ]);

  // Session-count milestones feed the coach's view; never block the athlete on them.
  checkSessionMilestones(workspaceId, clientId).catch((err: unknown) => console.error("[milestones] session check:", err));
  refresh();
}

/** Skip a workout so the next one moves up, or bring a skipped one back. */
export async function setWorkoutSkipped(raw: { assignedWorkoutId: string; skipped: boolean }): Promise<void> {
  const { clientId } = await requireAthlete();
  const input = WorkoutRef.extend({ skipped: z.boolean() }).parse(raw);
  const { count } = await prisma.assignedWorkout.updateMany({
    where: {
      id: input.assignedWorkoutId,
      programAssignment: { clientId },
      status: input.skipped ? "PLANNED" : "SKIPPED",
    },
    data: { status: input.skipped ? "SKIPPED" : "PLANNED" },
  });
  if (count === 0) throw new Error("That workout can't be changed");
  refresh();
}

/** Regenerate the plan from new goals. Logged history is kept. */
export async function rebuildPlan(rawPrefs: unknown): Promise<void> {
  const { clientId, workspaceId } = await requireAthlete();
  const prefs = normalizePrefs(rawPrefs);

  const profile = await prisma.clientProfile.findUnique({ where: { id: clientId }, select: { goalTargets: true } });
  const existing = (profile?.goalTargets as Record<string, unknown> | null) ?? {};
  const meta = existing.athlete as { demo?: boolean } | undefined;
  // Only athletes who generated their own plan may replace it. A client whose
  // coach wrote their program must not be able to overwrite it from here.
  if (!meta) throw new Error("Your plan is managed by your coach");

  const recent = await prisma.programAssignment.count({
    where: { clientId, createdAt: { gte: new Date(Date.now() - 3_600_000) } },
  });
  if (recent >= MAX_REBUILDS_PER_HOUR) throw new Error("You've rebuilt your plan a lot in the last hour. Try again later.");

  await ensureCatalog();
  await prisma.$transaction(
    async (tx) => {
      await createPlanForClient({ workspaceId, clientId, prefs, startDate: new Date() }, tx);
      await tx.clientProfile.update({
        where: { id: clientId },
        data: {
          primaryGoal: GOALS[resolvePrefs(prefs).goal].primaryGoal,
          goalTargets: { ...existing, athlete: { prefs, demo: meta.demo === true } },
        },
      });
    },
    { timeout: 20_000, maxWait: 10_000 }
  );
  refresh();
  revalidatePath("/you");
}

// ── Editing the plan ─────────────────────────────────────────────────────────
// Thin wrappers over lib/plan/edit.ts, which the coach editor and the MCP
// tools call too. These return a result instead of throwing, because Next
// hides the message of an error thrown from a server action in production and
// the athlete should be told why something was refused.

export type EditResult<T = unknown> = ({ ok: true } & T) | { ok: false; error: string };

async function edit<T extends object>(run: (scope: PlanScope) => Promise<T | void>, workoutId?: string): Promise<EditResult<T>> {
  try {
    const { clientId, workspaceId } = await requireAthlete();
    const result = await run({ clientId, workspaceId });
    refresh();
    if (workoutId) revalidatePath(`/workouts/${workoutId}`);
    return { ok: true, ...((result ?? {}) as T) };
  } catch (err) {
    if (err instanceof PlanEditError) return { ok: false, error: err.message };
    if (err instanceof z.ZodError) return { ok: false, error: "That doesn't look right. Check the values and try again." };
    console.error("[plan edit]", err);
    return { ok: false, error: "Couldn't save that change. Please try again." };
  }
}

const Ref = z.string().min(1).max(64);
const Targets = z.object({
  sets: z.number().int().min(1).max(LIMITS.sets).optional(),
  repMin: z.number().int().min(1).max(LIMITS.seconds).optional(),
  repMax: z.number().int().min(1).max(LIMITS.seconds).optional(),
  weight: z.number().min(0).max(LIMITS.weight).nullable().optional(),
});

export async function planAddWorkout(raw: { week: number; name: string; copyFromWorkoutId?: string }) {
  const input = z.object({ week: z.number().int().min(1).max(52), name: z.string().max(200), copyFromWorkoutId: Ref.optional() }).parse(raw);
  return edit((scope) => addWorkout(scope, input));
}

export async function planRemoveWorkout(workoutId: string) {
  return edit((scope) => removeWorkout(scope, Ref.parse(workoutId)));
}

export async function planAddExercise(raw: { workoutId: string; slug: string } & z.input<typeof Targets>) {
  const input = Targets.extend({ workoutId: Ref, slug: Ref }).parse(raw);
  return edit((scope) => addExercise(scope, input), input.workoutId);
}

export async function planRemoveExercise(raw: { aweId: string; workoutId: string }) {
  const input = z.object({ aweId: Ref, workoutId: Ref }).parse(raw);
  return edit((scope) => removeExercise(scope, input.aweId), input.workoutId);
}

export async function planSwapExercise(raw: { aweId: string; slug: string; workoutId: string }) {
  const input = z.object({ aweId: Ref, slug: Ref, workoutId: Ref }).parse(raw);
  return edit((scope) => swapExercise(scope, input), input.workoutId);
}

export async function planSetTargets(raw: { aweId: string; workoutId: string } & z.input<typeof Targets>) {
  const input = Targets.extend({ aweId: Ref, workoutId: Ref }).parse(raw);
  return edit((scope) => setTargets(scope, input), input.workoutId);
}

export async function planSetWorkoutNote(raw: { workoutId: string; text: string }) {
  const input = z.object({ workoutId: Ref, text: z.string().max(LIMITS.note * 2) }).parse(raw);
  return edit((scope) => setWorkoutNote(scope, input.workoutId, input.text), input.workoutId);
}

export async function planSetLighterWeeks(on: boolean) {
  return edit((scope) => setLighterWeeks(scope, z.boolean().parse(on)));
}

export async function planSetNote(text: string) {
  return edit((scope) => setPlanNote(scope, z.string().max(LIMITS.note * 2).parse(text)));
}

/**
 * My training: start one of the coach's own library programs as their plan,
 * exactly as written. Only the coach's own profile can do this: a client's
 * plan comes from their coach.
 */
export async function startMyProgram(raw: { programId: string; startDate: string }): Promise<{ ok: true } | { ok: false; error: string }> {
  const session = await auth();
  const identity = await athleteIdentity(session?.user);
  if (!identity?.isCoach) return { ok: false, error: "Only a coach can use their library for their own training." };
  const input = z.object({ programId: z.string().min(1).max(64), startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }).safeParse(raw);
  if (!input.success) return { ok: false, error: "Choose a program and a start date." };

  const program = await prisma.program.findFirst({ where: { id: input.data.programId, workspaceId: identity.workspaceId, deletedAt: null }, select: { id: true } });
  if (!program) return { ok: false, error: "That program isn't in your library." };

  try {
    const assignment = await assignProgram(identity.workspaceId, program.id, identity.clientId, new Date(`${input.data.startDate}T00:00:00`));
    // It's the plan now; an earlier one is finished (its history stays).
    await prisma.programAssignment.updateMany({
      where: { clientId: identity.clientId, workspaceId: identity.workspaceId, status: "ACTIVE", NOT: { id: assignment.id } },
      data: { status: "COMPLETED" },
    });
  } catch (err) {
    console.error("[my program]", err);
    return { ok: false, error: "Couldn't start that program. Please try again." };
  }
  refresh();
  return { ok: true };
}
