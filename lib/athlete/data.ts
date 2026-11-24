/**
 * Read models for the athlete app. Every query is scoped to the signed-in
 * athlete's own ClientProfile — the id always comes from the session.
 */

import { cache } from "react";
import { unstable_cache } from "next/cache";
import { progressVersion } from "@/lib/progress/version";
import { progressKey, type ProgressKey } from "@/lib/progress/cache-key";
import { loadSessionNotes } from "@/lib/sessions/notes";
import { planWorkoutStatus } from "@/lib/sessions/status";
import { pictureFor, type Picture } from "@/lib/exercises/pictures";
import { mediaPictures } from "@/lib/exercises/media";
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
import { prescribedRange, setPlan, type PrescribedSet } from "@/lib/plan/prescription";
import { DAY_MS, iso, localDay, referenceSession, safeTimeZone, sessionBefore, weekOf } from "./sessions";
import { finishedTotals } from "./totals";
import { loadCalendar } from "@/lib/history/load";
import type { HistoryCalendar } from "@/lib/history/calendar";
import { timedHasLoad, timedKind, type TimedKind } from "@/lib/plan/timed";
import { isTimedSet, setVolume } from "@/lib/sessions/volume";

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
 { date: Date; deload: boolean; sets: LoggedSet[]; range: { repMin: number; repMax: number } | null };


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
  /** At least one finished session: until then there is nothing for Progress to show. */
  hasHistory: boolean;
};

export const getAthlete = cache(async (): Promise<Athlete> => {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const identity = await athleteIdentity(session.user);
  // Signed in, but no athlete profile to show (e.g. the coach removed this client).
  if (!identity) redirect("/error?error=NoAccess");
  const { clientId, workspaceId, isCoach } = identity;

  // My training goes by the coach's own name, read fresh so a change in Settings shows at once. Both in one round.
  const [profile, coach] = await Promise.all([
    prisma.clientProfile.findUnique({
      where: { id: clientId },
      select: { fullName: true, goalTargets: true, _count: { select: { workoutLogs: { where: { completedAt: { not: null } } } } } },
    }),
    isCoach ? prisma.user.findUnique({ where: { id: session.user.id }, select: { name: true } }) : Promise.resolve(null),
  ]);
  if (!profile) redirect("/login");

  const meta = (profile.goalTargets as { athlete?: { prefs?: unknown; demo?: boolean } } | null)?.athlete;
  const prefs = normalizePrefs(meta?.prefs);
  const coachName = isCoach ? coach?.name?.trim() : null;
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
    hasHistory: profile._count.workoutLogs > 0,
  };
});

// ── Plan overview ───────────────────────────────────────────────────────────

type RawSet = PrescribedSet;

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
  /** How many sessions the lift has, when `series` was left out of what is sent to the browser (lib/progress/lite). */
  count?: number;
  /** What to aim for next session, when the exercise is still in the plan. */
  target: Target | null;
};

export type ProgressData = {
  exercises: ExerciseProgress[];
  totals: { sessions: number; volume: number; sets: number; prs: number; streak: number; since: string | null };
  recentPRs: Array<{ exercise: string; date: string; value: number; unit: "lb" | "reps" }>;
  /** Lifts with no gain (weight, est. 1RM or reps) across their last three counted sessions. */
  stalled: StalledLift[];
};

export type StalledLift = { exerciseId: string; name: string; /** First of the stalled sessions. */ since: string; sessions: number };


/** The signed-in athlete's History calendar (Progress). */
export const getHistory = cache(async (): Promise<HistoryCalendar> => {
  const athlete = await getAthlete();
  return loadCalendar({ clientId: athlete.clientId, workspaceId: athlete.workspaceId, timeZone: getTimeZone(), viewer: { kind: "athlete" } });
});

/**
 * The signed-in athlete's progress. The read model itself is shared with the coach side.
 *
 * No plan: next-session targets are the coach's (the athlete's screens send the lite data, which has none), so the
 * plan, a slower read than the sets, isn't waited for.
 *
 * Cached, because it reads every set the athlete has ever logged. The key (lib/progress/cache-key) is whose it is
 * (client and workspace: one athlete's is never served to another), the timezone, today, and a fingerprint of the
 * sessions and sets (lib/progress/version), so a set logged anywhere is in the very next read and no write path has
 * to clear anything. Exercise renames and lighter-week settings aren't in the key; they show within 10 minutes.
 */
export const getProgress = cache(async (): Promise<ProgressData> => {
  const athlete = await getAthlete();
  const timeZone = getTimeZone();
  const version = await progressVersion(athlete.clientId);
  return cachedProgress()(...progressKey(athlete, { timeZone, now: new Date(), version }));
});

