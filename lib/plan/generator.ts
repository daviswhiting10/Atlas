/**
 * Plan generator — pure, deterministic, no I/O.
 *
 * Turns an athlete's goal, experience, schedule and equipment into a
 * 12-week periodised program: three 4-week blocks, a lighter week closing each
 * block, and a training split matched to how many days they can train.
 *
 * Because it is pure it runs in the browser for the live preview during
 * onboarding and on the server when the plan is persisted — same output both
 * places.
 */

import { CATALOG_BY_SLUG, SLOTS, type CatalogExercise, type Equipment, type Slot } from "./catalog";

export type Goal = "muscle" | "strength" | "fat_loss" | "general";
export type Experience = "beginner" | "intermediate" | "advanced";
export type FocusMetric = "weight" | "reps" | "e1rm" | "volume";

export type Prefs = {
  goal: Goal;
  experience: Experience;
  daysPerWeek: 2 | 3 | 4 | 5 | 6;
  equipment: Equipment;
  /** Target session length in minutes. */
  minutes: 30 | 45 | 60 | 75;
};

export const DEFAULT_PREFS: Prefs = {
  goal: "muscle",
  experience: "intermediate",
  daysPerWeek: 4,
  equipment: "gym",
  minutes: 60,
};

export const GOALS: Record<
  Goal,
  { label: string; blurb: string; metric: FocusMetric; metricWhy: string; primaryGoal: string }
> = {
  muscle: {
    label: "Build muscle",
    blurb: "Moderate reps, plenty of volume, steady load increases.",
    metric: "volume",
    metricWhy: "Muscle grows when total work goes up, so your charts lead with volume.",
    primaryGoal: "hypertrophy",
  },
  strength: {
    label: "Get stronger",
    blurb: "Heavy compound lifts, lower reps, long rests.",
    metric: "e1rm",
    metricWhy: "Strength is about your top-end, so your charts lead with estimated 1-rep max.",
    primaryGoal: "performance",
  },
  fat_loss: {
    label: "Lose fat",
    blurb: "Keep your strength while moving fast with short rests.",
    metric: "reps",
    metricWhy: "In a deficit the win is doing more reps at the same weight, so your charts lead with reps.",
    primaryGoal: "weight_loss",
  },
  general: {
    label: "Stay fit",
    blurb: "Balanced full-body training you can keep up for years.",
    metric: "weight",
    metricWhy: "Your charts lead with the weight on the bar — the simplest sign you're improving.",
    primaryGoal: "general",
  },
};

export const EXPERIENCE: Record<Experience, { label: string; blurb: string }> = {
  beginner: { label: "New to lifting", blurb: "Under a year of consistent training" },
  intermediate: { label: "Some experience", blurb: "One to three years, know the main lifts" },
  advanced: { label: "Experienced", blurb: "Three-plus years of structured training" },
};

export const EQUIPMENT: Record<Equipment, { label: string; blurb: string }> = {
  gym: { label: "Full gym", blurb: "Barbells, machines and cables" },
  dumbbells: { label: "Dumbbells", blurb: "A pair of dumbbells and a bench" },
  bodyweight: { label: "Bodyweight", blurb: "No equipment, a pull-up bar helps" },
};

export const TOTAL_WEEKS = 12;
export const BLOCK_WEEKS = 4;

export type PlannedSet = {
  setNumber: number;
  weight: number | null;
  unit?: "reps" | "secs";
  repMin: number;
  repMax: number;
  rpe: number | null;
  restSeconds: number | null;
};

export type PlannedExercise = {
  slug: string;
  name: string;
  role: "main" | "secondary" | "accessory";
  sets: number;
  repMin: number;
  repMax: number;
  unit: "reps" | "secs";
  restSeconds: number;
};

export type PlannedDay = {
  name: string;
  focus: string;
  /** Day offset from the start of each training week (0 = first day). */
  offset: number;
  exercises: PlannedExercise[];
};

export type PlanBlock = { name: string; weeks: number; focus: string };

export type Plan = {
  name: string;
  split: string;
  prefs: Prefs;
  blocks: PlanBlock[];
  /** Baseline week. Use `weekVariant` for a specific week of the 12. */
  days: PlannedDay[];
  rationale: string[];
  estMinutes: number;
};

// ── Splits ──────────────────────────────────────────────────────────────────

type DayTemplate = { name: string; focus: string; slots: Slot[] };

