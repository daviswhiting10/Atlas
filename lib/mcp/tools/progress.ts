import { z } from "zod";
import { prisma } from "@/lib/db/client";
import { strengthComposite, weightTrendEMA } from "@/lib/progress/math";
import { localDay, safeTimeZone } from "@/lib/athlete/sessions";
import { ALL_ROLES } from "../auth";
import type { ScopedClient } from "../context";
import { describePrescription, loadActiveAssignment, loadSetRows } from "../data";
import { groupByExercise, muscleTrends, personalRecords, plateauReport, summarizeSession, volumeByWeek, type ExerciseHistory } from "../derive";
import { ClientIdArg, Id, TimeZoneArg } from "../schemas";
import { clientTool } from "../tool";

const DAY_MS = 86_400_000;

/** The client's key lifts: the coach's choice if set, otherwise the loaded exercises trained most. */
export function keyLifts(client: ScopedClient, histories: ExerciseHistory[], max = 5): ExerciseHistory[] {
  if (client.keyLiftIds.length > 0) {
    const chosen = histories.filter((h) => client.keyLiftIds.includes(h.exerciseId));
    if (chosen.length > 0) return chosen;
  }
  return histories
    .filter((h) => h.sessions.some((s) => s.sets.some((x) => x.weight != null && x.weight > 0)))
    .sort((a, b) => b.sessions.length - a.sessions.length || a.name.localeCompare(b.name))
    .slice(0, max);
}

/** Rep target the plan asks for next, per exercise — what "reps hit" is judged against. */
export async function plannedRepsByExercise(client: ScopedClient): Promise<Record<string, number | null>> {
  const assignment = await loadActiveAssignment(client);
  const planned: Record<string, number | null> = {};
  for (const w of assignment?.assignedWorkouts ?? []) {
    if (w.status !== "PLANNED") continue;
    for (const e of w.exercises) {
      if (!(e.exerciseId in planned)) planned[e.exerciseId] = describePrescription(e.prescribedSets).repMin;
    }
  }
  return planned;
}

export const analyzeProgress = clientTool({
  name: "analyze_progress",
  title: "Analyze progress",
  description:
    "Strength, volume and body-weight trends for a client: estimated 1-rep max series for their key lifts, weekly training volume, and the body-weight trend from logged measurements.",
  permission: "read",
  roles: ALL_ROLES,
  input: z.object({
    clientId: ClientIdArg,
    weeks: z.number().int().min(4).max(52).default(12).describe("How far back to look."),
    timezone: TimeZoneArg,
  }),
  async handler({ client }, args) {
    const tz = safeTimeZone(args.timezone);
    const since = new Date(Date.now() - args.weeks * 7 * DAY_MS);
    const [rows, measurements] = await Promise.all([
      loadSetRows(client, { since }),
      prisma.measurement.findMany({
        where: { clientId: client.id, workspaceId: client.workspaceId, measuredAt: { gte: since }, bodyWeightKg: { not: null } },
        orderBy: { measuredAt: "asc" },
        select: { measuredAt: true, bodyWeightKg: true },
      }),
    ]);

    const lifts = keyLifts(client, groupByExercise(rows, tz)).map((h) => {
      const series = h.sessions.map(summarizeSession).filter((s) => s.bestE1RM != null);
      const first = series[0]?.bestE1RM ?? null;
      const last = series[series.length - 1]?.bestE1RM ?? null;
      return {
        exerciseId: h.exerciseId,
        exercise: h.name,
        baselineE1RM: first,
        currentE1RM: last,
        changePct: first && last ? Math.round(((last - first) / first) * 1000) / 10 : null,
        series: series.map((s) => ({ date: s.date, e1RM: s.bestE1RM, topWeightLb: s.topWeight, lighterWeek: s.deload })),
      };
    });

    const composite = strengthComposite(lifts.map((l) => ({ baselineE1RM: l.baselineE1RM, currentE1RM: l.currentE1RM })));
    const weeks = volumeByWeek(rows, tz);
    const weight = weightTrendEMA(measurements.map((m) => ({ date: m.measuredAt, weightKg: m.bodyWeightKg as number })));

    return {
      client: client.fullName,
      windowWeeks: args.weeks,
      strength: { compositeChangePct: composite == null ? null : Math.round(composite * 10) / 10, lifts },
      weeklyVolume: weeks.map((w) => ({ week: w.week, tonnageLb: w.tonnageLb, sets: w.sets })),
      bodyWeight: weight.map((w) => ({ date: localDay(w.date, tz), weightKg: w.weightKg, trendKg: Math.round(w.ema * 100) / 100 })),
      sessionsLogged: new Set(rows.filter((r) => r.completed).map((r) => r.workoutLogId)).size,
    };
  },
});

