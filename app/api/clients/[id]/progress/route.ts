import { withWorkspace } from "@/lib/api/middleware";
import { prisma } from "@/lib/db/client";
import { bestE1RM, weightTrendEMA, sessionVolume, weekStart, type SetRecord } from "@/lib/progress/math";
import { NextResponse } from "next/server";

// GET /api/clients/[id]/progress
export const GET = withWorkspace<{ id: string }>(async (_req, { workspaceId }, ctx) => {
  const { id: clientId } = await ctx.params;

  const client = await prisma.clientProfile.findFirst({
    where: { id: clientId, workspaceId, deletedAt: null },
    select: {
      id: true,
      primaryGoal: true,
      keyLiftIds: true,
      goalTargets: true,
    },
  });
  if (!client) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // ── Determine key lift exercise IDs ────────────────────────────────────────
  let keyLiftIds = client.keyLiftIds ?? [];

  // Default key lifts if none set: squat, bench press, deadlift, overhead press, barbell row
  if (keyLiftIds.length === 0) {
    const defaultLifts = await prisma.exercise.findMany({
      where: {
        OR: [{ workspaceId: null }, { workspaceId }],
        name: {
          in: ["Barbell Back Squat", "Barbell Bench Press", "Barbell Deadlift",
               "Barbell Overhead Press", "Barbell Row"],
        },
      },
      select: { id: true, name: true },
    });
    keyLiftIds = defaultLifts.map((e) => e.id);
  }

  // ── Load all SetLogs for this client (for strength + volume) ───────────────
  const allSetLogs = await prisma.setLog.findMany({
    where: { workoutLog: { clientId } },
    include: {
      workoutLog: { select: { date: true } },
      exercise: { select: { id: true, name: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  // ── Build per-session e1RM series ──────────────────────────────────────────
  // Group sets by (exerciseId, sessionDate)
  type ExKey = string; // `${exerciseId}__${dateISO}`
  const sessionSets = new Map<ExKey, SetRecord[]>();
  const exNames = new Map<string, string>();

  for (const s of allSetLogs) {
    if (!s.exercise) continue;
    const dateISO = s.workoutLog.date.toISOString().slice(0, 10);
    const key: ExKey = `${s.exercise.id}__${dateISO}`;
    if (!sessionSets.has(key)) sessionSets.set(key, []);
    sessionSets.get(key)!.push({ weight: s.weight, reps: s.reps, completed: s.completed });
    exNames.set(s.exercise.id, s.exercise.name);
  }

  const strengthSeries: Array<{
    date: string;
    exerciseId: string;
    exerciseName: string;
    e1RM: number;
  }> = [];

  for (const [key, sets] of Array.from(sessionSets.entries())) {
    const [exerciseId, date] = key.split("__");
    const best = bestE1RM(sets);
    if (best != null) {
      strengthSeries.push({
        date,
        exerciseId,
        exerciseName: exNames.get(exerciseId) ?? exerciseId,
        e1RM: Math.round(best * 10) / 10,
      });
    }
  }
  strengthSeries.sort((a, b) => a.date.localeCompare(b.date));

  // ── Key lift summaries ──────────────────────────────────────────────────────
  const keyLifts = keyLiftIds.map((exId) => {
    const series = strengthSeries.filter((s) => s.exerciseId === exId);
    const baseline = series[0]?.e1RM ?? null;
    const current = series[series.length - 1]?.e1RM ?? null;
    const allTimeBest = series.length > 0 ? Math.max(...series.map((s) => s.e1RM)) : null;
    const pctChange =
      baseline != null && current != null && baseline > 0
        ? Math.round(((current - baseline) / baseline) * 100 * 10) / 10
        : null;
    return {
      exerciseId: exId,
      exerciseName: exNames.get(exId) ?? exId,
      baselineE1RM: baseline,
      currentE1RM: current,
      allTimeBestE1RM: allTimeBest,
      pctChange,
    };
  });

  // ── Weekly volume series ───────────────────────────────────────────────────
  const volumeByWeek = new Map<string, { totalKg: number; sessionCount: number }>();
  const sessionDates = new Set<string>(); // to count unique sessions

  for (const s of allSetLogs) {
    if (!s.completed) continue;
    const ws = weekStart(s.workoutLog.date).toISOString().slice(0, 10);
    const entry = volumeByWeek.get(ws) ?? { totalKg: 0, sessionCount: 0 };
    entry.totalKg += sessionVolume([{ weight: s.weight, reps: s.reps, completed: s.completed }]);
    const sessionKey = `${s.workoutLogId}__${ws}`;
    if (!sessionDates.has(sessionKey)) {
      sessionDates.add(sessionKey);
      entry.sessionCount += 1;
    }
    volumeByWeek.set(ws, entry);
  }

  const volumeSeries = Array.from(volumeByWeek.entries() as Iterable<[string, { totalKg: number; sessionCount: number }]>)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([weekStart, data]) => ({ weekStart, ...data }));

  // ── Weight trend ───────────────────────────────────────────────────────────
  const measurements = await prisma.measurement.findMany({
    where: { clientId },
    orderBy: { measuredAt: "asc" },
  });

  const weightReadings = measurements
    .filter((m) => m.bodyWeightKg != null)
    .map((m) => ({ date: m.measuredAt, weightKg: m.bodyWeightKg! }));

  const weightSeries = weightTrendEMA(weightReadings).map((r) => ({
    date: r.date.toISOString().slice(0, 10),
    weightKg: Math.round(r.weightKg * 10) / 10,
    ema: Math.round(r.ema * 100) / 100,
  }));

  // ── Milestones ─────────────────────────────────────────────────────────────
  const milestones = await prisma.milestone.findMany({
    where: { clientId },
    orderBy: { achievedAt: "desc" },
    include: { exercise: { select: { name: true } } },
  });

  const totalSessions = await prisma.workoutLog.count({ where: { clientId } });

  const lastMeasurement = measurements[measurements.length - 1] ?? null;

  return NextResponse.json({
    client: {
      primaryGoal: client.primaryGoal,
      keyLiftIds,
      goalTargets: client.goalTargets,
    },
    strengthSeries,
    keyLifts,
    volumeSeries,
    weightSeries,
    milestones: milestones.map((m) => ({
      id: m.id,
      type: m.type,
      title: m.title,
      description: m.description,
      metricValue: m.metricValue,
      metricUnit: m.metricUnit,
      exerciseId: m.exerciseId,
      exerciseName: m.exercise?.name ?? null,
      achievedAt: m.achievedAt.toISOString(),
      seenByClient: m.seenByClient,
    })),
    lastMeasurement: lastMeasurement
      ? {
          bodyWeightKg: lastMeasurement.bodyWeightKg,
          bodyFatPct: lastMeasurement.bodyFatPct,
          leanMassKg: lastMeasurement.leanMassKg,
          waistCm: lastMeasurement.waistCm,
          hipsCm: lastMeasurement.hipsCm,
          measuredAt: lastMeasurement.measuredAt.toISOString(),
        }
      : null,
    measurements: measurements.map((m) => ({
      id: m.id,
      measuredAt: m.measuredAt.toISOString(),
      bodyWeightKg: m.bodyWeightKg,
      bodyFatPct: m.bodyFatPct,
      leanMassKg: m.leanMassKg,
      visceralFat: m.visceralFat,
      waistCm: m.waistCm,
      hipsCm: m.hipsCm,
      chestCm: m.chestCm,
      armCm: m.armCm,
      thighCm: m.thighCm,
      painRating: m.painRating,
      source: m.source,
      notes: m.notes,
    })),
    totalSessions,
  });
});
