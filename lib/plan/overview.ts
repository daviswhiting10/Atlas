/**
 * The plan as every screen shows it: athlete Today and Plan, and the coach's
 * editor and client pages. One read model, so a coach and their client are
 * always looking at the same thing.
 *
 * Scope is passed in explicitly; this module knows nothing about sessions.
 */

import { prisma } from "@/lib/db/client";
import { displayName } from "./catalog";
import { generatePlan, normalizePrefs, type Prefs } from "./generator";
import { isLighterWeek, lighterWeeksOn } from "./lighter";
import { weekOf } from "@/lib/athlete/sessions";

const iso = (d: Date) => d.toISOString().slice(0, 10);

type RawSet = { weight?: number | null; repMin?: number; repMax?: number; unit?: "reps" | "secs"; restSeconds?: number | null };

export type WorkoutStatus = "PLANNED" | "LOGGED" | "SKIPPED" | "RESCHEDULED";

export type WorkoutSummary = {
  id: string;
  name: string;
  week: number;
  date: string;
  status: WorkoutStatus;
  /** A note written by the athlete or their coach. */
  note: string | null;
  /** One of the plan's lighter weeks. */
  deload: boolean;
  estMinutes: number;
  exercises: Array<{
    aweId: string;
    exerciseId: string;
    slug: string;
    name: string;
    sets: number;
    /** Display form of the rep range, e.g. "8–12" or "30–60s". */
    reps: string;
    repMin: number;
    repMax: number;
    unit: "reps" | "secs";
    /** A target weight written into the plan, if there is one. */
    weight: number | null;
  }>;
};

export type PlanOverview = {
  id: string;
  name: string;
  status: "ACTIVE" | "PAUSED" | "COMPLETED" | "CANCELED";
  startDate: string;
  totalWeeks: number;
  currentWeek: number;
  /** Built by the plan generator (as opposed to written by hand in the old builder). */
  generated: boolean;
  /** Whether the last week of every 4-week block is lighter. */
  lighterWeeks: boolean;
  /** The preferences the plan was generated from, when it was. */
  prefs: Prefs | null;
  /** The goal in the words it was given. */
  goalText: string | null;
  /** Free notes on the plan as a whole. */
  note: string | null;
  blocks: Array<{ name: string; weeks: number; focus: string }>;
  rationale: string[];
  workouts: WorkoutSummary[];
  nextUp: WorkoutSummary | null;
  done: number;
  /** The next prescription for each exercise — used to project chart targets. */
  rx: Record<string, { repMin: number; repMax: number; unit: "reps" | "secs"; deload: boolean }>;
};

export function repLabel(sets: RawSet[]): string {
  const s = sets[0];
  if (!s) return "";
  const range = s.repMin === s.repMax ? `${s.repMax}` : `${s.repMin}–${s.repMax}`;
  return s.unit === "secs" ? `${range}s` : range;
}

function estimate(exercises: Array<{ prescribedSets: unknown }>): number {
  const seconds = exercises.reduce((sum, e) => {
    const sets = (e.prescribedSets as RawSet[]) ?? [];
    return sum + sets.reduce((t, s) => t + 40 + (s.restSeconds ?? 60), 60);
  }, 300);
  return Math.max(10, Math.round(seconds / 300) * 5);
}

/** The generator preferences stored with a program, if it was generated. */
export function storedPrefs(goalTags: unknown): Prefs | null {
  const raw = (goalTags as { prefs?: unknown } | null)?.prefs;
  return raw && typeof raw === "object" ? normalizePrefs(raw) : null;
}

export async function loadPlanOverview({
  clientId,
  workspaceId,
  assignmentId,
  fallbackPrefs = null,
}: {
  clientId: string;
  workspaceId: string;
  /** A specific plan (a coach's draft, say). Defaults to the client's active plan. */
  assignmentId?: string;
  /** Preferences to assume for plans generated before they were stored with the program. */
  fallbackPrefs?: Prefs | null;
}): Promise<PlanOverview | null> {
  const assignment = await prisma.programAssignment.findFirst({
    where: assignmentId ? { id: assignmentId, clientId, workspaceId } : { clientId, workspaceId, status: "ACTIVE" },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      status: true,
      startDate: true,
      goalText: true,
      notes: true,
      lighterWeeks: true,
      sourceProgram: { select: { goalTags: true } },
      assignedWorkouts: {
        orderBy: [{ order: "asc" }, { scheduledDate: "asc" }],
        select: {
          id: true,
          name: true,
          scheduledDate: true,
          status: true,
          notes: true,
          exercises: {
            orderBy: { order: "asc" },
            select: { id: true, exerciseId: true, prescribedSets: true, exercise: { select: { name: true, slug: true } } },
          },
        },
      },
    },
  });
  if (!assignment) return null;

  const prefs = storedPrefs(assignment.sourceProgram.goalTags) ?? fallbackPrefs;
  const generated = prefs != null;
  const plan = prefs ? generatePlan(prefs) : null;
  const start = assignment.startDate.getTime();
  // An athlete's own plan from before prefs were stored with it still counts as generated.
  const selfServe = fallbackPrefs != null;
  const lighterWeeks = lighterWeeksOn(assignment, selfServe);
  const isDeload = (date: Date) => isLighterWeek(date, assignment, selfServe);

  const workouts: WorkoutSummary[] = assignment.assignedWorkouts.map((w) => ({
    id: w.id,
    name: w.name,
    week: weekOf(w.scheduledDate.getTime(), start),
    date: iso(w.scheduledDate),
    status: w.status,
    note: w.notes,
    deload: isDeload(w.scheduledDate),
    estMinutes: estimate(w.exercises),
    exercises: w.exercises.map((e) => {
      const sets = (e.prescribedSets as RawSet[]) ?? [];
      return {
        aweId: e.id,
        exerciseId: e.exerciseId,
        slug: e.exercise.slug,
        name: displayName(e.exercise.slug, e.exercise.name),
        sets: sets.length,
        reps: repLabel(sets),
        repMin: sets[0]?.repMin ?? 0,
        repMax: sets[0]?.repMax ?? 0,
        unit: sets[0]?.unit === "secs" ? ("secs" as const) : ("reps" as const),
        weight: sets[0]?.weight ?? null,
      };
    }),
  }));

  const rx: PlanOverview["rx"] = {};
  for (const w of assignment.assignedWorkouts) {
    if (w.status !== "PLANNED") continue;
    for (const e of w.exercises) {
      if (rx[e.exerciseId]) continue;
      const first = ((e.prescribedSets as RawSet[]) ?? [])[0];
      if (!first) continue;
      const repMin = first.repMin ?? 8;
      rx[e.exerciseId] = { repMin, repMax: first.repMax ?? repMin, unit: first.unit === "secs" ? "secs" : "reps", deload: isDeload(w.scheduledDate) };
    }
  }

  const nextUp = workouts.find((w) => w.status === "PLANNED") ?? null;
  const totalWeeks = workouts.reduce((m, w) => Math.max(m, w.week), 1);

  return {
    id: assignment.id,
    name: assignment.name,
    status: assignment.status,
    startDate: iso(assignment.startDate),
    totalWeeks,
    currentWeek: nextUp?.week ?? totalWeeks,
    generated,
    lighterWeeks,
    prefs,
    goalText: assignment.goalText ?? prefs?.goalText ?? null,
    note: assignment.notes,
    blocks: plan?.blocks ?? [],
    rationale: plan?.rationale ?? [],
    workouts,
    nextUp,
    done: workouts.filter((w) => w.status === "LOGGED").length,
    rx,
  };
}