/** Made per call, not at import: modules that mock next/cache in tests never reach it. */
const cachedProgress = () =>
  unstable_cache(
    // Today and the fingerprint are only part of the key.
    (...[clientId, workspaceId, selfServe, timeZone]: ProgressKey) => loadProgress({ clientId, workspaceId, plan: null, selfServe, timeZone }),
    ["athlete-progress", process.env.VERCEL_DEPLOYMENT_ID ?? "local"],
    { revalidate: 600 }
  );

/**
 * Progress for one client: per-exercise series, weekly totals, records.
 * The athlete's Progress screen and the coach's view of that client both
 * render exactly this.
 */
export async function loadProgress({
  clientId,
  workspaceId,
  plan: planInput,
  selfServe,
  timeZone,
}: {
  clientId: string;
  workspaceId: string;
  /** The client's live plan, for next-session targets. A promise is fine: the sets load while it does. */
  plan: PlanOverview | null | Promise<PlanOverview | null>;
  /** An athlete running their own plans (older ones count as generated). */
  selfServe: boolean;
  timeZone: string;
}): Promise<ProgressData> {
  const tz = timeZone;
  // The sets for the charts, and the finished sessions for the headline numbers (a session with no sets still counts).
  const setsQuery = prisma.setLog.findMany({
    where: { workoutLog: { clientId, client: { workspaceId } }, exerciseId: { not: null } },
    orderBy: { createdAt: "asc" },
    select: {
      exerciseId: true,
      weight: true,
      reps: true,
      completed: true,
      workoutLogId: true,
      workoutLog: WEEK_SOURCE,
      // The prescription the set was logged against: its range tells "the range moved up" from a hard day (see nextTarget),
      // and its unit or mode whether the reps are seconds (lib/sessions/volume.ts).
      assignedWorkoutExercise: { select: { prescribedSets: true, mode: true } },
      exercise: { select: { name: true, slug: true, primaryMuscles: true } },
    },
  });
  const finishedQuery = prisma.workoutLog.findMany({ where: { clientId, client: { workspaceId }, completedAt: { not: null } }, select: { id: true, date: true, completedAt: true } });
  const [sets, finished, plan] = await Promise.all([setsQuery, finishedQuery, planInput]);

  // exercise → session → sets
  const byExercise = new Map<
    string,
    { name: string; muscles: string[]; inc: number; timed: boolean; sessions: Map<string, Session> }
  >();
  let totalVolume = 0;
  let totalSets = 0;

  for (const s of sets) {
    if (!s.exerciseId || !s.exercise) continue;
    const date = s.workoutLog.date;
    const timed = isTimedSet(s, s.exercise.slug);
    let entry = byExercise.get(s.exerciseId);
    if (!entry) {
      const cat = CATALOG_BY_SLUG[s.exercise.slug];
      entry = {
        name: displayName(s.exercise.slug, s.exercise.name),
        muscles: cat?.muscles ?? ((s.exercise.primaryMuscles as string[] | null) ?? []),
        inc: cat ? (cat.tool === "bodyweight" ? 0 : cat.inc) : 5,
        timed,
        sessions: new Map(),
      };
      byExercise.set(s.exerciseId, entry);
    }
    let session = entry.sessions.get(s.workoutLogId);
    if (!session) {
      session = { date, deload: isDeloadSession(s.workoutLog, selfServe), sets: [], range: prescribedRange(s.assignedWorkoutExercise?.prescribedSets) };
      entry.sessions.set(s.workoutLogId, session);
    }
    session.sets.push({ weight: s.weight, reps: s.reps, completed: s.completed });

    if (s.completed && s.reps) {
      totalVolume += setVolume({ weight: s.weight, reps: s.reps, timed });
      totalSets += 1;
    }
  }

  const exercises: ExerciseProgress[] = [];
  const recentPRs: ProgressData["recentPRs"] = [];
  let prCount = 0;

  for (const [exerciseId, entry] of Array.from(byExercise.entries())) {
    const sessions = Array.from(entry.sessions.values()).sort((a, b) => a.date.getTime() - b.date.getTime());
    const points = sessions
      .map((s) => sessionPoint(localDay(s.date, tz), s.sets, s.deload, entry.timed))
      .filter((p): p is NonNullable<typeof p> => p != null);
    if (points.length === 0) continue;
    const series = buildSeries(points);
    const loaded = series.some((p) => p.weight != null);
    const rx = plan?.rx[exerciseId];
    const ref = referenceSession(sessions);
    const target = rx
      ? nextTarget({ last: ref?.sets ?? [], before: sessionBefore(sessions, ref)?.sets, lastRange: ref?.range, ...rx, increment: loaded ? entry.inc || 5 : 0 })
      : null;
    exercises.push({ exerciseId, name: entry.name, muscles: entry.muscles, loaded, timed: entry.timed, series, target });

    for (const p of series) {
      if (!p.record) continue;
      prCount += 1;
      recentPRs.push({ exercise: entry.name, date: p.date, value: p.weight ?? p.reps, unit: p.weight != null ? "lb" : "reps" });
    }
  }

  // Biggest lifts first: order by the most volume moved in a single session.
  const peak = (e: ExerciseProgress) => (e.loaded && !e.timed ? Math.max(...e.series.map((p) => p.volume)) : 0);
  exercises.sort((a, b) => peak(b) - peak(a) || b.series.length - a.series.length || a.name.localeCompare(b.name));
  recentPRs.sort((a, b) => b.date.localeCompare(a.date) || a.exercise.localeCompare(b.exercise));

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

  const headline = finishedTotals(finished, tz, localDay(new Date(), tz));

  return {
    exercises,
    totals: {
      sessions: headline.sessions,
      volume: Math.round(totalVolume),
      sets: totalSets,
      prs: prCount,
      streak: headline.streak,
      since: headline.since,
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
  /** What the coach wrote for this set beyond weight and reps: the target RPE, the rest after it, a note. */
  plan?: { rpe: number | null; rest: number | null; note: string | null } | null;
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
  /** For a timed exercise: a hold, steady cardio (a bike) or intervals. Null for reps. */
  timedKind: TimedKind | null;
  repMin: number;
  repMax: number;
  restSeconds: number;
  /** The coach's note on the exercise. */
  note?: string | null;
  target: Target;
  last: { date: string; sets: Array<{ weight: number | null; reps: number | null }> } | null;
  /** History before today, for the mini chart and live PR detection. */
  history: SessionPoint[];
  sets: LoggerSet[];
  /** What the movement looks like, when the library has it. */
  picture: Picture | null;
};

export type LoggerData = {
  id: string;
  name: string;
  week: number;
  status: WorkoutSummary["status"];
  note: string | null;
  workoutLogId: string | null;
  /** The athlete's own note on this session (shown on Session complete), if they wrote one. */
  myNote?: string | null;
  /** The coach's note on the session, when they wrote one (shown above the athlete's own). */
  coachNote?: string | null;
  exercises: LoggerExercise[];
  /** True in one of the plan's lighter weeks: no progression is asked for, and nothing counts as a record. */
  deloadWeek: boolean;
  /** The plan came from a coach: the athlete may swap an exercise but not retarget or remove it. */
  coachPlan: boolean;
  /** Other workouts from the same week, for quick switching. */
  siblings: Array<{ id: string; name: string; status: WorkoutSummary["status"]; date: string }>;
  metric: FocusMetric;
};

export async function getLoggerData(assignedWorkoutId: string): Promise<LoggerData | null> {
  const athlete = await getAthlete();
  const tz = getTimeZone();
  // Two rounds, not four: the lifts' history goes with the workout (it needs only the workout's id: its lifts are found
  // in the same query), and the week, the pictures and the note go together once the workout is known.
  // The history is this athlete's own sets whatever the id; if the workout isn't theirs, nothing below is used.
  const historyQuery = prisma.setLog.findMany({
    where: {
      exercise: { assignedExercises: { some: { assignedWorkoutId } } },
      workoutLog: { clientId: athlete.clientId, NOT: { assignedWorkoutId } },
    },
    // Set number breaks ties (an imported session's sets share one instant), so a session's sets keep their order.
    orderBy: [{ createdAt: "asc" }, { setNumber: "asc" }],
    select: {
      exerciseId: true,
      weight: true,
      reps: true,
      completed: true,
      workoutLogId: true,
      workoutLog: WEEK_SOURCE,
      // The range the set was prescribed at: tells "the range moved up" from a hard day (see nextTarget).
      assignedWorkoutExercise: { select: { prescribedSets: true } },
    },
  });
  const workoutQuery = prisma.assignedWorkout.findFirst({
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
          notes: true,
          section: true,
          exercise: { select: { name: true, slug: true, equipment: true, primaryMuscles: true, gifUrl: true } },
        },
      },
      workoutLog: {
        select: {
          id: true,
          completedAt: true,
          sets: {
            orderBy: { setNumber: "asc" },
            select: { id: true, assignedWorkoutExerciseId: true, exerciseId: true, setNumber: true, weight: true, reps: true, completed: true },
          },
        },
      },
    },
  });
  const [workout, history] = await Promise.all([workoutQuery, historyQuery]);
  if (!workout) return null;

  const start = workout.programAssignment.startDate.getTime();
  const week = weekOf(workout.scheduledDate.getTime(), start);
  // Half a day of slack either side absorbs daylight-saving shifts.
  const weekStart = new Date(start + (week - 1) * 7 * DAY_MS - DAY_MS / 2);
  const weekEnd = new Date(weekStart.getTime() + 7 * DAY_MS);

  const [siblings, own, notes] = await Promise.all([
    prisma.assignedWorkout.findMany({
      where: { programAssignmentId: workout.programAssignmentId, scheduledDate: { gte: weekStart, lt: weekEnd } },
      orderBy: { order: "asc" },
      select: { id: true, name: true, status: true, scheduledDate: true, workoutLog: { select: { completedAt: true } } },
    }),
    // The coach's own photos and clips win over the library's.
    mediaPictures(athlete.workspaceId, workout.exercises.map((e) => ({ exerciseId: e.exerciseId, name: displayName(e.exercise.slug, e.exercise.name) }))),
    workout.workoutLog ? loadSessionNotes([{ id: workout.workoutLog.id }]) : null,
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
      session = { date: s.workoutLog.date, deload: isDeloadSession(s.workoutLog, athlete.selfServe), sets: [], range: prescribedRange(s.assignedWorkoutExercise?.prescribedSets) };
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
      sessions.map((s) => sessionPoint(localDay(s.date, tz), s.sets, s.deload, unit === "secs")).filter((p): p is NonNullable<typeof p> => p != null)
    );
    const everLoaded = series.some((p) => p.weight != null);
    const bodyweight = cat ? cat.tool === "bodyweight" : /body ?only|bodyweight|n\/?a/i.test(e.exercise.equipment) && !everLoaded;
    const increment = bodyweight ? 0 : cat?.inc ?? 5;
    // A timed exercise is a hold, steady cardio or intervals: that decides the first-time wording, and whether a weight field is shown.
    const kind = unit === "secs" ? timedKind(e.exercise.name, e.notes) : null;
    const hasLoad =
      unit !== "secs" ||
      timedHasLoad({ name: e.exercise.name, equipment: e.exercise.equipment, tool: cat?.tool, prescribedWeight: prescribed.some((p) => typeof p.weight === "number" && p.weight > 0), everLoaded });

    const computed = nextTarget({
      last: lastSession?.sets ?? [],
      before: sessionBefore(sessions, lastSession)?.sets,
      lastRange: lastSession?.range,
      repMin,
      repMax,
      increment,
      unit,
      timed: kind ?? "hold",
      deload: deloadWeek,
    });
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
      // Each set starts at its own prescription: the weight the coach wrote for it, and its reps when they differ across the sets.
      const ps = prescribed[i];
      const own = ps && typeof ps.weight === "number" && ps.weight > 0 && !bodyweight ? ps.weight : target.weight;
      const perSetReps = prescribed.some((p) => p.repMin !== first.repMin);
      return { setNumber: i + 1, weight: own, reps: perSetReps && ps?.repMin ? ps.repMin : target.reps, done: false, setLogId: null, plan: setPlan(ps) };
    });

    return {
      aweId: e.id,
      exerciseId: e.exerciseId,
      slug: cat ? e.exercise.slug : null,
      name: displayName(e.exercise.slug, e.exercise.name),
      picture: pictureFor({ name: displayName(e.exercise.slug, e.exercise.name), gifUrl: e.exercise.gifUrl }),
      muscles: cat?.muscles ?? ((e.exercise.primaryMuscles as string[] | null) ?? []),
      role: e.section,
      loaded: !bodyweight && hasLoad,
      timedKind: kind,
      increment,
      unit,
      repMin,
      repMax,
      restSeconds: first.restSeconds ?? 90,
      note: e.notes?.trim() || null,
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
  for (const e of exercises) e.picture = own.get(e.exerciseId) ?? e.picture;
  const sessionNotes = workout.workoutLog ? notes?.get(workout.workoutLog.id) : undefined;
  const myNote = sessionNotes?.athlete ?? null;
  const coachNote = sessionNotes?.coach ?? null;

  return {
    id: workout.id,
    name: workout.name,
    week,
    status: planWorkoutStatus(workout.status, workout.workoutLog),
    note: workout.notes,
    workoutLogId: workout.workoutLog?.id ?? null,
    myNote,
    coachNote,
    deloadWeek,
    exercises,
    coachPlan: !athlete.selfServe,
    siblings: siblings.map((s) => ({ id: s.id, name: s.name, status: planWorkoutStatus(s.status, s.workoutLog), date: iso(s.scheduledDate) })),
    metric: athlete.metric,
  };
}
