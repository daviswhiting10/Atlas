/**
 * Read models for the athlete app. Every query is scoped to the signed-in
 * athlete's own ClientProfile — the id always comes from the session.
 */

import { cache } from "react";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db/client";
import { CATALOG_BY_SLUG, displayName } from "@/lib/plan/catalog";
import { GOALS, generatePlan, normalizePrefs, type FocusMetric, type Prefs } from "@/lib/plan/generator";
import { buildSeries, nextTarget, sessionPoint, type LoggedSet, type SessionPoint, type Target } from "@/lib/plan/overload";
import { GUEST_EMAIL_DOMAIN } from "@/lib/guest";

const DAY_MS = 86_400_000;
const iso = (d: Date) => d.toISOString().slice(0, 10);
/** 1-indexed plan week. Rounds to whole days first so DST can't shift a week. */
const weekOf = (time: number, start: number) => Math.max(1, Math.floor(Math.round((time - start) / DAY_MS) / 7) + 1);

export type Athlete = {
  userId: string;
  clientId: string;
  workspaceId: string;
  name: string;
  firstName: string;
  prefs: Prefs;
  metric: FocusMetric;
  isDemo: boolean;
  isGuest: boolean;
  /** True when the plan came from the generator rather than a coach. */
  selfServe: boolean;
};

export const getAthlete = cache(async (): Promise<Athlete> => {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (session.user.role !== "CLIENT") redirect("/inbox");
  const clientId = session.user.clientProfileId;
  const workspaceId = session.user.workspaceId;
  if (!clientId || !workspaceId) redirect("/login");

  const profile = await prisma.clientProfile.findUnique({
    where: { id: clientId },
    select: { fullName: true, goalTargets: true },
  });
  if (!profile) redirect("/login");

  const meta = (profile.goalTargets as { athlete?: { prefs?: unknown; demo?: boolean } } | null)?.athlete;
  const prefs = normalizePrefs(meta?.prefs);
  const name = profile.fullName || session.user.name || "Athlete";
  return {
    userId: session.user.id,
    clientId,
    workspaceId,
    name,
    firstName: name.split(" ")[0],
    prefs,
    metric: GOALS[prefs.goal].metric,
    isDemo: meta?.demo === true,
    isGuest: (session.user.email ?? "").endsWith(`@${GUEST_EMAIL_DOMAIN}`),
    selfServe: meta != null,
  };
});

// ── Plan overview ───────────────────────────────────────────────────────────

type RawSet = { repMin?: number; repMax?: number; unit?: "reps" | "secs"; restSeconds?: number | null };

export type WorkoutSummary = {
  id: string;
  name: string;
  week: number;
  date: string;
  status: "PLANNED" | "LOGGED" | "SKIPPED" | "RESCHEDULED";
  note: string | null;
  estMinutes: number;
  exercises: Array<{ name: string; sets: number; reps: string }>;
};