const FULL_A: DayTemplate = { name: "Full Body A", focus: "Squat · Press · Row", slots: ["squat", "press", "row", "legcurl", "curl", "core"] };
const FULL_B: DayTemplate = { name: "Full Body B", focus: "Hinge · Overhead · Pull", slots: ["deadlift", "overhead", "pull", "lunge", "triceps", "core2"] };
const FULL_C: DayTemplate = { name: "Full Body C", focus: "Legs · Incline · Row", slots: ["quad", "incline", "row2", "glute", "lateral", "core3"] };
const UPPER_A: DayTemplate = { name: "Upper A", focus: "Chest · Back", slots: ["press", "row", "overhead", "pull", "curl", "triceps"] };
const LOWER_A: DayTemplate = { name: "Lower A", focus: "Quads · Hamstrings", slots: ["squat", "hinge", "lunge", "legcurl", "calf", "core"] };
const UPPER_B: DayTemplate = { name: "Upper B", focus: "Shoulders · Lats", slots: ["overhead", "pull", "incline", "row2", "lateral", "reardelt"] };
const LOWER_B: DayTemplate = { name: "Lower B", focus: "Posterior chain", slots: ["deadlift", "quad", "glute", "legext", "calf", "core2"] };
const PUSH_A: DayTemplate = { name: "Push", focus: "Chest · Shoulders · Triceps", slots: ["press", "overhead", "incline", "lateral", "triceps", "fly"] };
const PULL_A: DayTemplate = { name: "Pull", focus: "Back · Biceps", slots: ["pull", "row", "row2", "reardelt", "curl", "core3"] };
const LEGS_A: DayTemplate = { name: "Legs", focus: "Quads · Hamstrings · Glutes", slots: ["squat", "hinge", "quad", "legcurl", "calf", "core"] };
const PUSH_B: DayTemplate = { name: "Push B", focus: "Shoulders · Upper chest", slots: ["overhead", "incline", "press", "lateral", "triceps", "fly"] };
const PULL_B: DayTemplate = { name: "Pull B", focus: "Rows · Lats", slots: ["row", "pull", "row2", "curl", "reardelt", "core2"] };
const LEGS_B: DayTemplate = { name: "Legs B", focus: "Posterior chain", slots: ["deadlift", "quad", "lunge", "legext", "calf", "core2"] };

const SPLITS: Record<Prefs["daysPerWeek"], { label: string; days: DayTemplate[]; offsets: number[] }> = {
  2: { label: "Full Body", days: [FULL_A, FULL_B], offsets: [0, 3] },
  3: { label: "Full Body", days: [FULL_A, FULL_B, FULL_C], offsets: [0, 2, 4] },
  4: { label: "Upper / Lower", days: [UPPER_A, LOWER_A, UPPER_B, LOWER_B], offsets: [0, 1, 3, 4] },
  5: { label: "Push / Pull / Legs + Upper / Lower", days: [PUSH_A, PULL_A, LEGS_A, UPPER_B, LOWER_B], offsets: [0, 1, 2, 4, 5] },
  6: { label: "Push / Pull / Legs ×2", days: [PUSH_A, PULL_A, LEGS_A, PUSH_B, PULL_B, LEGS_B], offsets: [0, 1, 2, 3, 4, 5] },
};

// ── Loading parameters by goal ──────────────────────────────────────────────

type Scheme = { sets: number; repMin: number; repMax: number; rest: number };

const SCHEMES: Record<Goal, Record<PlannedExercise["role"], Scheme>> = {
  muscle: {
    main: { sets: 3, repMin: 6, repMax: 10, rest: 120 },
    secondary: { sets: 3, repMin: 8, repMax: 12, rest: 90 },
    accessory: { sets: 3, repMin: 10, repMax: 15, rest: 60 },
  },
  strength: {
    main: { sets: 4, repMin: 3, repMax: 6, rest: 180 },
    secondary: { sets: 3, repMin: 6, repMax: 8, rest: 120 },
    accessory: { sets: 3, repMin: 8, repMax: 12, rest: 90 },
  },
  fat_loss: {
    main: { sets: 3, repMin: 8, repMax: 12, rest: 75 },
    secondary: { sets: 3, repMin: 10, repMax: 15, rest: 60 },
    accessory: { sets: 2, repMin: 12, repMax: 15, rest: 45 },
  },
  general: {
    main: { sets: 3, repMin: 8, repMax: 10, rest: 90 },
    secondary: { sets: 3, repMin: 8, repMax: 12, rest: 75 },
    accessory: { sets: 2, repMin: 10, repMax: 12, rest: 60 },
  },
};

const EXERCISES_BY_MINUTES: Record<Prefs["minutes"], number> = { 30: 4, 45: 5, 60: 6, 75: 6 };

