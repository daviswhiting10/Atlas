/**
 * Read models for the athlete app. Every query is scoped to the signed-in
 * athlete's own ClientProfile — the id always comes from the session.
 */

import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db/client";
import { CATALOG_BY_SLUG, displayName } from "@/lib/plan/catalog";
import { GOALS, normalizePrefs, resolvePrefs, type FocusMetric, type Prefs } from "@/lib/plan/generator";
import { buildSeries, nextTarget, sessionPoint, type LoggedSet, type SessionPoint, type Target } from "@/lib/plan/overload";
import { GUEST_EMAIL_DOMAIN } from "@/lib/guest";
import { athleteIdentity } from "./identity";
import { PLATEAU_SESSIONS, detectPlateau } from "@/lib/progress/plateau";
import { LIGHTER_SELECT, isLighterWeek, type LighterSource } from "@/lib/plan/lighter";
import { loadPlanOverview, type PlanOverview, type WorkoutSummary } from "@/lib/plan/overview";

export type { PlanOverview, WorkoutSummary } from "@/lib/plan/overview";
import { DAY_MS, iso, localDay, mondayOf, referenceSession, safeTimeZone, weekOf, weekStreak } from "./sessions";

/** Upper bound on sets per exercise in one workout. */
export const MAX_SETS = 20;

export const TZ_COOKIE = "tz";
export { safeTimeZone };

/**
 * The athlete's timezone, reported by the browser in a cookie. Logged
 * sessions are instants, so "which day was that?" depends on where the
 * athlete is — without this an evening session would chart as tomorrow.
 */
const getTimeZone = () => safeTimeZone(cookies().get(TZ_COOKIE)?.value);

type Session =
 { date: Date; deload: boolean; sets: LoggedSet[] };


/** Select shape that lets a logged set be traced back to its plan week. */
const WEEK_SOURCE = {
  select: { date: true, assignedWorkout: { select: { scheduledDate: true, programAssignment: { select: LIGHTER_SELECT } } } },
} as const;

type WeekSource = { assignedWorkout: { scheduledDate: Date; programAssignment: LighterSource } | null };

/** Whether a logged session fell in a lighter week of the plan it was logged against. */
function isDeloadSession(log: WeekSource, selfServe: boolean): boolean {
  return log.assignedWorkout != null && isLighterWeek(log.assignedWorkout.scheduledDate, log.assignedWorkout.programAssignment, selfServe);
}

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
  /** A coach in My training: their own profile, opened from the coach side. */
  isCoach: boolean;
};

export const getAthlete = cache(async (): Promise<Athlete> => {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const identity = await athleteIdentity(session.user);
  // Signed in, but no athlete profile to show (e.g. the coach removed this client).
  if (!identity) redirect("/error?error=NoAccess");
  const { clientId, workspaceId, isCoach } = identity;

  const profile = await prisma.clientProfile.findUnique({
    where: { id: clientId },
    select: { fullName: true, goalTargets: true },
  });
  if (!profile) redirect("/login");

  const meta = (profile.goalTargets as { athlete?: { prefs?: unknown; demo?: boolean } } | null)?.athlete;
  const prefs = normalizePrefs(meta?.prefs);
  // My training goes by the coach's own name, read fresh so a change in Settings shows at once.
  const coachName = isCoach ? (await prisma.user.findUnique({ where: { id: session.user.id }, select: { name: true } }))?.name?.trim() : null;
  const name = isCoach ? coachName || (profile.fullName !== "Me" ? profile.fullName : "") || "Coach" : profile.fullName || session.user.name || "Athlete";
  return {
    userId: session.user.id,
    clientId,
    workspaceId,
    name,
    firstName: name.split(" ")[0],
    prefs,
    metric: GOALS[resolvePrefs(prefs).goal].metric,
    isDemo: meta?.demo === true,
    isGuest: (session.user.email ?? "").endsWith(`@${GUEST_EMAIL_DOMAIN}`),
    selfServe: meta != null,
    isCoach,
  };
});

// ── Plan overview ───────────────────────────────────────────────────────────

type RawSet = { weight?: number | null; repMin?: number; repMax?: number; unit?: "reps" | "secs"; restSeconds?: number | null };

/** The signed-in athlete's active plan. The read model itself is shared with the coach side. */
export const getPlanOverview = cache(async (): Promise<PlanOverview | null> => {
  const athlete = await getAthlete();
  return loadPlanOverview({
    clientId: athlete.clientId,
    workspaceId: athlete.workspaceId,
    fallbackPrefs: athlete.selfServe ? athlete.prefs : null,
  });
});

// ── Progress ────────────────────────────────────────────────────────────────

export type ExerciseProgress = {
  exerciseId: string;
  name: string;
  muscles: string[];
  loaded: boolean;
  /** Measured in seconds rather than reps (planks, carries). */
  timed: boolean;
  series: SessionPoint[];
  /** What to aim for next session, when the exercise is still in the plan. */
  target: Target | null;
};

export type WeekBucket = { week: string; sessions: number; volume: number };

