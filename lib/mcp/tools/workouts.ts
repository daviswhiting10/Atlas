import { z } from "zod";
import { PLAN_SOURCE_SELECT, planSessionSource } from "@/lib/sessions/status";
import { prisma } from "@/lib/db/client";
import { displayName } from "@/lib/plan/catalog";
import { isTimedSet, setVolume, TIMED_SELECT } from "@/lib/sessions/volume";
import { implementsToStore } from "@/lib/exercises/implements";
import { checkSessionMilestones, checkStrengthMilestones } from "@/lib/progress/milestones";
import { isRecordWeight } from "@/lib/progress/milestone-rules";
import { dayToDate } from "@/lib/sessions/day";
import { BANDS, cleanSession, QUICK_LIMITS } from "@/lib/sessions/quick-log";
import { toMetres } from "@/lib/cardio";
import { resolveForClient, type How } from "@/lib/programs/resolve-exercise";
import type { ScopedClient } from "../context";
import { localDay } from "@/lib/athlete/sessions";
import { ALL_ROLES } from "../auth";
import { invalid, notFound } from "../context";
import { findVisibleExercise, loadSetRows, zoneFor } from "../data";
import { groupByExercise, summarizeSession } from "../derive";
import {
  ClientIdArg,
  Id,
  IsoDate,
  LoggedSetInput,
  TimeZoneArg,
} from "../schemas";
import { clientTool } from "../tool";

export const getWorkoutHistory = clientTool({
  name: "get_workout_history",
  title: "Workout history",
  description:
    "Recent logged workouts for a client, newest first, with every set.",
  permission: "read",
  roles: ALL_ROLES,
  input: z.object({
    clientId: ClientIdArg,
    limit: z.number().int().min(1).max(50).default(10),
    before: IsoDate.optional().describe("Only workouts before this date."),
    timezone: TimeZoneArg,
  }),
  async handler({ client }, args) {
    const tz = await zoneFor(client, args.timezone);
    const logs = await prisma.workoutLog.findMany({
      where: {
        clientId: client.id,
        client: { workspaceId: client.workspaceId },
        ...(args.before && {
          date: { lt: new Date(args.before + "T00:00:00Z") },
        }),
      },
      orderBy: { date: "desc" },
      take: args.limit,
      select: {
        id: true,
        date: true,
        durationMin: true,
        completedAt: true,
        title: true,
        source: true,
        assignedWorkout: { select: { name: true } },
        sets: {
          orderBy: { setNumber: "asc" },
          select: {
            exerciseId: true,
            setNumber: true,
            weight: true,
            bandColor: true,
            reps: true,
            rpe: true,
            completed: true,
            implements: true,
            exercise: { select: { name: true, slug: true } },
            ...TIMED_SELECT,
          },
        },
      },
    });

    return {
      client: client.fullName,
      workouts: logs.map((log) => {
        const exercises = new Map<
          string,
          { exerciseId: string; exercise: string; sets: unknown[] }
        >();
        let volumeLb = 0;
        for (const s of log.sets) {
          if (!s.exerciseId || !s.exercise) continue;
          let e = exercises.get(s.exerciseId);
          if (!e) {
            e = {
              exerciseId: s.exerciseId,
              exercise: displayName(s.exercise.slug, s.exercise.name),
              sets: [],
            };
            exercises.set(s.exerciseId, e);
          }
          e.sets.push({
            set: s.setNumber,
            weightLb: s.weight,
            band: s.bandColor,
            reps: s.reps,
            rpe: s.rpe,
            completed: s.completed,
          });
          volumeLb += setVolume({ weight: s.weight, reps: s.reps, completed: s.completed, timed: isTimedSet(s, s.exercise.slug), implements: s.implements });
        }
        return {
          workoutLogId: log.id,
          date: localDay(log.date, tz),
          name: log.assignedWorkout?.name ?? log.title ?? "Off-plan session",
          source: log.source,
          finished: log.completedAt != null,
          durationMin: log.durationMin,
          volumeLb: Math.round(volumeLb),
          exercises: Array.from(exercises.values()),
        };
      }),
    };
  },
});

