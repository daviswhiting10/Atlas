"use server";

import { CardioTarget } from "@/lib/plan/cardio-target";
import { revalidatePath } from "next/cache";
import { deleteSessionRows } from "@/lib/sessions/delete";
import { MAX_SESSION_NOTE, loadSessionNotes, saveSessionNote } from "@/lib/sessions/notes";
import { DONE, PLAN_SOURCE_SELECT, planSessionSource } from "@/lib/sessions/status";
import { z } from "zod";
import { TARGET_LIMIT_MESSAGE } from "@/lib/sessions/duration";
import { auth } from "@/lib/auth";
import { athleteIdentity } from "@/lib/athlete/identity";
import { prisma } from "@/lib/db/client";
import { GOALS, normalizePrefs, resolvePrefs } from "@/lib/plan/generator";
import { createHandBuiltPlan, createPlanForClient, ensureCatalog } from "@/lib/plan/persist";
import { assignProgram } from "@/lib/db/programs";
import { checkSessionMilestones } from "@/lib/progress/milestones";
import { MAX_SETS, getProgress } from "@/lib/athlete/data";
import type { SessionPoint } from "@/lib/plan/overload";
import { toMetres } from "@/lib/cardio";
import { displayName } from "@/lib/plan/catalog";
import {
  LIMITS,
  PlanEditError,
  addExercise,
  addWorkout,
  removeExercise,
  removeWorkout,
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
    select: { exerciseId: true, assignedWorkout: { select: PLAN_SOURCE_SELECT } },
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
        data: {
          clientId,
          assignedWorkoutId: input.assignedWorkoutId,
          source: planSessionSource(awe.assignedWorkout.programAssignment.sourceProgram),
          date: new Date(),
        },
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

/**
 * The athlete's own note on a session, from Session complete (an ATHLETE SessionNote; the coach's note is separate).
 * Only their own session; empty text removes it.
 */
export async function saveMySessionNote(raw: { assignedWorkoutId: string; text: string }): Promise<{ ok: true } | { ok: false; error: string }> {
  const input = z.object({ assignedWorkoutId: z.string().min(1).max(64), text: z.string().max(MAX_SESSION_NOTE * 2) }).safeParse(raw);
  if (!input.success) return { ok: false, error: "That note is too long." };
  try {
    const { clientId } = await requireAthlete();
    const log = await prisma.workoutLog.findFirst({ where: { assignedWorkoutId: input.data.assignedWorkoutId, clientId }, select: { id: true, date: true } });
    if (!log) return { ok: false, error: "Log a set first, then add your note." };
    await saveSessionNote({ workoutLogId: log.id, clientId, date: log.date, role: "ATHLETE", text: input.data.text });
    refresh();
    return { ok: true };
  } catch (err) {
    console.error("[session note]", err);
    return { ok: false, error: "Couldn't save your note. Please try again." };
  }
}

const QuickCardioInput = z.object({
  activity: z.enum(["RUN", "WALK", "OTHER"]),
  minutes: z.number().int().min(1).max(600),
  distance: z.number().finite().min(0).max(500).nullish(),
  unit: z.enum(["mi", "km"]).default("mi"),
});

/**
 * A quick log of cardio or a walk: a finished session with the type, the minutes and, if they said, how far. It counts
 * today (the heatmap's colour is minutes, and its corner icon is the type). No plan exercise is behind it.
 */
export async function logCardio(raw: unknown): Promise<{ ok: true } | { ok: false; error: string }> {
  const { clientId } = await requireAthlete();
  const parsed = QuickCardioInput.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "Minutes are a whole number from 1 to 600." };
  const { activity, minutes, distance, unit } = parsed.data;
  const now = new Date();
  await prisma.workoutLog.create({
    data: {
      clientId,
      source: "OFF_PLAN",
      title: activity === "WALK" ? "Walk" : activity === "RUN" ? "Run" : "Cardio",
      date: now,
      completedAt: now,
      durationMin: minutes,
      activity,
      distanceM: distance ? toMetres(distance, unit) : null,
    },
  });
  refresh();
  return { ok: true };
}

/**
 * Lifts' histories for Progress's charts, fetched when the lift chooser opens or a lift is picked (the page itself no
 * longer carries every lift's). Only the signed-in athlete's own, by lift id.
 */
export async function exerciseSeries(raw: unknown): Promise<Record<string, SessionPoint[]>> {
  await requireAthlete();
  const { exerciseIds } = z.object({ exerciseIds: z.array(z.string().min(1).max(64)).min(1).max(60) }).parse(raw);
  const wanted = new Set(exerciseIds);
  const progress = await getProgress();
  const out: Record<string, SessionPoint[]> = {};
  for (const e of progress.exercises) if (wanted.has(e.exerciseId)) out[e.exerciseId] = e.series;
  return out;
}