function schemeFor(prefs: Prefs, role: PlannedExercise["role"], exercise: CatalogExercise): Scheme {
  const base = { ...SCHEMES[prefs.goal][role] };

  if (exercise.unit === "secs") {
    // Timed holds and carries: seconds, progress by adding time.
    return { sets: Math.min(base.sets, 3), repMin: 30, repMax: 60, rest: 45 };
  }
  if (exercise.tool === "bodyweight") {
    // No load to add, so progression has to come from reps: widen the range.
    base.repMin = Math.max(base.repMin, 6);
    base.repMax = Math.max(base.repMax, base.repMin + 6);
  }
  if (prefs.experience === "beginner" && role === "main") base.sets = Math.min(base.sets, 3);
  if (prefs.experience === "advanced" && role !== "accessory") base.sets += 1;
  if (prefs.minutes === 75 && role === "accessory") base.sets += 1;
  if (prefs.minutes === 30) base.sets = Math.max(2, base.sets - 1);
  return base;
}

function roleFor(index: number): PlannedExercise["role"] {
  if (index < 2) return "main";
  if (index < 4) return "secondary";
  return "accessory";
}

function buildDay(template: DayTemplate, offset: number, prefs: Prefs): PlannedDay {
  const limit = EXERCISES_BY_MINUTES[prefs.minutes];
  const seen = new Set<string>();
  const exercises: PlannedExercise[] = [];

  const slots: Slot[] = [...template.slots];
  // Fat-loss plans close each session with a short conditioning finisher.
  if (prefs.goal === "fat_loss") slots.splice(Math.max(limit - 1, 0), 0, "finisher");

  for (const slot of slots) {
    if (exercises.length >= limit) break;
    const slug = SLOTS[slot][prefs.equipment];
    if (!slug || seen.has(slug)) continue;
    const exercise = CATALOG_BY_SLUG[slug];
    if (!exercise) continue;
    seen.add(slug);
    const role = roleFor(exercises.length);
    const s = schemeFor(prefs, role, exercise);
    exercises.push({
      slug,
      name: exercise.name,
      role,
      sets: s.sets,
      repMin: s.repMin,
      repMax: s.repMax,
      unit: exercise.unit ?? "reps",
      restSeconds: s.rest,
    });
  }

  return { name: template.name, focus: template.focus, offset, exercises };
}

const ROLE_RANK: Record<PlannedExercise["role"], number> = { main: 0, secondary: 1, accessory: 2 };

/**
 * An exercise that shows up on two days gets one prescription — the one from
 * its most important slot. Otherwise the same lift would alternate between two
 * rep ranges and its progress chart would zig-zag for no real reason.
 */
function unifySchemes(days: PlannedDay[], prefs: Prefs): PlannedDay[] {
  const best = new Map<string, PlannedExercise["role"]>();
  for (const e of days.flatMap((d) => d.exercises)) {
    const current = best.get(e.slug);
    if (!current || ROLE_RANK[e.role] < ROLE_RANK[current]) best.set(e.slug, e.role);
  }
  return days.map((day) => ({
    ...day,
    exercises: day.exercises.map((e) => {
      const role = best.get(e.slug) ?? e.role;
      if (role === e.role) return e;
      const s = schemeFor(prefs, role, CATALOG_BY_SLUG[e.slug]);
      return { ...e, role, sets: s.sets, repMin: s.repMin, repMax: s.repMax, restSeconds: s.rest };
    }),
  }));
}

function estimateMinutes(day: PlannedDay): number {
  const seconds = day.exercises.reduce((sum, e) => {
    const work = e.unit === "secs" ? e.repMax : 40;
    return sum + e.sets * (work + e.restSeconds) + 60; // +60s setup per exercise
  }, 5 * 60); // warm-up
  return Math.round(seconds / 60 / 5) * 5;
}

const BLOCKS: Record<Goal, PlanBlock[]> = {
  muscle: [
    { name: "Foundation", weeks: 4, focus: "Groove the lifts and find your working weights." },
    { name: "Build", weeks: 4, focus: "An extra set on your main lifts — more total work." },
    { name: "Peak", weeks: 4, focus: "Same rep range, heavier weights — your highest-volume weeks." },
  ],
  strength: [
    { name: "Foundation", weeks: 4, focus: "Sharpen technique at moderate loads." },
    { name: "Build", weeks: 4, focus: "More heavy sets on the main lifts." },
    { name: "Peak", weeks: 4, focus: "Low reps, your heaviest weights of the cycle." },
  ],
  fat_loss: [
    { name: "Foundation", weeks: 4, focus: "Set your baseline weights and pace." },
    { name: "Build", weeks: 4, focus: "More work in the same time." },
    { name: "Peak", weeks: 4, focus: "Hold your strength while the scale drops." },
  ],
  general: [
    { name: "Foundation", weeks: 4, focus: "Learn the movements and build the habit." },
    { name: "Build", weeks: 4, focus: "A little more work each session." },
    { name: "Peak", weeks: 4, focus: "Push the weights up on your main lifts." },
  ],
};