export const getExerciseHistory = clientTool({
  name: "get_exercise_history",
  title: "Exercise history",
  description:
    "Every logged session of one exercise for a client: sets, top weight, estimated 1-rep max and volume per session.",
  permission: "read",
  roles: ALL_ROLES,
  input: z.object({
    clientId: ClientIdArg,
    exerciseId: Id,
    limit: z
      .number()
      .int()
      .min(1)
      .max(100)
      .default(20)
      .describe("Most recent sessions to return."),
    timezone: TimeZoneArg,
  }),
  async handler({ client }, args) {
    const exercise = await findVisibleExercise(
      args.exerciseId,
      client.workspaceId,
    );
    if (!exercise) throw notFound();
    const rows = await loadSetRows(client, { exerciseIds: [exercise.id] });
    const history = groupByExercise(rows, await zoneFor(client, args.timezone))[0];
    const sessions = (history?.sessions ?? []).slice(-args.limit);
    return {
      client: client.fullName,
      exercise: {
        id: exercise.id,
        name: exercise.name,
        movementPattern: exercise.movementPattern,
        equipment: exercise.equipment,
      },
      sessions: sessions.map((s) => {
        const { deload, ...summary } = summarizeSession(s);
        return {
          ...summary,
          lighterWeek: deload,
          setDetail: s.sets.map((x) => ({
            set: x.setNumber,
            weightLb: x.weight,
            band: x.bandColor,
            reps: x.reps,
            rpe: x.rpe,
            completed: x.completed,
          })),
        };
      }),
    };
  },
});

export const logWorkout = clientTool({
  name: "log_workout",
  title: "Log workout sets",
  description:
    "Record sets for one of the client's assigned workouts. Sets are matched by exercise and set number, so calling again with the same set updates it. Set `complete` to mark the workout finished. The result lists newPRs and newMilestones earned by this call: tell the person about them.",
  permission: "write",
  roles: ALL_ROLES,
  input: z.object({
    clientId: ClientIdArg,
    assignedWorkoutId: Id,
    sets: z.array(LoggedSetInput).min(1).max(100),
    complete: z
      .boolean()
      .default(false)
      .describe("Mark the workout as finished."),
    durationMin: z.number().int().min(1).max(600).optional().catch(undefined),
    date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional()
      .describe("The day the workout was actually done (YYYY-MM-DD), a calendar day in `timezone`. Defaults to now."),
    timezone: TimeZoneArg,
  }),
  async handler({ client, caller }, args) {
    const tz = await zoneFor(client, args.timezone);
    const date = dayIn(args.date, tz);
    // Scope check before any write: the workout must belong to this client in this workspace.
    const workout = await prisma.assignedWorkout.findFirst({
      where: {
        id: args.assignedWorkoutId,
        workspaceId: client.workspaceId,
        programAssignment: { clientId: client.id },
      },
      select: {
        id: true,
        name: true,
        exercises: { select: { id: true, exerciseId: true, exercise: { select: { name: true, equipment: true } } } },
        ...PLAN_SOURCE_SELECT,
      },
    });
    if (!workout) throw notFound();

    const aweByExercise = new Map(
      workout.exercises.map((e) => [e.exerciseId, e.id]),
    );
    const exerciseById = new Map(workout.exercises.map((e) => [e.exerciseId, e.exercise]));
    for (const s of args.sets) {
      if (!aweByExercise.has(s.exerciseId))
        throw invalid(`Exercise ${s.exerciseId} is not part of this workout.`);
    }

    const loggedBy = caller.role === "CLIENT" ? "CLIENT" : "TRAINER";

    const result = await prisma.$transaction(
      async (tx) => {
        const log =
          (await tx.workoutLog.findUnique({
            where: { assignedWorkoutId: workout.id },
            select: { id: true, completedAt: true, date: true },
          })) ??
          (await tx.workoutLog.create({
            // The day it was actually done: the date given, else today. Never the scheduled day.
            data: {
              clientId: client.id,
              assignedWorkoutId: workout.id,
              source: planSessionSource(workout.programAssignment.sourceProgram),
              date,
            },
            select: { id: true, completedAt: true, date: true },
          }));

        const written: Array<{ setLogId: string; exerciseId: string; weight: number | null; reps: number | null; resent: boolean }> = [];
        for (const s of args.sets) {
          const aweId = aweByExercise.get(s.exerciseId) as string;
          const data = {
            weight: s.weight ?? null,
            reps: s.reps,
            rpe: s.rpe ?? null,
            completed: true,
          };
          const existing = await tx.setLog.findFirst({
            where: {
              workoutLogId: log.id,
              assignedWorkoutExerciseId: aweId,
              setNumber: s.setNumber,
            },
            select: { id: true, weight: true },
          });
          const row = existing
            ? await tx.setLog.update({ where: { id: existing.id }, data: { ...data, implements: implementsToStore(exerciseById.get(s.exerciseId)!, s.implements, false) }, select: { id: true } })
            : await tx.setLog.create({
              select: { id: true },
              data: {
                ...data,
                workoutLogId: log.id,
                exerciseId: s.exerciseId,
                assignedWorkoutExerciseId: aweId,
                setNumber: s.setNumber,
                // A dumbbell or kettlebell set: as sent (1 or 2 bells), else the catalog's per hand default (the weight is one bell).
                implements: implementsToStore(exerciseById.get(s.exerciseId)!, s.implements, true),
              },
            });
          // The same set sent again at the same weight: logged before, so not a new record.
          written.push({ setLogId: row.id, exerciseId: s.exerciseId, weight: data.weight, reps: data.reps, resent: existing?.weight === data.weight });
        }

        if (args.complete) {
          await tx.assignedWorkout.update({
            where: { id: workout.id },
            data: { loggedBy },
          });
          // Finishing the session is what makes the plan workout done.
          await tx.workoutLog.update({
            where: { id: log.id },
            data: {
              completedAt: log.completedAt ?? new Date(),
              ...(args.durationMin ? { durationMin: args.durationMin } : {}),
            },
          });
          await tx.clientProfile.update({
            where: { id: client.id },
            data: { lastContactAt: new Date() },
          });
        }
        return { workoutLogId: log.id, date: log.date, written };
      },
      { timeout: 20_000, maxWait: 10_000 },
    );

    const { newPRs, newMilestones } = await awardAndReport(client, result.written.map((w) => ({ ...w, name: exerciseById.get(w.exerciseId)!.name })), args.complete);

    return {
      workoutLogId: result.workoutLogId,
      workout: workout.name,
      setsWritten: args.sets.length,
      status: args.complete ? "LOGGED" : "in progress",
      loggedBy,
      date: localDay(result.date, tz),
      timezone: tz,
      newPRs,
      newMilestones,
    };
  },
});

