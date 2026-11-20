/**
 * Milestone engine.
 * Inline checks called after data writes — fire-and-forget from callers.
 * Application-level dedup: check existence before insert (safe against null
 * exerciseId, where Postgres unique constraints don't cover NULLs).
 */

import { prisma } from "@/lib/db/client";
import { e1RM, bestE1RM, type SetRecord } from "./math";
import { isRecordWeight, sessionMilestones } from "./milestone-rules";

// ── Internal: award one milestone, silently skip dupes ───────────────────────

async function award(data: {
  workspaceId: string;
  clientId: string;
  type: string;
  title: string;
  description: string;
  metricValue?: number | null;
  metricUnit?: string | null;
  exerciseId?: string | null;
  achievedAt: Date;
  sourceSetLogId?: string | null;
}): Promise<void> {
  const existing = await prisma.milestone.findFirst({
    where: {
      clientId: data.clientId,
      type: data.type,
      exerciseId: data.exerciseId ?? null,
    },
    select: { id: true },
  });
  if (existing) return;

  await prisma.milestone.create({
    data: {
      workspaceId: data.workspaceId,
      clientId: data.clientId,
      type: data.type,
      title: data.title,
      description: data.description,
      metricValue: data.metricValue ?? null,
      metricUnit: data.metricUnit ?? null,
      exerciseId: data.exerciseId ?? null,
      achievedAt: data.achievedAt,
      sourceSetLogId: data.sourceSetLogId ?? null,
    },
  });
}

// ── Session milestones (call after WorkoutLog completes) ─────────────────────

export async function checkSessionMilestones(
  workspaceId: string,
  clientId: string
): Promise<void> {
  try {
    // Finished sessions only, each milestone on the day of the session that reached it.
    const finished = await prisma.workoutLog.findMany({
      where: { clientId, completedAt: { not: null } },
      select: { date: true },
    });
    for (const m of sessionMilestones(finished.map((f) => f.date))) {
      await award({ workspaceId, clientId, ...m });
    }
  } catch (err) {
    console.error("[milestones] checkSessionMilestones:", err);
  }
}

// ── Plate thresholds by exercise name pattern ─────────────────────────────────

const PLATE_THRESHOLDS: Array<{
  pattern: string;
  plates: Array<{ weight: number; label: string; type: string }>;
}> = [
  {
    pattern: "bench",
    plates: [
      { weight: 135, label: "First plate on bench", type: "plate_bench_135" },
      { weight: 185, label: "185 lb bench",         type: "plate_bench_185" },
      { weight: 225, label: "Two plates on bench",  type: "plate_bench_225" },
      { weight: 275, label: "275 lb bench",         type: "plate_bench_275" },
      { weight: 315, label: "Three plates on bench",type: "plate_bench_315" },
    ],
  },
  {
    pattern: "squat",
    plates: [
      { weight: 135, label: "First plate on squat", type: "plate_squat_135" },
      { weight: 225, label: "Two plates on squat",  type: "plate_squat_225" },
      { weight: 315, label: "Three plates on squat",type: "plate_squat_315" },
      { weight: 405, label: "Four plates on squat", type: "plate_squat_405" },
    ],
  },
  {
    pattern: "deadlift",
    plates: [
      { weight: 135, label: "First plate on deadlift", type: "plate_deadlift_135" },
      { weight: 225, label: "Two plates on deadlift",  type: "plate_deadlift_225" },
      { weight: 315, label: "Three plates on deadlift",type: "plate_deadlift_315" },
      { weight: 405, label: "Four plates on deadlift", type: "plate_deadlift_405" },
      { weight: 495, label: "495 lb deadlift",         type: "plate_deadlift_495" },
    ],
  },
  {
    pattern: "overhead press",
    plates: [
      { weight: 95,  label: "95 lb overhead press",  type: "plate_ohp_95" },
      { weight: 135, label: "135 lb overhead press", type: "plate_ohp_135" },
      { weight: 185, label: "185 lb overhead press", type: "plate_ohp_185" },
    ],
  },
];

