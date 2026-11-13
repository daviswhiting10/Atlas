import { z } from "zod";
import { PLAN_SOURCE_SELECT, planSessionSource } from "@/lib/sessions/status";
import { prisma } from "@/lib/db/client";
import { displayName } from "@/lib/plan/catalog";
import { localDay, safeTimeZone } from "@/lib/athlete/sessions";
import { ALL_ROLES } from "../auth";
import { invalid, notFound } from "../context";
import { findVisibleExercise, loadSetRows } from "../data";
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
    const tz = safeTimeZone(args.timezone);
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
            exercise: { select: { name: true, slug: true } },
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
          if (s.completed && s.weight && s.reps) volumeLb += s.weight * s.reps;
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
    const history = groupByExercise(rows, safeTimeZone(args.timezone))[0];
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
    "Record sets for one of the client's assigned workouts. Sets are matched by exercise and set number, so calling again with the same set updates it. Set `complete` to mark the workout finished.",
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
      .describe("The day the workout was actually done (YYYY-MM-DD). Defaults to today."),
  }),
  async handler({ client, caller }, args) {
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
        exercises: { select: { id: true, exerciseId: true } },
        ...PLAN_SOURCE_SELECT,
      },
    });
    if (!workout) throw notFound();

    const aweByExercise = new Map(
      workout.exercises.map((e) => [e.exerciseId, e.id]),
    );
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
            select: { id: true, completedAt: true },
          })) ??
          (await tx.workoutLog.create({
            // The day it was actually done: the date given, else today. Never the scheduled day.
            data: {
              clientId: client.id,
              assignedWorkoutId: workout.id,
              source: planSessionSource(workout.programAssignment.sourceProgram),
              date: args.date ? new Date(`${args.date}T12:00:00`) : new Date(),
            },
            select: { id: true, completedAt: true },
          }));

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
            select: { id: true },
          });
          if (existing)
            await tx.setLog.update({ where: { id: existing.id }, data });
          else
            await tx.setLog.create({
              data: {
                ...data,
                workoutLogId: log.id,
                exerciseId: s.exerciseId,
                assignedWorkoutExerciseId: aweId,
                setNumber: s.setNumber,
              },
            });
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
        return { workoutLogId: log.id };
      },
      { timeout: 20_000, maxWait: 10_000 },
    );

    return {
      workoutLogId: result.workoutLogId,
      workout: workout.name,
      setsWritten: args.sets.length,
      status: args.complete ? "LOGGED" : "in progress",
      loggedBy,
    };
  },
});
