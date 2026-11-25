"use server";

import { auth } from "@/lib/auth";
import { loadSessionNotes, saveSessionNote } from "@/lib/sessions/notes";
import { buildSessionSummary } from "@/lib/sessions/summary";
import { compareWithLast, medalsOf, type WrapSet, type WrapUp } from "@/lib/coach/wrap-up";
import { isTimedSet, TIMED_SELECT } from "@/lib/sessions/volume";
import { requestDay } from "@/lib/sessions/request-day";
import { DONE, PLAN_SOURCE_SELECT, planSessionSource } from "@/lib/sessions/status";
import { prisma } from "@/lib/db/client";
import { replayConflict, type ServerSetState } from "@/lib/sessions/replay";
import {
  checkStrengthMilestones,
  checkSessionMilestones,
} from "@/lib/progress/milestones";

// ── Auth helper ────────────────────────────────────────────────────────────────

async function requireWorkspace(): Promise<{ userId: string; workspaceId: string }> {
  const session = await auth();
  const userId = session?.user?.id;
  const workspaceId = session?.user?.workspaceId;
  // Coach-only: athletes log through lib/actions/athlete.ts.
  if (!userId || !workspaceId || session.user.role === "CLIENT") throw new Error("Unauthorized");
  return { userId, workspaceId };
}