export async function finishWorkout(raw: { assignedWorkoutId: string; durationMin?: number }): Promise<void> {
  const { clientId, workspaceId } = await requireAthlete();
  const input = WorkoutRef.extend({ durationMin: z.number().optional() }).parse(raw);
  const workout = await prisma.assignedWorkout.findFirst({
    where: { id: input.assignedWorkoutId, programAssignment: { clientId } },
    select: { id: true, workoutLog: { select: { id: true, completedAt: true, sets: { where: { completed: true }, select: { id: true }, take: 1 } } } },
  });
  if (!workout) throw new Error("Workout not found");
  if (!workout.workoutLog || workout.workoutLog.sets.length === 0) throw new Error("Log at least one set first");

  const duration = clean(input.durationMin ?? null, 600);
  await prisma.$transaction([
    // She finished it (first finish only: saving it again later doesn't change who finished it).
    ...(workout.workoutLog.completedAt == null ? [prisma.assignedWorkout.update({ where: { id: workout.id }, data: { loggedBy: "CLIENT" as const } })] : []),
    prisma.workoutLog.update({
      where: { id: workout.workoutLog.id },
      // Done is the session's to say. Saving changes later keeps when it was first finished.
      data: { completedAt: workout.workoutLog.completedAt ?? new Date(), ...(duration == null ? {} : { durationMin: Math.round(duration) }) },
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
      // A finished workout can't be skipped.
      NOT: DONE,
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

/** "Build it myself": an empty plan to fill in the plan editor. Only someone who makes their own plan, and only with no live plan. */
export async function startOwnPlan(): Promise<{ ok: true } | { ok: false; error: string }> {
  const { clientId, workspaceId } = await requireAthlete();
  if (!(await makesOwnPlan(clientId))) return { ok: false, error: "Your plan is managed by your coach." };
  const live = await prisma.programAssignment.count({ where: { clientId, status: "ACTIVE" } });
  if (live > 0) return { ok: false, error: "You already have a plan." };
  try {
    await createHandBuiltPlan({ workspaceId, clientId, startDate: new Date() });
  } catch (err) {
    console.error("[own plan]", err);
    return { ok: false, error: "Couldn't start a plan. Please try again." };
  }
  refresh();
  return { ok: true };
}

// ── Editing the plan ─────────────────────────────────────────────────────────
// Thin wrappers over lib/plan/edit.ts, which the coach editor and the MCP
// tools call too. These return a result instead of throwing, because Next
// hides the message of an error thrown from a server action in production and
// the athlete should be told why something was refused.

export type EditResult<T = unknown> = ({ ok: true } & T) | { ok: false; error: string };

/** Only someone who makes their own plan may restructure it: a coach's client keeps the plan as the coach wrote it. */
async function makesOwnPlan(clientId: string): Promise<boolean> {
  const profile = await prisma.clientProfile.findUnique({ where: { id: clientId }, select: { goalTargets: true } });
  return !!(profile?.goalTargets as { athlete?: unknown } | null)?.athlete;
}

async function edit<T extends object>(run: (scope: PlanScope) => Promise<T | void>, workoutId?: string, own = false): Promise<EditResult<T>> {
  try {
    const { clientId, workspaceId } = await requireAthlete();
    if (own && !(await makesOwnPlan(clientId))) return { ok: false, error: "Your plan is managed by your coach." };
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
  repMin: z.number().int().min(1).max(LIMITS.seconds, TARGET_LIMIT_MESSAGE).optional(),
  repMax: z.number().int().min(1).max(LIMITS.seconds, TARGET_LIMIT_MESSAGE).optional(),
  weight: z.number().min(0).max(LIMITS.weight).nullable().optional(),
}).merge(CardioTarget);

export async function planAddWorkout(raw: { week: number; name: string; copyFromWorkoutId?: string }) {
  const input = z.object({ week: z.number().int().min(1).max(52), name: z.string().max(200), copyFromWorkoutId: Ref.optional() }).parse(raw);
  return edit((scope) => addWorkout(scope, input), undefined, true);
}

export async function planRemoveWorkout(workoutId: string) {
  return edit((scope) => removeWorkout(scope, Ref.parse(workoutId)), undefined, true);
}

export async function planAddExercise(raw: { workoutId: string; slug?: string; exerciseId?: string } & z.input<typeof Targets>) {
  const input = Targets.extend({ workoutId: Ref, slug: Ref.optional(), exerciseId: Ref.optional() }).refine((v) => v.slug || v.exerciseId).parse(raw);
  return edit((scope) => addExercise(scope, input), input.workoutId, true);
}

export async function planRemoveExercise(raw: { aweId: string; workoutId: string }) {
  const input = z.object({ aweId: Ref, workoutId: Ref }).parse(raw);
  return edit((scope) => removeExercise(scope, input.aweId), input.workoutId, true);
}

export async function planSwapExercise(raw: { aweId: string; slug?: string; exerciseId?: string; workoutId: string }) {
  const input = z.object({ aweId: Ref, slug: Ref.optional(), exerciseId: Ref.optional(), workoutId: Ref }).refine((v) => v.slug || v.exerciseId).parse(raw);
  return edit((scope) => swapExercise(scope, input), input.workoutId);
}

export async function planSetTargets(raw: { aweId: string; workoutId: string } & z.input<typeof Targets>) {
  const input = Targets.extend({ aweId: Ref, workoutId: Ref }).parse(raw);
  return edit((scope) => setTargets(scope, input), input.workoutId, true);
}

export async function planSetWorkoutNote(raw: { workoutId: string; text: string }) {
  const input = z.object({ workoutId: Ref, text: z.string().max(LIMITS.note * 2) }).parse(raw);
  return edit((scope) => setWorkoutNote(scope, input.workoutId, input.text), input.workoutId, true);
}

export async function planSetNote(text: string) {
  return edit((scope) => setPlanNote(scope, z.string().max(LIMITS.note * 2).parse(text)), undefined, true);
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


/** A finished session's sets for the read-only summary: each exercise with what was done, in the order it was done. */
/** What a History day shows for a session: each exercise's sets, and the session's notes by author ("Coach", "You"). */
export type SessionSummary = { lines: Array<{ name: string; sets: string }>; notes?: Array<{ label: string; text: string }>; /** Sets logged, and the session's length when it was written down (the mini summary on the Plan calendar). */ setCount?: number; minutes?: number | null; date?: string };

export async function sessionSummary(workoutLogId: string): Promise<SessionSummary | null> {
  const { clientId } = await requireAthlete();
  const id = z.string().min(1).max(64).parse(workoutLogId);
  const log = await prisma.workoutLog.findFirst({
    where: { id, clientId },
    select: {
      id: true,
      clientNotes: true,
      durationMin: true,
      date: true,
      sets: {
        where: { completed: true },
        orderBy: [{ createdAt: "asc" }, { setNumber: "asc" }],
        select: {
          weight: true,
          reps: true,
          exercise: { select: { name: true, slug: true } },
          assignedWorkoutExercise: { select: { prescribedSets: true } },
        },
      },
    },
  });
  if (!log) return null;
  const byName = new Map<string, string[]>();
  for (const s of log.sets) {
    if (!s.exercise || s.reps == null) continue;
    const name = displayName(s.exercise.slug, s.exercise.name);
    const timed = ((s.assignedWorkoutExercise?.prescribedSets as Array<{ unit?: string }> | null) ?? [])[0]?.unit === "secs";
    const text = timed ? `${s.reps} sec` : s.weight != null && s.weight > 0 ? `${s.weight}×${s.reps}` : `${s.reps}`;
    byName.set(name, [...(byName.get(name) ?? []), text]);
  }
  const notes = (await loadSessionNotes([{ id: log.id, clientNotes: log.clientNotes }])).get(log.id)!;
  return {
    lines: Array.from(byName, ([name, sets]) => ({ name, sets: sets.join(", ") })),
    setCount: log.sets.length,
    minutes: log.durationMin,
    date: log.date.toISOString().slice(0, 10),
    notes: [...(notes.coach ? [{ label: "Coach", text: notes.coach }] : []), ...(notes.athlete ? [{ label: "You", text: notes.athlete }] : [])],
  };
}

/**
 * Delete one of your own logged sessions (from the Plan calendar's mini summary): the session, its sets, its notes. Only your
 * own; anything else is "not found". The plan workout goes back to scheduled by itself.
 */
export async function deleteMySession(raw: { workoutLogId: string }): Promise<{ ok: true } | { ok: false; error: string }> {
  const { clientId } = await requireAthlete();
  const parsed = z.object({ workoutLogId: z.string().min(1).max(64) }).safeParse(raw);
  if (!parsed.success) return { ok: false, error: "That session isn't there." };
  const log = await prisma.workoutLog.findFirst({ where: { id: parsed.data.workoutLogId, clientId }, select: { id: true } });
  if (!log) return { ok: false, error: "That session isn't there." };
  await prisma.$transaction((tx) => deleteSessionRows(tx, log.id));
  refresh();
  return { ok: true };
}
