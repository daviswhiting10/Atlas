/**
 * Plan generator — pure, deterministic, no I/O.
 *
 * Turns an athlete's goal, experience, schedule and equipment into a
 * 12-week periodised program: three 4-week blocks, a lighter week closing each
 * block, and a training split matched to how many days they can train.
 *
 * The goal can be a quick pick or the athlete's own words (see ./goal.ts).
 * Their words can name areas to emphasise and things to work around; a coach
 * can set the same conditions explicitly. All of it lands in one place:
 * which exercise fills each slot, and how many sets and reps it gets.
 *
 * Because it is pure it runs in the browser for the live preview during
 * onboarding and on the server when the plan is persisted — same output both
 * places.
 */

import { CATALOG_BY_SLUG, SLOTS, type CatalogExercise, type Equipment, type Slot } from "./catalog";
import { AREAS, CONDITIONS, interpretGoal, type Area, type Condition } from "./goal";

export type { Area, Condition } from "./goal";

export type Goal = "muscle" | "strength" | "fat_loss" | "general";
export type Experience = "beginner" | "intermediate" | "advanced";
export type FocusMetric = "weight" | "reps" | "e1rm" | "volume";

export type DaysPerWeek = 1 | 2 | 3 | 4 | 5 | 6 | 7;
export const DAYS_PER_WEEK: readonly DaysPerWeek[] = [1, 2, 3, 4, 5, 6, 7];
export const GOAL_TEXT_MAX = 280;

export type Prefs = {
  /** Quick pick. Used as-is when there is no goal text, and as the fallback when the text doesn't name a goal. */
  goal: Goal;
  experience: Experience;
  daysPerWeek: DaysPerWeek;
  equipment: Equipment;
  /** Target session length in minutes. */
  minutes: 30 | 45 | 60 | 75;
  /** The goal in the athlete's own words. Primary input when present. */
  goalText?: string;
  /** Things to work around, set explicitly (by a coach) on top of anything the goal text mentions. */
  conditions?: Condition[];
  /** Areas to emphasise, set explicitly on top of anything the goal text mentions. */
  emphasis?: Area[];
  /** Add a conditioning finisher to each session, set explicitly (the goal text can also ask for it). */
  conditioning?: boolean;
  /**
   * Which 4-week phases the plan runs, in order. Defaults to all three
   * (12 weeks). A coach sets the length of a plan by choosing phases.
   */
  phases?: Phase[];
};

export type Phase = "foundation" | "build" | "peak";
export const PHASES: readonly Phase[] = ["foundation", "build", "peak"];
export const PHASE_LABEL: Record<Phase, string> = { foundation: "Foundation", build: "Build", peak: "Peak" };

/** Prefs after the goal text has been read: what the generator actually builds from. */
export type ResolvedPrefs = Prefs & { conditions: Condition[]; emphasis: Area[]; conditioning: boolean; phases: Phase[]; understood: string[] };

const unique = <T,>(xs: T[]) => Array.from(new Set(xs));

export function resolvePrefs(input: Prefs): ResolvedPrefs {
  const prefs = normalizePrefs(input);
  const read = interpretGoal(prefs.goalText);
  const conditions = unique([...(prefs.conditions ?? []), ...read.conditions]);
  // A protected area is never also an emphasised one.
  const emphasis = unique([...(prefs.emphasis ?? []), ...read.emphasis]).filter((a) => !(a === "shoulders" && conditions.includes("shoulder")));
  return {
    ...prefs,
    goal: read.goal ?? prefs.goal,
    conditions,
    emphasis,
    conditioning: read.conditioning || prefs.conditioning === true,
    phases: prefs.phases && prefs.phases.length > 0 ? prefs.phases : [...PHASES],
    understood: read.understood,
  };
}

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
    metric: "weight",
    metricWhy: "Your charts lead with the weight on the bar. Session volume — the total across all sets — is one tap away.",
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

export type PlanBlock = { name: string; weeks: number; focus: string; phase: Phase };