export const getPersonalRecords = clientTool({
  name: "get_personal_records",
  title: "Personal records",
  description:
    "Best lifts for a client, computed from logged sets: heaviest weight and best estimated 1-rep max per exercise, with the date of each.",
  permission: "read",
  roles: ALL_ROLES,
  input: z.object({ clientId: ClientIdArg, exerciseId: Id.optional().describe("Limit to one exercise."), timezone: TimeZoneArg }),
  async handler({ client }, args) {
    const tz = safeTimeZone(args.timezone);
    const [rows, milestones] = await Promise.all([
      loadSetRows(client, args.exerciseId ? { exerciseIds: [args.exerciseId] } : {}),
      prisma.milestone.findMany({
        where: { clientId: client.id, workspaceId: client.workspaceId, type: "first_pr" },
        select: { exerciseId: true, achievedAt: true },
      }),
    ]);
    // Milestones are context only. A missing one never hides a record, and one never overrides the computed value.
    const firstAwarded = new Map(milestones.map((m) => [m.exerciseId, localDay(m.achievedAt, tz)]));
    return {
      client: client.fullName,
      records: personalRecords(groupByExercise(rows, tz)).map((r) => ({ ...r, firstPrMilestoneDate: firstAwarded.get(r.exerciseId) ?? null })),
    };
  },
});

export const getTrainingVolume = clientTool({
  name: "get_training_volume",
  title: "Training volume",
  description:
    "Weekly training volume for a client, split by muscle group. Tonnage is weight × reps; bodyweight and band sets are counted as sets but add no tonnage.",
  permission: "read",
  roles: ALL_ROLES,
  input: z.object({ clientId: ClientIdArg, weeks: z.number().int().min(2).max(26).default(8), timezone: TimeZoneArg }),
  async handler({ client }, args) {
    const tz = safeTimeZone(args.timezone);
    const rows = await loadSetRows(client, { since: new Date(Date.now() - args.weeks * 7 * DAY_MS) });
    const weeks = volumeByWeek(rows, tz);
    const unloaded = weeks.reduce((n, w) => n + w.unloadedSets, 0);
    return {
      client: client.fullName,
      weeks,
      trendByMuscle: muscleTrends(weeks),
      note: unloaded > 0 ? `${unloaded} bodyweight or band sets are counted as sets but contribute no tonnage.` : null,
    };
  },
});

export const detectPlateaus = clientTool({
  name: "detect_plateaus",
  title: "Detect plateaus",
  description:
    "Flags exercises where neither top weight nor estimated 1-rep max has improved over the last 3 counted sessions (within 21 days). Lighter-week sessions are not counted. Returns facts only, no coaching.",
  permission: "read",
  roles: ALL_ROLES,
  input: z.object({ clientId: ClientIdArg, exerciseIds: z.array(Id).max(30).optional(), timezone: TimeZoneArg }),
  async handler({ client }, args) {
    const tz = safeTimeZone(args.timezone);
    const [rows, planned] = await Promise.all([
      loadSetRows(client, args.exerciseIds ? { exerciseIds: args.exerciseIds } : {}),
      plannedRepsByExercise(client),
    ]);
    const today = localDay(new Date(), tz);
    const histories = groupByExercise(rows, tz);
    const chosen = args.exerciseIds ? histories : keyLifts(client, histories, 12);
    const reports = chosen.map((h) => plateauReport(h, { today, goal: client.primaryGoal ?? "general", plannedReps: planned[h.exerciseId] }));
    return {
      client: client.fullName,
      plateaued: reports.filter((r) => r.plateaued === true),
      progressing: reports.filter((r) => r.plateaued === false),
      insufficientData: reports.filter((r) => r.plateaued === null).map((r) => ({ exerciseId: r.exerciseId, exercise: r.exercise, sessionsConsidered: r.sessionsConsidered })),
    };
  },
});