export type ProgressData = {
  exercises: ExerciseProgress[];
  weeks: WeekBucket[];
  totals: { sessions: number; volume: number; sets: number; prs: number; streak: number; since: string | null };
  recentPRs: Array<{ exercise: string; date: string; value: number; unit: "lb" | "reps" }>;
  /** Lifts with no gain (weight, est. 1RM or reps) across their last three counted sessions. */
  stalled: StalledLift[];
};

export type StalledLift = { exerciseId: string; name: string; /** First of the stalled sessions. */ since: string; sessions: number };


/** The signed-in athlete's progress. The read model itself is shared with the coach side. */
export const getProgress = cache(async (): Promise<ProgressData> => {
  const athlete = await getAthlete();
  const plan = await getPlanOverview();
  return loadProgress({ clientId: athlete.clientId, workspaceId: athlete.workspaceId, plan, selfServe: athlete.selfServe, timeZone: getTimeZone() });
});

/**
 * Progress for one client: per-exercise series, weekly totals, records.
 * The athlete's Progress screen and the coach's view of that client both
 * render exactly this.
 */
export async function loadProgress({
  clientId,
  workspaceId,
  plan,
  selfServe,
  timeZone,
}: {
  clientId: string;
  workspaceId: string;
  /** The client's live plan, for next-session targets. */
  plan: PlanOverview | null;
  /** An athlete running their own plans (older ones count as generated). */
  selfServe: boolean;
  timeZone: string;
}): Promise<ProgressData> {
  const tz = timeZone;
  const sets = await prisma.setLog.findMany({
    where: { workoutLog: { clientId, client: { workspaceId } }, exerciseId: { not: null } },
    orderBy: { createdAt: "asc" },
    select: {
      exerciseId: true,
      weight: true,
      reps: true,
      completed: true,
      workoutLogId: true,
      workoutLog: WEEK_SOURCE,
      exercise: { select: { name: true, slug: true, primaryMuscles: true } },
    },
  });

  // exercise → session → sets
  const byExercise = new Map<
    string,
    { name: string; muscles: string[]; inc: number; timed: boolean; sessions: Map<string, Session> }
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
        timed: cat?.unit === "secs",
        sessions: new Map(),
      };
      byExercise.set(s.exerciseId, entry);
    }
    let session = entry.sessions.get(s.workoutLogId);
    if (!session) {
      session = { date, deload: isDeloadSession(s.workoutLog, selfServe), sets: [] };
      entry.sessions.set(s.workoutLogId, session);
    }
    session.sets.push({ weight: s.weight, reps: s.reps, completed: s.completed });

    if (s.completed && s.reps) {
      sessionDates.set(s.workoutLogId, date);
      const wk = mondayOf(localDay(date, tz));
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
      .map((s) => sessionPoint(localDay(s.date, tz), s.sets, s.deload))
      .filter((p): p is NonNullable<typeof p> => p != null);
    if (points.length === 0) continue;
    const series = buildSeries(points);
    const loaded = series.some((p) => p.weight != null);
    const rx = plan?.rx[exerciseId];
    const target = rx
      ? nextTarget({ last: referenceSession(sessions)?.sets ?? [], ...rx, increment: loaded ? entry.inc || 5 : 0 })
      : null;
    exercises.push({ exerciseId, name: entry.name, muscles: entry.muscles, loaded, timed: entry.timed, series, target });

    for (const p of series) {
      if (!p.record) continue;
      prCount += 1;
      recentPRs.push({ exercise: entry.name, date: p.date, value: p.weight ?? p.reps, unit: p.weight != null ? "lb" : "reps" });
    }
  }

  // Biggest lifts first: order by the most volume moved in a single session.
  const peak = (e: ExerciseProgress) => (e.loaded ? Math.max(...e.series.map((p) => p.volume)) : 0);
  exercises.sort((a, b) => peak(b) - peak(a) || b.series.length - a.series.length || a.name.localeCompare(b.name));
  recentPRs.sort((a, b) => b.date.localeCompare(a.date));

  const today = localDay(new Date(), tz);
  const stalled: StalledLift[] = exercises.flatMap((e) => {
    const verdict = detectPlateau(
      e.series.map((p) => ({ date: p.date, topWeight: p.weight, bestE1RM: p.e1rm, repsAtTop: p.reps, deload: p.deload })),
      today
    );
    if (verdict.plateaued !== true) return [];
    const counted = e.series.filter((p) => !p.deload && p.weight != null);
    const recent = counted.slice(-PLATEAU_SESSIONS);
    return [{ exerciseId: e.exerciseId, name: e.name, since: recent[0].date, sessions: recent.length }];
  });
  stalled.sort((a, b) => a.name.localeCompare(b.name));

  // Fill empty weeks between the first and the current one so gaps show honestly.
  const weeks: WeekBucket[] = [];
  const keys = Array.from(weekMap.keys()).sort();
  if (keys.length > 0) {
    const end = new Date(mondayOf(localDay(new Date(), tz)) + "T00:00:00Z").getTime();
    for (let t = new Date(keys[0] + "T00:00:00Z").getTime(); t <= end; t += 7 * DAY_MS) {
      const key = iso(new Date(t));
      const b = weekMap.get(key);
      weeks.push({ week: key, sessions: b?.sessions.size ?? 0, volume: Math.round(b?.volume ?? 0) });
    }
  }

  const streak = weekStreak(weeks);

  return {
    exercises,
    weeks: weeks.slice(-12),
    totals: {
      sessions: sessionDates.size,
      volume: Math.round(totalVolume),
      sets: totalSets,
      prs: prCount,
      streak,
      since: sessionDates.size > 0 ? localDay(new Date(Math.min(...Array.from(sessionDates.values()).map((d) => d.getTime()))), tz) : null,
    },
    recentPRs: recentPRs.slice(0, 12),
    stalled,
  };
}

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
  /** Catalog slug, when the exercise is one of Atlas's own. */
  slug: string | null;
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
  /** True in one of the plan's lighter weeks: no progression is asked for, and nothing counts as a record. */
  deloadWeek: boolean;
  /** Other workouts from the same week, for quick switching. */
  siblings: Array<{ id: string; name: string; status: WorkoutSummary["status"]; date: string }>;
  metric: FocusMetric;
};