export type Plan = {
  name: string;
  split: string;
  /** The preferences as built from: goal text already read, conditions and emphasis merged. */
  prefs: ResolvedPrefs;
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

/** The seventh day of a daily schedule: low-fatigue work that helps recovery instead of adding to it. */
const CORE_DAY: DayTemplate = { name: "Conditioning & Core", focus: "Carries · Core · Shoulder health", slots: ["finisher", "core", "core2", "core3", "reardelt", "lateral"] };

const SPLITS: Record<DaysPerWeek, { label: string; frequency: string; days: DayTemplate[]; offsets: number[] }> = {
  1: { label: "Full Body", frequency: "one session covers every major movement, so nothing goes a week untrained", days: [FULL_A], offsets: [0] },
  2: { label: "Full Body", frequency: "every muscle group gets trained twice a week", days: [FULL_A, FULL_B], offsets: [0, 3] },
  3: { label: "Full Body", frequency: "every muscle group gets trained three times a week", days: [FULL_A, FULL_B, FULL_C], offsets: [0, 2, 4] },
  4: { label: "Upper / Lower", frequency: "every muscle group gets trained twice a week", days: [UPPER_A, LOWER_A, UPPER_B, LOWER_B], offsets: [0, 1, 3, 4] },
  5: { label: "Push / Pull / Legs + Upper / Lower", frequency: "every muscle group gets trained twice a week", days: [PUSH_A, PULL_A, LEGS_A, UPPER_B, LOWER_B], offsets: [0, 1, 2, 4, 5] },
  6: { label: "Push / Pull / Legs ×2", frequency: "every muscle group gets trained twice a week", days: [PUSH_A, PULL_A, LEGS_A, PUSH_B, PULL_B, LEGS_B], offsets: [0, 1, 2, 3, 4, 5] },
  7: {
    label: "Push / Pull / Legs ×2 + Conditioning",
    frequency: "every muscle group gets trained twice a week, and the seventh day is light on purpose",
    days: [PUSH_A, PULL_A, LEGS_A, PUSH_B, PULL_B, LEGS_B, CORE_DAY],
    offsets: [0, 1, 2, 3, 4, 5, 6],
  },
};

// ── Exercise selection ──────────────────────────────────────────────────────

/** Slots that train each area. Emphasis adds a set to these and pulls in any the day is missing. */
const AREA_SLOTS: Record<Area, Slot[]> = {
  chest: ["press", "incline", "fly"],
  back: ["row", "pull", "row2"],
  shoulders: ["overhead", "lateral", "reardelt"],
  arms: ["curl", "triceps"],
  legs: ["squat", "quad", "lunge", "legext", "legcurl"],
  glutes: ["glute", "hinge", "lunge"],
  core: ["core", "core2", "core3"],
};

/**
 * What each condition swaps out. A slot maps to another slot (which then
 * resolves for the athlete's equipment) — the day keeps its shape, the risky
 * movement goes.
 */
const CONDITION_SWAPS: Record<Condition, Partial<Record<Slot, Slot>>> = {
  lower_back: { deadlift: "glute", hinge: "legcurl", row: "row2", squat: "quad" },
  knee: { lunge: "glute", legext: "legcurl", quad: "hinge" },
  shoulder: { overhead: "incline", lateral: "reardelt" },
  post_rehab: {},
};

/**
 * Familiarity with lifting changes the tool, not just the volume. Someone new
 * learns the pattern with dumbbells, cables and machines before a barbell;
 * someone experienced gets the harder bodyweight pull.
 */
const BY_EXPERIENCE: Partial<Record<Experience, Partial<Record<Slot, string>>>> = {
  beginner: {
    squat: "goblet-squat",
    deadlift: "stiff-legged-dumbbell-deadlift",
    press: "dumbbell-bench-press",
    overhead: "dumbbell-shoulder-press",
    row: "seated-cable-rows",
  },
  advanced: { pull: "pullups" },
};

/** Gentler versions used when a condition is present and the slot itself stays. */
const GENTLE: Partial<Record<Condition, Partial<Record<Slot, string>>>> = {
  knee: { squat: "goblet-squat" },
  shoulder: { press: "dumbbell-bench-press", triceps: "atlas-triceps-pushdown" },
  lower_back: { quad: "atlas-leg-press" },
};

/** Extra slots tried when a day comes up short (a swap collided, or the equipment has no option). */
const FILL: Slot[] = ["core2", "core", "reardelt", "curl", "calf", "lateral", "triceps", "core3"];

function resolveSlug(slot: Slot, prefs: ResolvedPrefs): string | null {
  let target = slot;
  for (const c of prefs.conditions) target = CONDITION_SWAPS[c][target] ?? target;

  // Experience and "gentle" picks are gym choices; other equipment has one option per slot.
  if (prefs.equipment === "gym") {
    for (const c of prefs.conditions) {
      const gentle = GENTLE[c]?.[target];
      if (gentle) return gentle;
    }
    const level = prefs.conditions.includes("post_rehab") ? "beginner" : prefs.experience;
    const pick = BY_EXPERIENCE[level]?.[target];
    if (pick) return pick;
  }
  return SLOTS[target][prefs.equipment];
}

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

function schemeFor(prefs: ResolvedPrefs, role: PlannedExercise["role"], exercise: CatalogExercise): Scheme {
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
  if (prefs.experience === "beginner" && role === "main") {
    // New lifters practise the movement before loading it: fewer sets, two more reps.
    base.sets = Math.min(base.sets, 3);
    base.repMin += 2;
    base.repMax += 2;
  }
  if (prefs.experience === "advanced" && role !== "accessory") base.sets += 1;
  if (prefs.minutes === 75 && role === "accessory") base.sets += 1;
  if (prefs.minutes === 30) base.sets = Math.max(2, base.sets - 1);
  if (prefs.conditioning && role === "accessory") base.rest = Math.max(30, base.rest - 15);
  if (prefs.conditions.includes("post_rehab")) {
    // Rebuilding tolerance: nothing heavy, nothing extra, a little more rest.
    base.sets = Math.min(base.sets, 3);
    if (base.repMin < 10) {
      base.repMax += 10 - base.repMin;
      base.repMin = 10;
    }
    base.rest += 15;
  }
  return base;
}

/** Does this exercise train an emphasised area? */
function emphasised(slot: Slot, prefs: ResolvedPrefs): boolean {
  return prefs.emphasis.some((area) => AREA_SLOTS[area].includes(slot));
}

function roleFor(index: number): PlannedExercise["role"] {
  if (index < 2) return "main";
  if (index < 4) return "secondary";
  return "accessory";
}

/** Exercises with the slot they came from, before the slot is dropped from the public shape. */
type Slotted = PlannedExercise & { slot: Slot };

type SlottedDay = Omit<PlannedDay, "exercises"> & { exercises: Slotted[] };

function buildDay(template: DayTemplate, offset: number, prefs: ResolvedPrefs): SlottedDay {
  const limit = EXERCISES_BY_MINUTES[prefs.minutes];
  const seen = new Set<string>();
  const exercises: Slotted[] = [];

  const slots: Slot[] = [...template.slots];
  // An emphasised area the day already trains gets its missing slots pulled
  // in early, ahead of the accessories they would otherwise lose out to.
  for (const area of prefs.emphasis) {
    if (!template.slots.some((s) => AREA_SLOTS[area].includes(s))) continue;
    const missing = AREA_SLOTS[area].filter((s) => !slots.includes(s));
    slots.splice(Math.min(3, slots.length), 0, ...missing);
  }
  // Fat-loss plans, and anyone who asked for stamina, close each session with a short finisher.
  if ((prefs.goal === "fat_loss" || prefs.conditioning) && !slots.includes("finisher")) slots.splice(Math.max(limit - 1, 0), 0, "finisher");

  for (const slot of [...slots, ...FILL]) {
    if (exercises.length >= limit) break;
    const slug = resolveSlug(slot, prefs);
    if (!slug || seen.has(slug)) continue;
    const exercise = CATALOG_BY_SLUG[slug];
    if (!exercise) continue;
    seen.add(slug);
    const role = roleFor(exercises.length);
    const s = schemeFor(prefs, role, exercise);
    exercises.push({
      slot,
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
function unifySchemes(days: SlottedDay[], prefs: ResolvedPrefs): SlottedDay[] {
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

const BLOCKS: Record<Goal, Array<Omit<PlanBlock, "phase">>> = {
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
  const prefs = resolvePrefs(input);
  const split = SPLITS[prefs.daysPerWeek];

  const built = unifySchemes(split.days.map((t, i) => buildDay(t, split.offsets[i], prefs)), prefs);
  // Emphasis is applied after schemes are unified, so a lift keeps one
  // prescription across the week and simply gets one more set of it.
  const days: PlannedDay[] = built.map((day) => ({
    ...day,
    exercises: day.exercises.map(({ slot, ...e }) => (e.unit === "reps" && emphasised(slot, prefs) ? { ...e, sets: Math.min(e.sets + 1, 5) } : e)),
  }));

  const estMinutes = Math.round(days.reduce((s, d) => s + estimateMinutes(d), 0) / days.length / 5) * 5;
  const g = GOALS[prefs.goal];
  const main = days[0]?.exercises[0];

  const rationale = [
    ...(prefs.goalText ? [`From your goal — "${prefs.goalText}" — Atlas read: ${prefs.understood.length > 0 ? prefs.understood.join(", ") : `nothing specific, so it used "${g.label.toLowerCase()}"`}.`] : []),
    `${prefs.daysPerWeek === 1 ? "One day" : `${prefs.daysPerWeek} days`} a week fits a ${split.label} split — ${split.frequency}.`,
    ...(main ? [`For "${g.label.toLowerCase()}" your main lifts sit at ${main.repMin}–${main.repMax} reps with ${Math.round(main.restSeconds / 30) / 2} min rests.`] : []),
    ...(prefs.emphasis.length > 0 ? [`Extra work for ${prefs.emphasis.map((a) => AREAS[a]).join(" and ")}: one more set on every lift that trains ${prefs.emphasis.length > 1 ? "them" : "it"}, and more of those lifts on the days that suit.`] : []),
    ...prefs.conditions.map((c) => `${CONDITIONS[c].label}: ${CONDITIONS[c].blurb}`),
    `Progression is double: add reps until you reach the top of the range, then add weight and start again.`,
    `${prefs.phases.length === 1 ? "One 4-week block" : `${["", "One", "Two", "Three"][prefs.phases.length]} 4-week blocks`} (${prefs.phases.map((p) => PHASE_LABEL[p]).join(", ")}). The last week of each is lighter — stop every set a couple of reps early — so you recover before the next step up.`,
    g.metricWhy,
  ];

  return {
    name: [g.label, split.label, ...(prefs.emphasis.length > 0 ? [`${prefs.emphasis.map((a) => AREAS[a]).join(" + ")} focus`] : [])].join(" · "),
    split: split.label,
    prefs,
    blocks: prefs.phases.map((phase) => ({ ...BLOCKS[prefs.goal][PHASES.indexOf(phase)], phase })),
    days,
    rationale,
    estMinutes,
  };
}

// ── Week variants (periodisation) ───────────────────────────────────────────

export type WeekInfo = { week: number; block: number; blockName: string; phase: Phase; deload: boolean };

/** Length of the plan in weeks: four per phase. */
export const planWeeks = (plan: Plan) => plan.blocks.length * BLOCK_WEEKS;

export function weekInfo(plan: Plan, week: number): WeekInfo {
  const block = Math.min(Math.floor((week - 1) / BLOCK_WEEKS), plan.blocks.length - 1);
  return { week, block, blockName: plan.blocks[block].name, phase: plan.blocks[block].phase, deload: week % BLOCK_WEEKS === 0 };
}

/** The exact prescription for a given week (1-indexed) of the plan. */
export function weekVariant(plan: Plan, week: number): PlannedDay[] {
  // Periodisation follows the phase, not the position: a plan that starts at
  // Build gets Build's extra set from week one.
  const { phase } = weekInfo(plan, week);
  return plan.days.map((day) => ({
    ...day,
    exercises: day.exercises.map((e) => {
      let { sets, repMin, repMax } = e;
      if (e.unit === "reps" && e.role === "main") {
        if (phase !== "foundation") sets = Math.min(sets + 1, 5);
        // Only strength plans trade reps for load in the Peak phase — and never after rehab.
        if (phase === "peak" && plan.prefs.goal === "strength" && !plan.prefs.conditions.includes("post_rehab")) {
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

const AREA_KEYS = Object.keys(AREAS) as Area[];
const CONDITION_KEYS = Object.keys(CONDITIONS) as Condition[];

/** Coerce untrusted input (form posts, stored JSON) into valid Prefs. */
export function normalizePrefs(input: unknown): Prefs {
  const p = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  const days = Number(p.daysPerWeek);
  const minutes = Number(p.minutes);
  const goalText = typeof p.goalText === "string" ? p.goalText.replace(/\s+/g, " ").trim().slice(0, GOAL_TEXT_MAX) : "";
  const conditions = Array.isArray(p.conditions) ? unique(p.conditions.filter((c): c is Condition => isOneOf(c, CONDITION_KEYS))) : [];
  const emphasis = Array.isArray(p.emphasis) ? unique(p.emphasis.filter((a): a is Area => isOneOf(a, AREA_KEYS))) : [];
  // Phases keep their natural order whatever order they arrive in.
  const askedPhases: unknown[] = Array.isArray(p.phases) ? p.phases : [];
  const phases = PHASES.filter((ph) => askedPhases.includes(ph));
  return {
    goal: isOneOf(p.goal, ["muscle", "strength", "fat_loss", "general"] as const) ? p.goal : DEFAULT_PREFS.goal,
    experience: isOneOf(p.experience, ["beginner", "intermediate", "advanced"] as const) ? p.experience : DEFAULT_PREFS.experience,
    daysPerWeek: isOneOf(days, DAYS_PER_WEEK) ? days : DEFAULT_PREFS.daysPerWeek,
    equipment: isOneOf(p.equipment, ["gym", "dumbbells", "bodyweight"] as const) ? p.equipment : DEFAULT_PREFS.equipment,
    minutes: isOneOf(minutes, [30, 45, 60, 75] as const) ? minutes : DEFAULT_PREFS.minutes,
    // Optional fields are left off entirely when empty, so stored prefs stay small and comparable.
    ...(goalText && { goalText }),
    ...(conditions.length > 0 && { conditions }),
    ...(emphasis.length > 0 && { emphasis }),
    ...(p.conditioning === true && { conditioning: true }),
    ...(phases.length > 0 && phases.length < PHASES.length && { phases }),
  };
}

/**
 * The coach's goal and condition tags (the pills in the program editor, and
 * the tags stored on hand-built programs) expressed as generator inputs.
 */
export const COACH_GOALS: Record<string, { goal: Goal; conditioning?: boolean; conditions?: Condition[] }> = {
  "Weight Loss": { goal: "fat_loss" },
  Hypertrophy: { goal: "muscle" },
  Strength: { goal: "strength" },
  Endurance: { goal: "general", conditioning: true },
  "Athletic Performance": { goal: "strength", conditioning: true },
  "General Fitness": { goal: "general" },
  Corrective: { goal: "general", conditions: ["post_rehab"] },
};

export const COACH_MODIFIERS: Record<string, Partial<Pick<Prefs, "experience" | "equipment">> & { condition?: Condition }> = {
  "Lower Back Safe": { condition: "lower_back" },
  "Knee Pain": { condition: "knee" },
  "Shoulder Restrictions": { condition: "shoulder" },
  "Post-Rehab": { condition: "post_rehab" },
  Beginner: { experience: "beginner" },
  "No Equipment": { equipment: "bodyweight" },
};

/** Fold coach goal pills and modifier pills into generator preferences. The first goal pill decides the goal. */
export function prefsFromCoachTags(base: Prefs, tags: { goals?: string[]; conditions?: string[] }): Prefs {
  const goals = (tags.goals ?? []).map((g) => COACH_GOALS[g]).filter(Boolean);
  const mods = (tags.conditions ?? []).map((c) => COACH_MODIFIERS[c]).filter(Boolean);
  const conditions = unique([...(base.conditions ?? []), ...goals.flatMap((g) => g.conditions ?? []), ...mods.flatMap((m) => (m.condition ? [m.condition] : []))]);
  return normalizePrefs({
    ...base,
    ...(goals[0] && { goal: goals[0].goal }),
    ...(goals.some((g) => g.conditioning) && { conditioning: true }),
    ...Object.assign({}, ...mods.map((m) => ({ ...(m.experience && { experience: m.experience }), ...(m.equipment && { equipment: m.equipment }) }))),
    conditions,
  });
}