/** A given day as noon on that calendar day in the person's zone (lib/sessions/day), else now. */
function dayIn(day: string | undefined, tz: string): Date {
  if (!day) return new Date();
  try {
    return dayToDate(day, tz);
  } catch {
    throw invalid(`${day} isn't a real date.`);
  }
}

type WrittenSet = { setLogId: string; exerciseId: string; name: string; weight: number | null; reps: number | null; resent?: boolean };

/**
 * The milestones the app's loggers award (a record, a plate, a session count), after the write commits, then what this
 * call earned, so the AI can say it: the milestones it created, and each exercise whose heaviest set here is a record
 * (heavier than every other set they've logged of it; a first-ever set is not a record). Awaited so the next read sees
 * them; a failure here never undoes what was logged.
 */
async function awardAndReport(client: ScopedClient, written: WrittenSet[], sessionDone: boolean) {
  const newMilestones: Array<{ kind: string; title: string; exercise?: string; value?: number; unit?: string | null }> = [];
  const newPRs: Array<{ exercise: string; weightLb: number; previousBestLb: number | null }> = [];
  try {
    const had = new Set((await prisma.milestone.findMany({ where: { clientId: client.id }, select: { id: true } })).map((m) => m.id));
    for (const w of written) {
      await checkStrengthMilestones(client.workspaceId, client.id, w.exerciseId, w.name, { weight: w.weight, reps: w.reps, completed: true }, w.setLogId);
    }
    if (sessionDone) await checkSessionMilestones(client.workspaceId, client.id);
    const all = await prisma.milestone.findMany({ where: { clientId: client.id }, orderBy: { createdAt: "asc" }, select: { id: true, type: true, title: true, metricValue: true, metricUnit: true, exercise: { select: { name: true } } } });
    for (const m of all.filter((x) => !had.has(x.id))) {
      newMilestones.push({ kind: m.type, title: m.title, ...(m.exercise && { exercise: m.exercise.name }), ...(m.metricValue != null && { value: m.metricValue, unit: m.metricUnit }) });
    }
    const thisCall = written.map((w) => w.setLogId);
    for (const exerciseId of Array.from(new Set(written.map((w) => w.exerciseId)))) {
      const mine = written.filter((w) => w.exerciseId === exerciseId);
      const top = Math.max(0, ...mine.filter((w) => !w.resent).map((w) => w.weight ?? 0));
      const before = await prisma.setLog.aggregate({ where: { workoutLog: { clientId: client.id }, exerciseId, completed: true, id: { notIn: thisCall } }, _max: { weight: true } });
      if (isRecordWeight([before._max.weight], top)) newPRs.push({ exercise: mine[0].name, weightLb: top, previousBestLb: before._max.weight });
    }
    // A PR milestone from this call is a PR too (e.g. their first weighted set after weightless ones): one answer, not two.
    for (const m of newMilestones) {
      if (m.kind === "first_pr" && m.exercise && m.value != null && !newPRs.some((p) => p.exercise === m.exercise)) newPRs.push({ exercise: m.exercise, weightLb: m.value, previousBestLb: null });
    }
  } catch (err) {
    console.error("[mcp] milestone check failed", err instanceof Error ? err.message : err);
  }
  return { newPRs, newMilestones };
}