export async function getLoggerData(assignedWorkoutId: string): Promise<LoggerData | null> {
  const athlete = await getAthlete();
  const tz = getTimeZone();
  const workout = await prisma.assignedWorkout.findFirst({
    where: { id: assignedWorkoutId, programAssignment: { clientId: athlete.clientId } },
    select: {
      id: true,
      name: true,
      status: true,
      notes: true,
      scheduledDate: true,
      programAssignmentId: true,
      programAssignment: { select: LIGHTER_SELECT },
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
        workoutLog: WEEK_SOURCE,
      },
    }),
    prisma.assignedWorkout.findMany({
      where: { programAssignmentId: workout.programAssignmentId, scheduledDate: { gte: weekStart, lt: weekEnd } },
      orderBy: { order: "asc" },
      select: { id: true, name: true, status: true, scheduledDate: true },
    }),
  ]);

  const sessionsByExercise = new Map<string, Map<string, Session>>();
  for (const s of history) {
    if (!s.exerciseId) continue;
    let sessions = sessionsByExercise.get(s.exerciseId);
    if (!sessions) {
      sessions = new Map();
      sessionsByExercise.set(s.exerciseId, sessions);
    }
    let session = sessions.get(s.workoutLogId);
    if (!session) {
      session = { date: s.workoutLog.date, deload: isDeloadSession(s.workoutLog, athlete.selfServe), sets: [] };
      sessions.set(s.workoutLogId, session);
    }
    session.sets.push({ weight: s.weight, reps: s.reps, completed: s.completed });
  }

  const logged = workout.workoutLog?.sets ?? [];
  const deloadWeek = isLighterWeek(workout.scheduledDate, workout.programAssignment, athlete.selfServe);

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
    const lastSession = referenceSession(sessions);
    const series = buildSeries(
      sessions.map((s) => sessionPoint(localDay(s.date, tz), s.sets, s.deload)).filter((p): p is NonNullable<typeof p> => p != null)
    );
    const everLoaded = series.some((p) => p.weight != null);
    const bodyweight = cat ? cat.tool === "bodyweight" : /body ?only|bodyweight|n\/?a/i.test(e.exercise.equipment) && !everLoaded;
    const increment = bodyweight ? 0 : cat?.inc ?? 5;

    const computed = nextTarget({ last: lastSession?.sets ?? [], repMin, repMax, increment, unit, deload: deloadWeek });
    // A weight written into the plan (by the athlete mid-session, or by a
    // coach) is the target. Otherwise it is worked out from the last session.
    const setWeight = typeof first.weight === "number" && first.weight > 0 && !bodyweight ? first.weight : null;
    const target: Target =
      setWeight == null
        ? computed
        : {
            weight: setWeight,
            reps: repMin,
            kind: "custom",
            headline: `${setWeight} lb × ${repMin === repMax ? repMax : `${repMin}–${repMax}`}`,
            reason: `The target set for this session.${computed.weight != null && computed.kind !== "first" ? ` From your last session Atlas would suggest ${computed.weight} lb × ${computed.reps}.` : ""}`,
          };

    const mine = logged.filter((s) => s.assignedWorkoutExerciseId === e.id || (!s.assignedWorkoutExerciseId && s.exerciseId === e.exerciseId));
    const count = Math.min(MAX_SETS, Math.max(prescribed.length, mine.reduce((m, s) => Math.max(m, s.setNumber), 0)));
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
      slug: cat ? e.exercise.slug : null,
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
            date: localDay(lastSession.date, tz),
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
    deloadWeek,
    exercises,
    siblings: siblings.map((s) => ({ id: s.id, name: s.name, status: s.status, date: iso(s.scheduledDate) })),
    metric: athlete.metric,
  };
}
