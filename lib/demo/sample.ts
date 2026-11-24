/**
 * The demo's one athlete, Alex: month 6, hypertrophy, 4 days a week, "Upper / Lower" week 20 of 24, coached by Jess.
 * Hand-written numbers (docs/mockups/demo-mode/HANDOFF.md), so the curves read like a person, not noise. Plain data
 * only: nothing here (or anywhere under lib/demo, app/demo) imports the database. Progress and History are built with
 * the app's own pure builders, from the sessions below.
 */

import { exerciseKind } from "@/lib/plan/workout-kind";
import type { PlanOverview, WorkoutSummary } from "@/lib/plan/overview";
import type { ProgressData, LoggerData, ExerciseProgress } from "@/lib/athlete/data";
import type { HistorySession } from "@/lib/history/types";
import type { BodyWeightPoint } from "@/lib/athlete/body-weight";
import type { WeekNote } from "@/lib/plan/week-notes";
import { historyCalendar, type HistoryCalendar } from "@/lib/history/calendar";
import { buildSeries, sessionPoint, type SessionPoint, type Target } from "@/lib/plan/overload";

/** The demo's today (fixed, so every visit looks the same): Monday of week 20. */
export const DEMO_TODAY = "2026-11-23";
const WEEK1 = "2026-07-13"; // Monday of week 1
const addDays = (day: string, n: number) => {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

export const DEMO_ATHLETE = {
  name: "Alex Morgan",
  firstName: "Alex",
  isDemo: false,
  isGuest: false,
  isCoach: false,
  selfServe: false,
  metric: "e1rm" as const,
  hasHistory: true,
  prefs: { goal: "muscle", experience: "intermediate", daysPerWeek: 4, equipment: "gym", minutes: 60 } as never,
};

export const DEMO_WEEK_NOTES: WeekNote[] = [
  { week: 20, title: "Deload week next", text: "Same weights, half the sets. Sleep and food stay the same. Back to full loads in week 22.", by: "Coach Jess" },
  { week: 21, text: "Deload: same weights, half the sets.", by: "Coach Jess" },
  { week: 22, text: "Bench back to 185 for 4 × 6. Add 5 lb if all four land.", by: "Coach Jess" },
];

/** Bench top set by week (lighter every fourth week), weeks 1-20. */
const BENCH = [135, 135, 140, 125, 145, 150, 150, 135, 155, 160, 160, 145, 165, 170, 170, 150, 175, 180, 180, 185];
const LIGHTER = new Set([4, 8, 12, 16, 21]); // the bench numbers dip in 4, 8, 12, 16; Coach Jess deloads week 21
const squatAt = (w: number) => (LIGHTER.has(w) ? 155 : 135 + Math.min(w, 19) * 3 + (w > 18 ? 3 : 0)); // 195 by week 20
const deadAt = (w: number) => (LIGHTER.has(w) ? 205 : 195 + Math.min(w, 19) * 4 - 6); // 265 by week 19

type Ex = { id: string; slug: string; name: string; sets: number; reps: [number, number]; unit?: "reps" | "secs"; weight: (w: number) => number | null; note?: string; muscles: string[]; section: string };
const ex = (id: string, name: string, sets: number, reps: [number, number], weight: (w: number) => number | null, muscles: string[], section: string, note?: string, unit?: "reps" | "secs"): Ex => ({
  id: `demo-ex-${id}`,
  slug: id,
  name,
  sets,
  reps,
  weight,
  muscles,
  section,
  note,
  unit,
});

const WORKOUTS: Array<{ key: string; name: string; dayOffset: number; exercises: Ex[] }> = [
  {
    key: "ua",
    name: "Upper A",
    dayOffset: 0,
    exercises: [
      ex("bench", "Bench Press", 4, [6, 8], (w) => BENCH[w - 1], ["chest"], "block:1", "Add 5 lb when all four sets hit 8."),
      ex("row", "Barbell Row", 4, [8, 10], (w) => 115 + Math.floor(w / 2) * 5, ["back"], "block:2", "Chest to the bar, no hip drive."),
      ex("ohp", "Overhead Press", 3, [8, 10], (w) => 75 + Math.floor(w / 3) * 5, ["shoulders"], "block:3", "Squeeze glutes, ribs down."),
      ex("pulldown", "Lat Pulldown", 3, [10, 12], (w) => 100 + Math.floor(w / 3) * 5, ["back"], "block:4", "Pull elbows to back pockets."),
      ex("curl", "Incline Dumbbell Curl", 3, [10, 12], (w) => 20 + Math.floor(w / 6) * 5, ["biceps"], "block:5", "Slow on the way down."),
      ex("pushdown", "Cable Triceps Pushdown", 3, [12, 15], (w) => 40 + Math.floor(w / 5) * 5, ["triceps"], "block:5", "Elbows pinned."),
    ],
  },
  {
    key: "la",
    name: "Lower A",
    dayOffset: 1,
    exercises: [
      ex("squat", "Back Squat", 4, [5, 7], squatAt, ["quads", "glutes"], "block:1", "Pause one second at the bottom."),
      ex("rdl", "Romanian Deadlift", 3, [8, 10], (w) => 135 + Math.floor(w / 2) * 5, ["hamstrings"], "block:2", "Soft knees, push hips back."),
      ex("lunge", "Walking Lunge", 3, [10, 10], (w) => 30 + Math.floor(w / 5) * 5, ["quads", "glutes"], "block:3", "Ten each leg."),
      ex("plank", "Plank", 3, [45, 45], () => null, ["core"], "block:4", undefined, "secs"),
    ],
  },
  {
    key: "ub",
    name: "Upper B",
    dayOffset: 3,
    exercises: [
      ex("incline", "Incline Dumbbell Press", 4, [8, 10], (w) => 45 + Math.floor(w / 3) * 5, ["chest"], "block:1", "Two seconds down."),
      ex("pullup", "Pull-Up", 4, [6, 8], () => null, ["back"], "block:2", "Full hang at the bottom."),
      ex("cablerow", "Seated Cable Row", 3, [10, 12], (w) => 110 + Math.floor(w / 3) * 5, ["back"], "block:3", "Chest tall, pause at the ribs."),
      ex("lateral", "Dumbbell Lateral Raise", 3, [12, 15], (w) => 15 + Math.floor(w / 8) * 5, ["shoulders"], "block:4", "Lead with the elbows."),
    ],
  },
  {
    key: "lb",
    name: "Lower B",
    dayOffset: 4,
    exercises: [
      ex("deadlift", "Deadlift", 3, [5, 5], deadAt, ["hamstrings", "back"], "block:1", "Brace before every rep."),
      ex("legpress", "Leg Press", 3, [10, 12], (w) => 270 + w * 5, ["quads"], "block:2", "Full depth, low back on the pad."),
      ex("legcurl", "Lying Leg Curl", 3, [10, 12], (w) => 70 + Math.floor(w / 4) * 5, ["hamstrings"], "block:3", "Squeeze at the top."),
      ex("calf", "Standing Calf Raise", 3, [12, 15], (w) => 90 + Math.floor(w / 4) * 10, ["calves"], "block:4", "Pause at the bottom."),
    ],
  },
];

const TOTAL_WEEKS = 24;
const CURRENT_WEEK = 20;
/** Weeks 1-19, a few missed sessions (so it looks lived-in). */
const SKIPPED = new Set(["7-lb", "12-ub", "15-lb"]);
const dayOf = (week: number, offset: number) => addDays(WEEK1, (week - 1) * 7 + offset);
const workoutId = (week: number, key: string) => `demo-w${week}-${key}`;
const awe = (week: number, key: string, exId: string) => `demo-awe-${week}-${key}-${exId}`;
const deload = (week: number) => LIGHTER.has(week);

/** Today's workout, half done: Bench sets 1-3 (175×8, 175×8, 180×7), set 4 at 185 waiting; Barbell Row done. */
export const DEMO_IN_PROGRESS: Record<string, Array<{ weight: number | null; reps: number | null }>> = {
  [awe(20, "ua", "demo-ex-bench")]: [
    { weight: 175, reps: 8 },
    { weight: 175, reps: 8 },
    { weight: 180, reps: 7 },
  ],
  [awe(20, "ua", "demo-ex-row")]: [
    { weight: 125, reps: 10 },
    { weight: 125, reps: 10 },
    { weight: 125, reps: 9 },
    { weight: 125, reps: 9 },
  ],
};

// ── Sessions: the plan's weeks 1-19, plus walks and mobility before and between ───────────────────────────────

function setsFor(e: Ex, week: number) {
  const w = e.weight(week);
  const top = e.reps[1];
  return Array.from({ length: deload(week) ? Math.ceil(e.sets / 2) : e.sets }, (_, i) => ({
    exerciseId: e.id,
    weight: w,
    reps: e.unit === "secs" ? top : Math.max(e.reps[0], top - (i === e.sets - 1 ? 1 : 0) - (week % 3 === 0 && i > 1 ? 1 : 0)),
    completed: true,
  }));
}

const plannedSessions: HistorySession[] = [];
const sessionTitles: Record<string, string> = {};
for (let week = 1; week < CURRENT_WEEK; week++) {
  for (const wo of WORKOUTS) {
    if (SKIPPED.has(`${week}-${wo.key}`)) continue;
    const day = dayOf(week, wo.dayOffset);
    const id = `demo-log-${week}-${wo.key}`;
    plannedSessions.push({ id, date: new Date(`${day}T18:00:00Z`), completedAt: new Date(`${day}T19:00:00Z`), durationMin: 48 + ((week * 7 + wo.dayOffset * 3) % 19), sets: wo.exercises.flatMap((e) => setsFor(e, week)) });
    sessionTitles[id] = wo.name;
  }
}
// Walks and mobility: six weeks before the plan began, and now and then between.
const extras: HistorySession[] = [];
for (let i = 0; i < 81 - plannedSessions.length; i++) {
  const day = i < 6 ? addDays(WEEK1, -7 * (6 - i) + 2) : addDays(WEEK1, 7 * (2 * (i - 5)) + 5);
  if (day >= DEMO_TODAY) break;
  const id = `demo-extra-${i}`;
  const kind = i % 5 === 3 ? "run" : i % 2 ? "mobility" : "walk";
  const durationMin = kind === "run" ? 32 + (i % 3) * 6 : 30 + (i % 4) * 10;
  const mobSets = kind === "mobility" ? Array.from({ length: 6 }, () => ({ exerciseId: "demo-mobility", weight: null, reps: 40, completed: true, mobility: true })) : [];
  extras.push({ id, date: new Date(`${day}T08:00:00Z`), completedAt: new Date(`${day}T08:40:00Z`), durationMin, activity: kind === "run" ? "RUN" : kind === "walk" ? "WALK" : null, sets: mobSets });
  sessionTitles[id] = kind === "run" ? "Easy run" : kind === "mobility" ? "Mobility" : "Walk";
}
export const DEMO_SESSIONS: HistorySession[] = [...extras, ...plannedSessions].sort((a, b) => a.date.getTime() - b.date.getTime());

export const DEMO_CALENDAR: HistoryCalendar = historyCalendar(DEMO_SESSIONS, {
  timeZone: "UTC",
  today: DEMO_TODAY,
  meta: Object.fromEntries(Object.entries(sessionTitles).map(([id, title]) => [id, { title, href: null }])),
});

// ── The plan ────────────────────────────────────────────────────────────────────────────────────────────────

function repsLabel(e: Ex) {
  if (e.unit === "secs") return `${e.reps[0]} sec`;
  return e.reps[0] === e.reps[1] ? `${e.reps[0]}` : `${e.reps[0]}–${e.reps[1]}`;
}

function summary(week: number, wo: (typeof WORKOUTS)[number]): WorkoutSummary {
  const done = week < CURRENT_WEEK && !SKIPPED.has(`${week}-${wo.key}`);
  const skipped = week < CURRENT_WEEK && SKIPPED.has(`${week}-${wo.key}`);
  return {
    id: workoutId(week, wo.key),
    name: wo.name,
    week,
    date: dayOf(week, wo.dayOffset),
    status: done ? "LOGGED" : skipped ? "SKIPPED" : "PLANNED",
    note: null,
    history: [],
    deload: deload(week),
    estMinutes: 55,
    exercises: wo.exercises.map((e) => ({
      aweId: awe(week, wo.key, e.id),
      exerciseId: e.id,
      slug: e.slug,
      kind: exerciseKind(e.muscles),
      name: e.name,
      sets: deload(week) ? Math.ceil(e.sets / 2) : e.sets,
      reps: repsLabel(e),
      repMin: e.reps[0],
      repMax: e.reps[1],
      unit: e.unit ?? "reps",
      weight: e.weight(week),
      note: e.note ?? null,
      picture: null,
      section: e.section,
    })),
  } as WorkoutSummary;
}

const workouts = Array.from({ length: TOTAL_WEEKS }, (_, i) => WORKOUTS.map((wo) => summary(i + 1, wo))).flat();
const nextUp = workouts.find((w) => w.week === CURRENT_WEEK && w.status === "PLANNED") ?? null;

export const DEMO_PLAN: PlanOverview = {
  id: "demo-plan",
  name: "Upper / Lower",
  status: "ACTIVE",
  startDate: WEEK1,
  totalWeeks: TOTAL_WEEKS,
  currentWeek: CURRENT_WEEK,
  generated: false,
  // The demo's lighter weeks are written into the plan itself (half the sets); the every-4th-week rule stays off.
  lighterWeeks: false,
  prefs: null,
  goalText: "Build muscle, bench 185 for reps",
  note: null,
  weekNotes: DEMO_WEEK_NOTES,
  blocks: [],
  rationale: [],
  workouts,
  nextUp,
  done: workouts.filter((w) => w.status === "LOGGED").length,
  rx: {},
};

// ── Progress ────────────────────────────────────────────────────────────────────────────────────────────────

function seriesFor(e: Ex): SessionPoint[] {
  const raw = plannedSessions
    .map((s) => {
      const sets = s.sets.filter((x) => x.exerciseId === e.id);
      const day = s.date.toISOString().slice(0, 10);
      const week = Math.floor((new Date(`${day}T12:00:00Z`).getTime() - new Date(`${WEEK1}T12:00:00Z`).getTime()) / (7 * 86_400_000)) + 1;
      return sets.length ? sessionPoint(day, sets, deload(week)) : null;
    })
    .filter((p): p is NonNullable<typeof p> => p != null);
  return buildSeries(raw);
}

const target = (weight: number | null, reps: number, headline: string, reason: string): Target => ({ weight, reps, kind: "add_weight", headline, reason });

const PROGRESS_LIFTS: Array<{ e: Ex; target: Target }> = [
  { e: WORKOUTS[0].exercises[0], target: target(185, 6, "185 × 6", "All four sets hit 8 at 180.") },
  { e: WORKOUTS[1].exercises[0], target: target(205, 5, "Up to 205 next week", "Coach Jess: great depth on squats.") },
  { e: WORKOUTS[3].exercises[0], target: target(270, 5, "270 × 5", "Every rep moved well last time.") },
  { e: WORKOUTS[0].exercises[2], target: target(110, 8, "110 × 8", "Top of the range at 105.") },
];

const exercises: ExerciseProgress[] = PROGRESS_LIFTS.map(({ e, target: t }) => ({ exerciseId: e.id, name: e.name, muscles: e.muscles, loaded: true, timed: false, series: seriesFor(e), target: t }));
const allSets = DEMO_SESSIONS.flatMap((s) => s.sets);
export const DEMO_PROGRESS: ProgressData = {
  exercises,
  totals: {
    sessions: DEMO_SESSIONS.length,
    volume: Math.round(allSets.reduce((v, s) => v + (s.weight ?? 0) * (s.reps ?? 0), 0)),
    sets: allSets.length,
    prs: exercises.reduce((n, x) => n + x.series.filter((p) => p.record).length, 0),
    streak: 19,
    since: DEMO_SESSIONS[0].date.toISOString().slice(0, 10),
  },
  recentPRs: exercises
    .flatMap((x) => x.series.filter((p) => p.record && p.weight != null).map((p) => ({ exercise: x.name, date: p.date, value: p.weight as number, unit: "lb" as const })))
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 5),
  stalled: [],
};