export function generatePlan(input: Prefs): Plan {
  const prefs = normalizePrefs(input);
  const split = SPLITS[prefs.daysPerWeek];
  const days = unifySchemes(split.days.map((t, i) => buildDay(t, split.offsets[i], prefs)), prefs);
  const estMinutes = Math.round(days.reduce((s, d) => s + estimateMinutes(d), 0) / days.length / 5) * 5;
  const g = GOALS[prefs.goal];
  const main = SCHEMES[prefs.goal].main;

  const rationale = [
    `${prefs.daysPerWeek} days a week fits a ${split.label} split — every muscle group gets trained ${prefs.daysPerWeek >= 4 ? "twice" : prefs.daysPerWeek === 3 ? "three times" : "twice"} a week.`,
    `For "${g.label.toLowerCase()}" your main lifts sit at ${main.repMin}–${main.repMax} reps with ${Math.round(main.rest / 30) / 2} min rests.`,
    `Progression is double: add reps until you reach the top of the range, then add weight and start again.`,
    `Three 4-week blocks. The last week of each is lighter — stop every set a couple of reps early — so you recover before the next step up.`,
    g.metricWhy,
  ];

  return {
    name: `${g.label} · ${split.label}`,
    split: split.label,
    prefs,
    blocks: BLOCKS[prefs.goal],
    days,
    rationale,
    estMinutes,
  };
}

// ── Week variants (periodisation) ───────────────────────────────────────────

export type WeekInfo = { week: number; block: number; blockName: string; deload: boolean };

export function weekInfo(plan: Plan, week: number): WeekInfo {
  const block = Math.min(Math.floor((week - 1) / BLOCK_WEEKS), plan.blocks.length - 1);
  return { week, block, blockName: plan.blocks[block].name, deload: week % BLOCK_WEEKS === 0 };
}

/** The exact prescription for a given week (1-indexed) of the plan. */
export function weekVariant(plan: Plan, week: number): PlannedDay[] {
  const { block } = weekInfo(plan, week);
  return plan.days.map((day) => ({
    ...day,
    exercises: day.exercises.map((e) => {
      let { sets, repMin, repMax } = e;
      if (e.unit === "reps" && e.role === "main") {
        if (block >= 1) sets = Math.min(sets + 1, 5);
        // Only strength plans trade reps for load in the final block.
        if (block >= 2 && plan.prefs.goal === "strength") {
          const drop = Math.min(2, repMin - 2);
          repMin -= Math.max(drop, 0);
          repMax -= Math.max(drop, 0);
        }
      }
      return { ...e, sets, repMin, repMax };
    }),
  }));
}

export function toPrescribedSets(e: PlannedExercise): PlannedSet[] {
  return Array.from({ length: e.sets }, (_, i) => ({
    setNumber: i + 1,
    weight: null,
    unit: e.unit,
    repMin: e.repMin,
    repMax: e.repMax,
    rpe: null,
    restSeconds: e.restSeconds,
  }));
}

// ── Validation ──────────────────────────────────────────────────────────────

const isOneOf = <T,>(v: unknown, options: readonly T[]): v is T => options.includes(v as T);

/** Coerce untrusted input (form posts, stored JSON) into valid Prefs. */
export function normalizePrefs(input: unknown): Prefs {
  const p = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  const days = Number(p.daysPerWeek);
  const minutes = Number(p.minutes);
  return {
    goal: isOneOf(p.goal, ["muscle", "strength", "fat_loss", "general"] as const) ? p.goal : DEFAULT_PREFS.goal,
    experience: isOneOf(p.experience, ["beginner", "intermediate", "advanced"] as const) ? p.experience : DEFAULT_PREFS.experience,
    daysPerWeek: isOneOf(days, [2, 3, 4, 5, 6] as const) ? days : DEFAULT_PREFS.daysPerWeek,
    equipment: isOneOf(p.equipment, ["gym", "dumbbells", "bodyweight"] as const) ? p.equipment : DEFAULT_PREFS.equipment,
    minutes: isOneOf(minutes, [30, 45, 60, 75] as const) ? minutes : DEFAULT_PREFS.minutes,
  };
}
