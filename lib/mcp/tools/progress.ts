import { z } from "zod";
import { prisma } from "@/lib/db/client";
import { strengthComposite, weightTrendEMA } from "@/lib/progress/math";
import { localDay, safeTimeZone } from "@/lib/athlete/sessions";
import { ALL_ROLES } from "../auth";
import type { ScopedClient } from "../context";
import { describePrescription, loadActiveAssignment, loadSetRows } from "../data";
import { groupByExercise, personalRecords, summarizeSession, volumeByWeek, type ExerciseHistory } from "../derive";
import { ClientIdArg, TimeZoneArg } from "../schemas";
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
    "A client's progress in one call: estimated 1-rep max trends for their key lifts (with a composite % change), weekly training volume, the body-weight trend, and personal records (heaviest weight and best estimated 1-rep max per exercise, all time). For what to do next session, and which lifts have stalled, use get_training_recommendations.",
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
    const [rows, allRows, measurements] = await Promise.all([
      loadSetRows(client, { since }),
      // Records are all-time, not just the window.
      loadSetRows(client),
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
      personalRecords: personalRecords(groupByExercise(allRows, tz)).slice(0, 25),
    };
  },
});