const OffPlanSet = z.object({
  weight: z.number().min(0).max(QUICK_LIMITS.weight).nullable().optional().catch(null).describe("Pounds (per bell for dumbbells). Omit for bodyweight."),
  reps: z.number().int().min(0).max(QUICK_LIMITS.reps).nullable().catch(null).describe("Reps, or seconds for a timed exercise."),
  band: z.enum(BANDS).nullable().optional().catch(null),
  implements: LoggedSetInput.shape.implements,
});

export const logOffPlanWorkout = clientTool({
  name: "log_off_plan_workout",
  title: "Log an off-plan workout",
  description:
    "Record a finished workout that isn't in the plan, in one call, like Quick log in Atlas: lifts (`exercises`, each by exerciseId or by name; a name lands on what this person already logs, as create_plan_from_outline matches) or cardio (`cardio`: a run, a walk or other, with minutes and/or distance). One or the other per call. It counts in History, the heatmap and Progress. A set counts once it has reps. The result names what each exercise matched and lists newPRs and newMilestones: tell the person about them.",
  permission: "write",
  roles: ALL_ROLES,
  input: z.object({
    clientId: ClientIdArg,
    date: IsoDate.optional().describe("The day it was done, a calendar day in `timezone`. Defaults to now."),
    timezone: TimeZoneArg,
    title: z.string().trim().max(QUICK_LIMITS.title).optional().describe("e.g. 'Hotel gym'. A run is called Run, a walk Walk."),
    durationMin: z.number().int().min(1).max(QUICK_LIMITS.duration).optional().catch(undefined).describe("How long the lifting session took."),
    exercises: z
      .array(z.object({ exerciseId: Id.optional(), name: z.string().trim().min(2).max(QUICK_LIMITS.name).optional(), sets: z.array(OffPlanSet).min(1).max(QUICK_LIMITS.sets) }))
      .min(1)
      .max(QUICK_LIMITS.exercises)
      .optional(),
    cardio: z
      .object({
        activity: z.enum(["run", "walk", "other"]).describe("'other' for a bike, a row, a swim, a class (name it in title)."),
        minutes: z.number().int().min(1).max(QUICK_LIMITS.duration).optional(),
        distance: z.number().min(0).max(500).optional(),
        unit: z.enum(["mi", "km"]).default("mi"),
      })
      .optional(),
  }),
  async handler({ client, caller }, args) {
    const tz = await zoneFor(client, args.timezone);
    const date = dayIn(args.date, tz);
    if (date.getTime() > Date.now() + 36 * 3_600_000) throw invalid("That date is in the future.");
    if (!args.exercises === !args.cardio) throw invalid("Give exercises (lifts) or cardio (a run, a walk): one per call.");
    const base = { workoutLogId: "", date: localDay(date, tz), timezone: tz, status: "LOGGED" };

    // Cardio, as the app's quick cardio log saves it (lib/actions/athlete logCardio): the type, the minutes, how far.
    if (args.cardio) {
      const c = args.cardio;
      if (!c.minutes && !c.distance) throw invalid("Give the minutes, the distance, or both.");
      const activity = c.activity === "run" ? "RUN" : c.activity === "walk" ? "WALK" : "OTHER";
      const title = args.title || (activity === "WALK" ? "Walk" : activity === "RUN" ? "Run" : "Cardio");
      const log = await prisma.$transaction(async (tx) => {
        const row = await tx.workoutLog.create({
          data: { clientId: client.id, source: "OFF_PLAN", title, date, completedAt: new Date(), durationMin: c.minutes ?? null, activity, distanceM: c.distance ? toMetres(c.distance, c.unit) : null, trainerSeen: caller.role !== "CLIENT" },
          select: { id: true },
        });
        await tx.clientProfile.update({ where: { id: client.id }, data: { lastContactAt: new Date() } });
        return row;
      });
      const { newMilestones } = await awardAndReport(client, [], true);
      return { ...base, workoutLogId: log.id, title, cardio: { activity, minutes: c.minutes ?? null, distance: c.distance ? `${c.distance} ${c.unit}` : null }, newPRs: [], newMilestones };
    }

    // Each exercise: one this client can see (a merged one stands for its survivor), else the name matched for this
    // person (their history first, then the workspace, the library, a close match, or a new exercise).
    const named = args.exercises!.flatMap((e) => (e.exerciseId || !e.name ? [] : [e.name]));
    const byName = named.length > 0 ? await resolveForClient(named, client) : new Map<string, { id: string; name: string; how: How }>();
    const exercises: Array<{ id: string; name: string; equipment: string | null; asWritten: string | null; how: How | "by id"; sets: z.output<typeof OffPlanSet>[] }> = [];
    for (const e of args.exercises!) {
      const hit = e.exerciseId ? null : e.name ? byName.get(e.name) : null;
      const found = e.exerciseId ? await findVisibleExercise(e.exerciseId, client.workspaceId) : hit ? await findVisibleExercise(hit.id, client.workspaceId) : null;
      if (!found) throw e.exerciseId ? notFound(`Exercise ${e.exerciseId} not found.`) : invalid("Each exercise needs an exerciseId or a name.");
      exercises.push({ id: found.id, name: found.name, equipment: found.equipment, asWritten: e.exerciseId ? null : e.name!, how: hit?.how ?? "by id", sets: e.sets });
    }
    // The app's rule for what is saved (lib/sessions/quick-log): a set with reps; an exercise left with none is dropped.
    const clean = cleanSession({
      date: "2000-01-01",
      title: args.title,
      durationMin: args.durationMin ?? null,
      exercises: exercises.map((e) => ({ exerciseId: e.id, name: e.name, sets: e.sets.map((s) => ({ weight: s.weight ?? null, reps: s.reps, band: s.band ?? null })) })),
    });
    if (clean.totalSets === 0) throw invalid("Add reps to at least one set.");

    const saved = await prisma.$transaction(
      async (tx) => {
        const log = await tx.workoutLog.create({
          data: { clientId: client.id, source: "OFF_PLAN", title: clean.title, date, completedAt: new Date(), durationMin: clean.durationMin, trainerSeen: caller.role !== "CLIENT" },
          select: { id: true },
        });
        const at = Date.now();
        const written: WrittenSet[] = [];
        for (let i = 0; i < clean.exercises.length; i++) {
          const e = clean.exercises[i];
          const ex = exercises.find((x) => x.id === e.exerciseId)!;
          const sent = ex.sets.filter((s) => s.reps != null && s.reps > 0);
          for (let k = 0; k < e.sets.length; k++) {
            const s = e.sets[k];
            const row = await tx.setLog.create({
              // In the order written (createdAt orders sets for records and milestones).
              data: { workoutLogId: log.id, exerciseId: ex.id, setNumber: k + 1, weight: s.weight, reps: s.reps, bandColor: s.band, completed: true, implements: implementsToStore(ex, sent[k]?.implements, true), createdAt: new Date(at + i * 1000 + k) },
              select: { id: true },
            });
            written.push({ setLogId: row.id, exerciseId: ex.id, name: ex.name, weight: s.weight, reps: s.reps });
          }
        }
        await tx.clientProfile.update({ where: { id: client.id }, data: { lastContactAt: new Date() } });
        return { workoutLogId: log.id, written };
      },
      { timeout: 20_000, maxWait: 10_000 },
    );
    const { newPRs, newMilestones } = await awardAndReport(client, saved.written, true);
    return {
      ...base,
      workoutLogId: saved.workoutLogId,
      title: clean.title ?? "Off-plan session",
      exercises: exercises.map((e) => ({ asWritten: e.asWritten, matched: e.name, exerciseId: e.id, how: e.how })),
      setsLogged: saved.written.length,
      newPRs,
      newMilestones,
    };
  },
});