// ── Strength milestones (call after every SetLog insert) ─────────────────────

export async function checkStrengthMilestones(
  workspaceId: string,
  clientId: string,
  exerciseId: string,
  exerciseName: string,
  newSet: { weight: number | null; reps: number | null; completed: boolean },
  setLogId: string
): Promise<void> {
  try {
    // A milestone sits on the day the session was done, not the day it was noticed.
    const done = await prisma.setLog.findUnique({ where: { id: setLogId }, select: { workoutLog: { select: { date: true } } } });
    const now = done?.workoutLog.date ?? new Date();

    // All completed sets for this exercise from this client, oldest first
    const allSets = await prisma.setLog.findMany({
      where: { workoutLog: { clientId }, exerciseId, completed: true },
      orderBy: { createdAt: "asc" },
      select: { id: true, weight: true, reps: true, completed: true },
    });

    if (allSets.length === 0) return;

    const setRecords: SetRecord[] = allSets.map((s) => ({
      weight: s.weight, reps: s.reps, completed: s.completed,
    }));

    // First time this exercise logged
    if (allSets.length === 1) {
      await award({
        workspaceId, clientId,
        type: "first_exercise_logged", exerciseId,
        title: `First ${exerciseName} logged`,
        description: `Started tracking ${exerciseName} — every rep from here builds the baseline.`,
        achievedAt: now, sourceSetLogId: setLogId,
      });
    }

    // e1RM progression
    if (newSet.weight != null && newSet.reps != null && newSet.reps > 0 && newSet.completed) {
      const currentE1RM = e1RM(newSet.weight, newSet.reps);

      // Baseline = best e1RM from first 5 sets (first session proxy)
      const baselineSets = setRecords.slice(0, Math.min(5, setRecords.length));
      const baselineE1RM = bestE1RM(baselineSets);

      // One record rule: the heaviest weight so far (as lib/history/records.ts). The set's own row is
      // in `allSets`, so only the sets before it are compared.
      const at = allSets.findIndex((x) => x.id === setLogId);
      if (at > 0 && isRecordWeight(allSets.slice(0, at).map((x) => x.weight), newSet.weight)) {
        await award({
          workspaceId, clientId,
          type: "first_pr", exerciseId,
          title: `${exerciseName} PR`,
          description: `Heaviest set so far: ${newSet.weight} lb.`,
          metricValue: newSet.weight, metricUnit: "lb",
          achievedAt: now, sourceSetLogId: setLogId,
        });
      }

      if (baselineE1RM != null && baselineE1RM > 0 && allSets.length > 1) {
        const pctChange = ((currentE1RM - baselineE1RM) / baselineE1RM) * 100;

        for (const [pct, label] of [
          [10, "10% stronger"], [25, "25% stronger"], [50, "50% stronger"],
        ] as [number, string][]) {
          if (pctChange >= pct) {
            await award({
              workspaceId, clientId,
              type: `strength_${pct}pct`, exerciseId,
              title: `${label} on ${exerciseName}`,
              description: `${exerciseName} e1RM is up ${pctChange.toFixed(0)}% from where you started.`,
              metricValue: pctChange, metricUnit: "%",
              achievedAt: now, sourceSetLogId: setLogId,
            });
          }
        }
      }

      // Plate milestones (based on actual weight, not e1RM)
      const nameLower = exerciseName.toLowerCase();
      for (const { pattern, plates } of PLATE_THRESHOLDS) {
        if (nameLower.includes(pattern)) {
          for (const plate of plates) {
            if (newSet.weight >= plate.weight) {
              await award({
                workspaceId, clientId,
                type: plate.type, exerciseId,
                title: plate.label,
                description: `Lifted ${plate.weight} lb on ${exerciseName}.`,
                metricValue: plate.weight, metricUnit: "lb",
                achievedAt: now, sourceSetLogId: setLogId,
              });
            }
          }
          break;
        }
      }
    }
  } catch (err) {
    console.error("[milestones] checkStrengthMilestones:", err);
  }
}