/** Body weight, Sundays, 188 → 180 over the plan (a little noise, never a straight line). */
export const DEMO_BODY_WEIGHT: BodyWeightPoint[] = [188, 187.6, 187.8, 186.9, 186.4, 186.8, 185.9, 185.2, 185.6, 184.7, 184.1, 184.4, 183.5, 183.0, 183.2, 182.4, 181.9, 182.2, 181.3, 180.8, 180.4, 180].map((lb, i) => ({ day: addDays(WEEK1, 7 * i - 1), lb }));

// ── The logger ──────────────────────────────────────────────────────────────────────────────────────────────

/** A plan workout as the logger reads it (today's Upper A with its first sets done). Null for anything else. */
export function demoLoggerData(id: string): LoggerData | null {
  const w = workouts.find((x) => x.id === id);
  if (!w) return null;
  const wo = WORKOUTS.find((x) => x.name === w.name)!;
  const siblings = workouts.filter((x) => x.week === w.week && x.id !== w.id).map((x) => ({ id: x.id, name: x.name, status: x.status, date: x.date }));
  return {
    id: w.id,
    name: w.name,
    week: w.week,
    status: w.status,
    note: null,
    workoutLogId: w.week === CURRENT_WEEK && w.name === "Upper A" ? "demo-log-today" : null,
    deloadWeek: deload(w.week),
    coachPlan: true,
    siblings,
    metric: "e1rm",
    exercises: wo.exercises.map((e) => {
      const done = DEMO_IN_PROGRESS[awe(w.week, wo.key, e.id)] ?? [];
      const sets = deload(w.week) ? Math.ceil(e.sets / 2) : e.sets;
      const history = seriesFor(e).filter((p) => p.date < w.date);
      const last = history[history.length - 1];
      return {
        aweId: awe(w.week, wo.key, e.id),
        exerciseId: e.id,
        slug: e.slug,
        name: e.name,
        muscles: e.muscles,
        role: null,
        loaded: e.weight(w.week) != null,
        increment: 5,
        unit: e.unit ?? "reps",
        timedKind: e.unit === "secs" ? "hold" : null,
        repMin: e.reps[0],
        repMax: e.reps[1],
        restSeconds: 90,
        note: e.note ?? null,
        target: { weight: e.weight(w.week), reps: e.reps[1], kind: "custom", headline: `${e.weight(w.week) ?? "Bodyweight"}${e.weight(w.week) ? " lb" : ""} × ${e.reps[0]}–${e.reps[1]}`, reason: "As Coach Jess wrote it." },
        last: last ? { date: last.date, sets: [{ weight: last.weight, reps: last.reps }] } : null,
        history,
        sets: Array.from({ length: sets }, (_, i) => ({
          setNumber: i + 1,
          weight: done[i]?.weight ?? (w.name === "Upper A" && e.slug === "bench" && i === 3 ? 185 : e.weight(w.week)),
          reps: done[i]?.reps ?? null,
          done: i < done.length,
          setLogId: i < done.length ? `demo-set-${e.slug}-${i + 1}` : null,
        })),
        picture: null,
      };
    }),
  } as LoggerData;
}

export const DEMO_COUNTS = { sessions: DEMO_SESSIONS.length };

/** Exercise names by id, for the History day sheet. */
export const DEMO_EXERCISE_NAMES: Record<string, string> = Object.fromEntries(WORKOUTS.flatMap((w) => w.exercises.map((e) => [e.id, e.name])));