export type PlanOverview = {
  id: string;
  name: string;
  startDate: string;
  totalWeeks: number;
  currentWeek: number;
  blocks: Array<{ name: string; weeks: number; focus: string }>;
  rationale: string[];
  workouts: WorkoutSummary[];
  nextUp: WorkoutSummary | null;
  done: number;
  /** The next prescription for each exercise — used to project chart targets. */
  rx: Record<string, { repMin: number; repMax: number; unit: "reps" | "secs" }>;
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

export const getPlanOverview = cache(async (): Promise<PlanOverview | null> => {
  const athlete = await getAthlete();
  const assignment = await prisma.programAssignment.findFirst({
    where: { clientId: athlete.clientId, status: "ACTIVE" },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      startDate: true,
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
            select: { exerciseId: true, prescribedSets: true, exercise: { select: { name: true, slug: true } } },
          },
        },
      },
    },
  });
  if (!assignment) return null;

  const start = assignment.startDate.getTime();
  const workouts: WorkoutSummary[] = assignment.assignedWorkouts.map((w) => ({
    id: w.id,
    name: w.name,
    week: weekOf(w.scheduledDate.getTime(), start),
    date: iso(w.scheduledDate),
    status: w.status,
    note: w.notes,
    estMinutes: estimate(w.exercises),
    exercises: w.exercises.map((e) => {
      const sets = (e.prescribedSets as RawSet[]) ?? [];
      return { name: displayName(e.exercise.slug, e.exercise.name), sets: sets.length, reps: repLabel(sets) };
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
      rx[e.exerciseId] = { repMin, repMax: first.repMax ?? repMin, unit: first.unit === "secs" ? "secs" : "reps" };
    }
  }

  const nextUp = workouts.find((w) => w.status === "PLANNED") ?? null;
  const totalWeeks = workouts.reduce((m, w) => Math.max(m, w.week), 1);
  const plan = athlete.selfServe ? generatePlan(athlete.prefs) : null;

  return {
    id: assignment.id,
    name: assignment.name,
    startDate: iso(assignment.startDate),
    totalWeeks,
    currentWeek: nextUp?.week ?? totalWeeks,
    blocks: plan?.blocks ?? [],
    rationale: plan?.rationale ?? [],
    workouts,
    nextUp,
    done: workouts.filter((w) => w.status === "LOGGED").length,
    rx,
  };
});

// ── Progress ────────────────────────────────────────────────────────────────

export type ExerciseProgress = {
  exerciseId: string;
  name: string;
  muscles: string[];
  loaded: boolean;
  series: SessionPoint[];
  /** What to aim for next session, when the exercise is still in the plan. */
  target: Target | null;
};

export type WeekBucket = { week: string; sessions: number; volume: number };

export type ProgressData = {
  exercises: ExerciseProgress[];
  weeks: WeekBucket[];
  totals: { sessions: number; volume: number; sets: number; prs: number; streak: number };
  recentPRs: Array<{ exercise: string; date: string; metric: FocusMetric; value: number; loaded: boolean }>;
};

function mondayOf(d: Date): string {
  const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  x.setUTCDate(x.getUTCDate() - ((x.getUTCDay() + 6) % 7));
  return iso(x);
}

export const getProgress = cache(async (): Promise<ProgressData> => {
  const athlete = await getAthlete();
  const plan = await getPlanOverview();
  const sets = await prisma.setLog.findMany({
    where: { workoutLog: { clientId: athlete.clientId }, exerciseId: { not: null } },
    orderBy: { createdAt: "asc" },
    select: {
      exerciseId: true,
      weight: true,
      reps: true,
      completed: true,
      workoutLogId: true,
      workoutLog: { select: { date: true } },
      exercise: { select: { name: true, slug: true, primaryMuscles: true } },
    },
  });

  // exercise → session → sets
  const byExercise = new Map<
    string,
    { name: string; muscles: string[]; inc: number; sessions: Map<string, { date: Date; sets: LoggedSet[] }> }
  >();
  const sessionDates = new Map<string, Date>();
  const weekMap = new Map<string, { sessions: Set<string>; volume: number }>();
  let totalVolume = 0;
  let totalSets = 0;

  for (const s of sets) {
    if (!s.exerciseId || !s.exercise) continue;
    const date = s.workoutLog.date;
    let entry = byExercise.get(s.exerciseId);
    if (!entry) {
      const cat = CATALOG_BY_SLUG[s.exercise.slug];
      entry = {
        name: displayName(s.exercise.slug, s.exercise.name),
        muscles: cat?.muscles ?? ((s.exercise.primaryMuscles as string[] | null) ?? []),
        inc: cat ? (cat.tool === "bodyweight" ? 0 : cat.inc) : 5,
        sessions: new Map(),
      };
      byExercise.set(s.exerciseId, entry);
    }
    let session = entry.sessions.get(s.workoutLogId);
    if (!session) {
      session = { date, sets: [] };
      entry.sessions.set(s.workoutLogId, session);
    }
    session.sets.push({ weight: s.weight, reps: s.reps, completed: s.completed });

    if (s.completed && s.reps) {
      sessionDates.set(s.workoutLogId, date);
      const wk = mondayOf(date);
      let bucket = weekMap.get(wk);
      if (!bucket) {
        bucket = { sessions: new Set(), volume: 0 };
        weekMap.set(wk, bucket);
      }
      bucket.sessions.add(s.workoutLogId);
      const v = (s.weight ?? 0) * s.reps;
      bucket.volume += v;
      totalVolume += v;
      totalSets += 1;
    }
  }

  const exercises: ExerciseProgress[] = [];
  const recentPRs: ProgressData["recentPRs"] = [];
  let prCount = 0;

  for (const [exerciseId, entry] of Array.from(byExercise.entries())) {
    const sessions = Array.from(entry.sessions.values()).sort((a, b) => a.date.getTime() - b.date.getTime());
    const points = sessions
      .map((s) => sessionPoint(iso(s.date), s.sets))
      .filter((p): p is NonNullable<typeof p> => p != null);
    if (points.length === 0) continue;
    const series = buildSeries(points);
    const loaded = series.some((p) => p.weight != null);
    const rx = plan?.rx[exerciseId];
    const target = rx
      ? nextTarget({ last: sessions[sessions.length - 1].sets, ...rx, increment: loaded ? entry.inc || 5 : 0 })
      : null;
    exercises.push({ exerciseId, name: entry.name, muscles: entry.muscles, loaded, series, target });

    const headline: FocusMetric = loaded ? "e1rm" : "reps";
    for (const p of series) {
      if (!p.pr[headline]) continue;
      prCount += 1;
      recentPRs.push({ exercise: entry.name, date: p.date, metric: headline, value: p[headline] ?? 0, loaded });
    }
  }

  // Biggest lifts first: order by the most volume moved in a single session.
  const peak = (e: ExerciseProgress) => (e.loaded ? Math.max(...e.series.map((p) => p.volume)) : 0);
  exercises.sort((a, b) => peak(b) - peak(a) || b.series.length - a.series.length || a.name.localeCompare(b.name));
  recentPRs.sort((a, b) => b.date.localeCompare(a.date));

  // Fill empty weeks between the first and the current one so gaps show honestly.
  const weeks: WeekBucket[] = [];
  const keys = Array.from(weekMap.keys()).sort();
  if (keys.length > 0) {
    const end = new Date(mondayOf(new Date()) + "T00:00:00Z").getTime();
    for (let t = new Date(keys[0] + "T00:00:00Z").getTime(); t <= end; t += 7 * DAY_MS) {
      const key = iso(new Date(t));
      const b = weekMap.get(key);
      weeks.push({ week: key, sessions: b?.sessions.size ?? 0, volume: Math.round(b?.volume ?? 0) });
    }
  }

  // Streak: consecutive weeks with a session, ending this week or last.
  let streak = 0;
  for (let i = weeks.length - 1; i >= 0; i--) {
    if (weeks[i].sessions > 0) streak += 1;
    else if (i === weeks.length - 1) continue; // this week hasn't had its session yet
    else break;
  }

  return {
    exercises,
    weeks: weeks.slice(-12),
    totals: { sessions: sessionDates.size, volume: Math.round(totalVolume), sets: totalSets, prs: prCount, streak },
    recentPRs: recentPRs.slice(0, 6),
  };
});

// ── Workout (logger) ────────────────────────────────────────────────────────

export type LoggerSet = {
  setNumber: number;
  weight: number | null;
  reps: number | null;
  done: boolean;
  setLogId: string | null;
};

export type LoggerExercise = {
  aweId: string;
  exerciseId: string;
  name: string;
  muscles: string[];
  role: string | null;
  loaded: boolean;
  increment: number;
  unit: "reps" | "secs";
  repMin: number;
  repMax: number;
  restSeconds: number;
  target: Target;
  last: { date: string; sets: Array<{ weight: number | null; reps: number | null }> } | null;
  /** History before today, for the mini chart and live PR detection. */
  history: SessionPoint[];
  sets: LoggerSet[];
};

export type LoggerData = {
  id: string;
  name: string;
  week: number;
  status: WorkoutSummary["status"];
  note: string | null;
  workoutLogId: string | null;
  exercises: LoggerExercise[];
  /** Other workouts from the same week, for quick switching. */
  siblings: Array<{ id: string; name: string; status: WorkoutSummary["status"]; date: string }>;
  metric: FocusMetric;
};

export async function getLoggerData(assignedWorkoutId: string): Promise<LoggerData | null> {
  const athlete = await getAthlete();
  const workout = await prisma.assignedWorkout.findFirst({
    where: { id: assignedWorkoutId, programAssignment: { clientId: athlete.clientId } },
    select: {
      id: true,
      name: true,
      status: true,
      notes: true,
      scheduledDate: true,
      programAssignmentId: true,
      programAssignment: { select: { startDate: true } },
      exercises: {
        orderBy: { order: "asc" },
        select: {
          id: true,
          exerciseId: true,
          prescribedSets: true,
          section: true,
          exercise: { select: { name: true, slug: true, equipment: true, primaryMuscles: true } },
        },
      },
      workoutLog: {
        select: {
          id: true,
          sets: {
            orderBy: { setNumber: "asc" },
            select: { id: true, assignedWorkoutExerciseId: true, exerciseId: true, setNumber: true, weight: true, reps: true, completed: true },
          },
        },
      },
    },
  });
  if (!workout) return null;

  const start = workout.programAssignment.startDate.getTime();
  const week = weekOf(workout.scheduledDate.getTime(), start);
  // Half a day of slack either side absorbs daylight-saving shifts.
  const weekStart = new Date(start + (week - 1) * 7 * DAY_MS - DAY_MS / 2);
  const weekEnd = new Date(weekStart.getTime() + 7 * DAY_MS);

  const exerciseIds = workout.exercises.map((e) => e.exerciseId);
  const [history, siblings] = await Promise.all([
    prisma.setLog.findMany({
      where: {
        exerciseId: { in: exerciseIds },
        workoutLog: { clientId: athlete.clientId, NOT: { assignedWorkoutId: workout.id } },
      },
      orderBy: { createdAt: "asc" },
      select: {
        exerciseId: true,
        weight: true,
        reps: true,
        completed: true,
        workoutLogId: true,
        workoutLog: { select: { date: true } },
      },
    }),
    prisma.assignedWorkout.findMany({
      where: { programAssignmentId: workout.programAssignmentId, scheduledDate: { gte: weekStart, lt: weekEnd } },
      orderBy: { order: "asc" },
      select: { id: true, name: true, status: true, scheduledDate: true },
    }),
  ]);

  const sessionsByExercise = new Map<string, Map<string, { date: Date; sets: LoggedSet[] }>>();
  for (const s of history) {
    if (!s.exerciseId) continue;
    let sessions = sessionsByExercise.get(s.exerciseId);
    if (!sessions) {
      sessions = new Map();
      sessionsByExercise.set(s.exerciseId, sessions);
    }
    let session = sessions.get(s.workoutLogId);
    if (!session) {
      session = { date: s.workoutLog.date, sets: [] };
      sessions.set(s.workoutLogId, session);
    }
    session.sets.push({ weight: s.weight, reps: s.reps, completed: s.completed });
  }

  const logged = workout.workoutLog?.sets ?? [];

  const exercises: LoggerExercise[] = workout.exercises.map((e) => {
    const prescribed = ((e.prescribedSets as RawSet[]) ?? []).length > 0 ? (e.prescribedSets as RawSet[]) : [{}];
    const first = prescribed[0];
    const cat = CATALOG_BY_SLUG[e.exercise.slug];
    const unit = first.unit === "secs" ? "secs" : "reps";
    const repMin = first.repMin ?? 8;
    const repMax = first.repMax ?? Math.max(repMin, 10);

    const sessions = Array.from(sessionsByExercise.get(e.exerciseId)?.values() ?? []).sort(
      (a, b) => a.date.getTime() - b.date.getTime()
    );
    const lastSession = sessions.at(-1) ?? null;
    const series = buildSeries(
      sessions.map((s) => sessionPoint(iso(s.date), s.sets)).filter((p): p is NonNullable<typeof p> => p != null)
    );
    const everLoaded = series.some((p) => p.weight != null);
    const bodyweight = cat ? cat.tool === "bodyweight" : /body ?only|bodyweight|n\/?a/i.test(e.exercise.equipment) && !everLoaded;
    const increment = bodyweight ? 0 : cat?.inc ?? 5;

    const target = nextTarget({ last: lastSession?.sets ?? [], repMin, repMax, increment, unit });

    const mine = logged.filter((s) => s.assignedWorkoutExerciseId === e.id || (!s.assignedWorkoutExerciseId && s.exerciseId === e.exerciseId));
    const count = Math.max(prescribed.length, mine.reduce((m, s) => Math.max(m, s.setNumber), 0));
    const sets: LoggerSet[] = Array.from({ length: count }, (_, i) => {
      const saved = mine.find((s) => s.setNumber === i + 1);
      if (saved) {
        return { setNumber: i + 1, weight: saved.weight, reps: saved.reps, done: saved.completed, setLogId: saved.id };
      }
      return { setNumber: i + 1, weight: target.weight, reps: target.reps, done: false, setLogId: null };
    });

    return {
      aweId: e.id,
      exerciseId: e.exerciseId,
      name: displayName(e.exercise.slug, e.exercise.name),
      muscles: cat?.muscles ?? ((e.exercise.primaryMuscles as string[] | null) ?? []),
      role: e.section,
      loaded: !bodyweight,
      increment,
      unit,
      repMin,
      repMax,
      restSeconds: first.restSeconds ?? 90,
      target,
      last: lastSession
        ? {
            date: iso(lastSession.date),
            sets: lastSession.sets.filter((s) => s.completed).map((s) => ({ weight: s.weight, reps: s.reps })),
          }
        : null,
      history: series,
      sets,
    };
  });

  return {
    id: workout.id,
    name: workout.name,
    week,
    status: workout.status,
    note: workout.notes,
    workoutLogId: workout.workoutLog?.id ?? null,
    exercises,
    siblings: siblings.map((s) => ({ id: s.id, name: s.name, status: s.status, date: iso(s.scheduledDate) })),
    metric: athlete.metric,
  };
}