/** Throws unless the client belongs to the caller's workspace. */
async function requireClientInWorkspace(clientId: string, workspaceId: string): Promise<void> {
  const client = await prisma.clientProfile.findFirst({ where: { id: clientId, workspaceId }, select: { id: true } });
  if (!client) throw new Error("Client not found");
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
  bandColor: string | null;
  reps: number | null;
  rpe: number | null;
  note: string | null;
  completed: boolean;
  /** The day the session was done, when creating it (YYYY-MM-DD). Defaults to today, never the scheduled day. */
  date?: string;
  /** Only on a save replayed after being offline: whether this device last knew the set as ticked on the server. */
  expectDone?: boolean;
}): Promise<{ workoutLogId: string; setLogId: string; conflict?: ServerSetState }> {
  const { workspaceId } = await requireWorkspace();

  // ── Verify the AssignedWorkout belongs to this workspace ───────────────────
  const assignedWorkout = await prisma.assignedWorkout.findFirst({
    where: {
      id: input.assignedWorkoutId,
      programAssignment: { workspaceId, clientId: input.clientId },
    },
    select: { id: true, ...PLAN_SOURCE_SELECT },
  });
  if (!assignedWorkout) throw new Error("Workout not found");

  // ── Find or create WorkoutLog ──────────────────────────────────────────────
  let workoutLogId = input.workoutLogId;

  if (workoutLogId) {
    // A caller-supplied log id must be this workout's own log.
    const owned = await prisma.workoutLog.findFirst({
      where: { id: workoutLogId, assignedWorkoutId: input.assignedWorkoutId },
      select: { id: true },
    });
    if (!owned) throw new Error("Workout log not found");
  }

  if (!workoutLogId) {
    const existing = await prisma.workoutLog.findUnique({
      where: { assignedWorkoutId: input.assignedWorkoutId },
      select: { id: true },
    });
    if (existing) {
      workoutLogId = existing.id;
    } else {
      // The day it was done: the coach's date if given, otherwise today.
      const logDate = input.date ? requestDay(input.date) : new Date();
      const created = await prisma.workoutLog
        .create({
          data: {
            clientId: input.clientId,
            assignedWorkoutId: input.assignedWorkoutId,
            source: planSessionSource(assignedWorkout.programAssignment.sourceProgram),
            date: logDate,
          },
          select: { id: true },
        })
        // Two first sets at once (two devices): the loser of the race reuses the winner's session.
        .catch(() => prisma.workoutLog.findUnique({ where: { assignedWorkoutId: input.assignedWorkoutId }, select: { id: true } }));
      if (!created) throw new Error("Couldn't start the session");
      workoutLogId = created.id;
    }
  }

  // ── Upsert SetLog ──────────────────────────────────────────────────────────
  // Without a setLogId, the set may still be saved already: a save that reached the server while
  // the page was reloading, or a retry after a lost answer. Same session, exercise and set number:
  // it's that row, updated, never a second one.
  let setLogId: string;
  const known =
    input.setLogId ??
    (input.assignedWorkoutExerciseId
      ? (
          await prisma.setLog.findFirst({
            where: { workoutLogId, assignedWorkoutExerciseId: input.assignedWorkoutExerciseId, setNumber: input.setNumber },
            select: { id: true },
          })
        )?.id
      : undefined);

  if (known) {
    // Update existing set (trainer edited weight/reps after initial save)
    const ownedSet = await prisma.setLog.findFirst({
      where: { id: known, workoutLogId },
      select: { id: true, completed: true, weight: true, reps: true },
    });
    if (!ownedSet) throw new Error("Set not found");
    // A save replayed after being offline: if another device changed this set meanwhile, keep theirs and say so.
    if (input.expectDone !== undefined && replayConflict(input.expectDone, ownedSet)) {
      return { workoutLogId, setLogId: ownedSet.id, conflict: { done: ownedSet.completed, weight: ownedSet.weight == null ? null : Number(ownedSet.weight), reps: ownedSet.reps } };
    }
    await prisma.setLog.update({
      where: { id: known },
      data: {
        weight: input.weight,
        bandColor: input.bandColor,
        reps: input.reps,
        rpe: input.rpe,
        note: input.note,
        completed: input.completed,
      },
    });
    setLogId = known;
  } else {
    // Create new set
    const created = await prisma.setLog.create({
      data: {
        workoutLogId,
        exerciseId: input.exerciseId,
        assignedWorkoutExerciseId: input.assignedWorkoutExerciseId ?? null,
        setNumber: input.setNumber,
        weight: input.weight,
        bandColor: input.bandColor,
        reps: input.reps,
        rpe: input.rpe,
        note: input.note,
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

// ── Session complete: how it compared, new bests, what is next ───────────────────

/** A wrap-up set: its numbers, its exercise, and whether its reps are seconds (lib/sessions/volume.ts). */
const SET_SELECT = { exerciseId: true, weight: true, reps: true, exercise: { select: { name: true, slug: true } }, ...TIMED_SELECT } as const;

const sameName = (a: string | null | undefined, b: string | null | undefined) => !!a && !!b && a.trim().toLowerCase() === b.trim().toLowerCase();

/**
 * What the coach's Session complete screen shows beyond the totals: against the last time this workout was done, any lift
 * that set a new best, the athlete's note, and the next workout in the plan. Read-only, the caller's workspace only. Each
 * part that can't be worked out comes back empty (nothing to compare with, no plan), and the screen leaves it out.
 */
export async function sessionWrapUp(input: { workoutLogId: string }): Promise<WrapUp> {
  const { workspaceId } = await requireWorkspace();
  const log = await prisma.workoutLog.findFirst({
    where: { id: input.workoutLogId, client: { workspaceId } },
    select: {
      id: true,
      clientId: true,
      date: true,
      title: true,
      assignedWorkoutId: true,
      assignedWorkout: { select: { name: true, exercises: { select: { prescribedSets: true } } } },
      sets: { where: { completed: true }, select: SET_SELECT },
    },
  });
  if (!log) return { compare: null, medals: [], next: null, athleteNote: null };
  type Row = { exerciseId: string | null; weight: number | null; reps: number | null; exercise: { name: string; slug: string } | null } & Parameters<typeof isTimedSet>[0];
  const rows = (sets: Row[]): WrapSet[] =>
    sets.filter((x) => x.exerciseId).map((x) => ({ exerciseId: x.exerciseId!, name: x.exercise?.name ?? "Exercise", weight: x.weight, reps: x.reps, timed: isTimedSet(x, x.exercise?.slug) }));
  const cur = rows(log.sets);
  const name = log.assignedWorkout?.name ?? log.title;
  const planned = log.assignedWorkout ? log.assignedWorkout.exercises.reduce((n, e) => n + (Array.isArray(e.prescribedSets) ? e.prescribedSets.length : 0), 0) || null : null;

  // The last time this workout was done: the same name, finished, before this one.
  const earlier = await prisma.workoutLog.findMany({
    where: { clientId: log.clientId, completedAt: { not: null }, date: { lt: log.date }, id: { not: log.id } },
    orderBy: { date: "desc" },
    take: 30,
    select: { title: true, assignedWorkout: { select: { name: true } }, sets: { where: { completed: true }, select: SET_SELECT } },
  });
  const last = earlier.find((e) => sameName(e.assignedWorkout?.name ?? e.title, name));

  // Each lift's heaviest weight before this session.
  const ids = Array.from(new Set(cur.map((c) => c.exerciseId)));
  const heaviest = ids.length
    ? await prisma.setLog.groupBy({
        by: ["exerciseId"],
        where: { exerciseId: { in: ids }, completed: true, weight: { gt: 0 }, workoutLog: { clientId: log.clientId, completedAt: { not: null }, date: { lt: log.date }, id: { not: log.id } } },
        _max: { weight: true },
      })
    : [];
  const before = new Map<string, number>();
  for (const h of heaviest) if (h.exerciseId && h._max.weight != null) before.set(h.exerciseId, h._max.weight);

  // Next in the plan: the earliest workout still to do (not this one).
  const next = await prisma.assignedWorkout.findFirst({
    where: { programAssignment: { clientId: log.clientId, workspaceId, status: "ACTIVE" }, status: "PLANNED", NOT: [DONE, { id: log.assignedWorkoutId ?? "-" }] },
    orderBy: { scheduledDate: "asc" },
    select: { name: true, scheduledDate: true },
  });

  const notes = (await loadSessionNotes([{ id: log.id, clientNotes: null }])).get(log.id);
  return {
    compare: compareWithLast(cur, last ? rows(last.sets) : null, planned),
    medals: medalsOf(cur, before),
    next: next ? { name: next.name, day: next.scheduledDate.toISOString().slice(0, 10) } : null,
    athleteNote: notes?.athlete ?? null,
  };
}

// ── freshSessionSets ───────────────────────────────────────────────────────────

/**
 * This workout's session as it is now: its id and its sets (for the logger to bring itself up to date when it opens: the page
 * it opened from can be an old copy). The caller's workspace only; null when the workout has no session yet.
 */
export async function freshSessionSets(input: { assignedWorkoutId: string }) {
  const { workspaceId } = await requireWorkspace();
  const log = await prisma.workoutLog.findFirst({
    where: { assignedWorkoutId: input.assignedWorkoutId, client: { workspaceId } },
    select: {
      id: true,
      sets: {
        orderBy: { createdAt: "asc" },
        select: { id: true, exerciseId: true, assignedWorkoutExerciseId: true, setNumber: true, weight: true, bandColor: true, reps: true, rpe: true, note: true, completed: true },
      },
    },
  });
  return log;
}

// ── completeSession ────────────────────────────────────────────────────────────
//
// Called when trainer presses "Save & Complete Session".
//
// Behaviour:
//  - Marks the session finished (completedAt); that is what makes the plan workout done.
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
    // Persist session-level fields; finishing it is what makes the plan workout done.
    // Saving again later keeps when it was first finished.
    prisma.workoutLog.update({
      where: { id: input.workoutLogId },
      data: {
        rpeAvg,
        // Notes can be saved again after finishing; a call without notes (the logger finishing by
        // itself) leaves any already saved alone, and "" clears them.
        ...(input.clientNotes === undefined ? {} : { clientNotes: input.clientNotes.trim() || null }),
        completedAt: workoutLog.completedAt ?? new Date(),
      },
    }),

    // The coach finished it: say so, so the client's "Finished by client" marker never shows on it. Only on the first
    // finish: saving notes on a session the client already finished keeps it hers.
    ...(workoutLog.completedAt == null && workoutLog.assignedWorkoutId
      ? [prisma.assignedWorkout.updateMany({ where: { id: workoutLog.assignedWorkoutId, workspaceId }, data: { loggedBy: "TRAINER" as const } })]
      : []),

    // Update client's last contact timestamp
    prisma.clientProfile.updateMany({
      where: { id: input.clientId, workspaceId },
      data: { lastContactAt: new Date() },
    }),
  ]);
  // The coach's note on the session (a SessionNote by author; clientNotes too, for one release).
  if (input.clientNotes !== undefined) {
    await saveSessionNote({ workoutLogId: input.workoutLogId, clientId: input.clientId, date: workoutLog.date, role: "COACH", text: input.clientNotes });
  }

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

// ── swapExercise ───────────────────────────────────────────────────────────────
//
// Lets the trainer substitute a different exercise into this slot mid-workout
// (e.g. the client actually did Bulgarian split squats instead of the prescribed
// reverse lunge). Prescribed sets/order/section are left untouched — only the
// exercise identity changes. Any sets already logged for this slot in the
// current session are re-pointed to the new exercise so history stays consistent.

export async function swapExercise(input: {
  assignedWorkoutExerciseId: string;
  exerciseId: string;
}): Promise<void> {
  const { workspaceId } = await requireWorkspace();

  const awe = await prisma.assignedWorkoutExercise.findFirst({
    where: { id: input.assignedWorkoutExerciseId, workspaceId },
    select: { id: true },
  });
  if (!awe) throw new Error("Exercise not found");

  const exercise = await prisma.exercise.findUnique({
    where: { id: input.exerciseId },
    select: { id: true },
  });
  if (!exercise) throw new Error("Exercise not found");

  await prisma.$transaction([
    prisma.assignedWorkoutExercise.update({
      where: { id: input.assignedWorkoutExerciseId },
      data: { exerciseId: input.exerciseId },
    }),
    prisma.setLog.updateMany({
      where: { assignedWorkoutExerciseId: awe.id },
      data: { exerciseId: input.exerciseId },
    }),
  ]);
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
  exerciseId: string,
  /** The session being logged right now: never its own "last time". */
  excludeWorkoutLogId?: string | null
): Promise<Array<{ weight: number | null; reps: number | null; rpe: number | null; completed: boolean }>> {
  const { workspaceId } = await requireWorkspace();
  await requireClientInWorkspace(clientId, workspaceId);

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 90);

  const sets = await prisma.setLog.findMany({
    where: {
      exerciseId,
      workoutLog: {
        clientId,
        date: { gte: cutoff },
        ...(excludeWorkoutLogId ? { id: { not: excludeWorkoutLogId } } : {}),
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

// ── updateSessionDate ──────────────────────────────────────────────────────────
//
// Lets the trainer correct the date on an already-started WorkoutLog.

export async function updateSessionDate(input: {
  workoutLogId: string;
  date: string; // YYYY-MM-DD
}): Promise<void> {
  const { workspaceId } = await requireWorkspace();

  const log = await prisma.workoutLog.findFirst({
    where: { id: input.workoutLogId, client: { workspaceId } },
    select: { id: true },
  });
  if (!log) throw new Error("Workout log not found");

  await prisma.workoutLog.update({
    where: { id: input.workoutLogId },
    data: { date: requestDay(input.date) },
  });
}

// ── getLastExerciseNote ────────────────────────────────────────────────────────
//
// Returns the most recent coach note for a client + exercise, or null.

export async function getLastExerciseNote(
  clientId: string,
  exerciseId: string
): Promise<string | null> {
  const { workspaceId } = await requireWorkspace();
  const note = await prisma.exerciseCoachNote.findFirst({
    where: { clientId, exerciseId, workspaceId },
    orderBy: { createdAt: "desc" },
    select: { note: true },
  });
  return note?.note ?? null;
}

/** A client's finished session, read-only (the coach's Last 30 days chart): the sets by exercise, the notes. Their workspace only. */
export async function clientSessionSummary(workoutLogId: string): Promise<import("@/lib/actions/athlete").SessionSummary | null> {
  const { workspaceId } = await requireWorkspace();
  if (typeof workoutLogId !== "string" || workoutLogId.length < 1 || workoutLogId.length > 64) return null;
  return buildSessionSummary({ id: workoutLogId, client: { workspaceId } }, "Client");
}
