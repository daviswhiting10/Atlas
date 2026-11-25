import { describe, expect, it } from "vitest";
import { CATALOG } from "./catalog";
import { generatePlan, weekVariant, planWeeks, type Prefs } from "./generator";
import { generatedDays, isCoreName, isCorePattern, kindFromName, planViolations, widenDown, type CheckedExercise } from "./rules";

const ex = (over: Partial<CheckedExercise>): CheckedExercise => ({ name: "Bench Press", kind: "strength", core: false, unit: "reps", repMin: 8, repMax: 10, ...over });

describe("widenDown", () => {
  it("makes a lone rep count the top of a range two below it", () => {
    expect(widenDown(10, "reps")).toEqual({ repMin: 8, repMax: 10 });
    expect(widenDown(6, "reps")).toEqual({ repMin: 4, repMax: 6 });
    expect(widenDown(15, "reps")).toEqual({ repMin: 13, repMax: 15 });
  });
  it("leaves 5 reps or fewer fixed (strength work, an AMRAP's floor)", () => {
    expect(widenDown(5, "reps")).toBeNull();
    expect(widenDown(1, "reps")).toBeNull();
  });
  it("widens timed work down by 15 s, but not a short hold or a long duration", () => {
    expect(widenDown(45, "secs")).toEqual({ repMin: 30, repMax: 45 });
    expect(widenDown(60, "secs")).toEqual({ repMin: 45, repMax: 60 });
    expect(widenDown(20, "secs")).toBeNull();
    expect(widenDown(600, "secs")).toBeNull();
  });
});

describe("core detection", () => {
  it("counts anti-rotation, rotation and carries; nothing else in the catalog", () => {
    expect(isCorePattern("ANTI_ROTATION")).toBe(true);
    expect(isCorePattern("ROTATION")).toBe(true);
    expect(isCorePattern("CARRY")).toBe(true);
    expect(isCorePattern("LOCOMOTION")).toBe(false);
    expect(isCorePattern("SQUAT")).toBe(false);
  });
  it("reads core work from a name the same way the catalog's patterns do", () => {
    for (const c of CATALOG) expect(isCoreName(c.name), c.name).toBe(isCorePattern(c.pattern));
  });
  it("reads written names: flexion, anti-rotation and loaded carries count", () => {
    for (const n of ["Side Plank", "Dead bug", "Half-kneeling Pallof press", "Bird Dog", "Hanging Leg Raise", "Cable Crunch", "Ab Wheel Rollout", "Suitcase Carry", "Farmer's Walk", "Russian twists", "Copenhagen plank"]) {
      expect(isCoreName(n), n).toBe(true);
    }
    for (const n of ["Back Squat", "Barbell Row", "Calf Raise", "Walking Lunge", "Lat Pulldown", "Hip Thrust"]) expect(isCoreName(n), n).toBe(false);
  });
  it("tells cardio and mobility from strength by name", () => {
    expect(kindFromName("Assault Bike")).toBe("cardio");
    expect(kindFromName("Zone 2 run")).toBe("cardio");
    expect(kindFromName("Rowing")).toBe("cardio");
    expect(kindFromName("Seated Cable Row")).toBe("strength");
    expect(kindFromName("Farmer's Walk")).toBe("strength");
    expect(kindFromName("Hip flexor stretch")).toBe("mobility");
  });
});

describe("planViolations", () => {
  it("lists exercises without a range, unless fixed on purpose or exempt", () => {
    const days = [
      {
        name: "Day 1",
        exercises: [
          ex({ name: "Squat", repMin: 10, repMax: 10 }),
          ex({ name: "Deadlift", repMin: 5, repMax: 5, note: "fixed: 5×5" }),
          ex({ name: "Bike", kind: "cardio", unit: "secs", repMin: 600, repMax: 600 }),
          ex({ name: "Plank", core: true, unit: "secs", repMin: 30, repMax: 45 }),
        ],
      },
    ];
    expect(planViolations(days)).toEqual([{ kind: "no_range", day: "Day 1", exercise: "Squat" }]);
  });
  it("flags a strength workout without core work", () => {
    expect(planViolations([{ name: "Day 2", exercises: [ex({})] }])).toEqual([{ kind: "no_core", day: "Day 2" }]);
  });
  it("counts a loaded carry as the core exercise", () => {
    expect(planViolations([{ name: "Day 2", exercises: [ex({}), ex({ name: "Farmer's Carry", core: true, unit: "secs", repMin: 30, repMax: 45 })] }])).toEqual([]);
  });
  it("exempts a conditioning or cardio-only day, and warm-ups don't make a day strength", () => {
    const cardio = ex({ name: "Run", kind: "cardio", unit: "secs", repMin: 1200, repMax: 1200 });
    expect(planViolations([{ name: "Day 3", exercises: [cardio] }])).toEqual([]);
    expect(planViolations([{ name: "Day 3", exercises: [ex({ name: "Goblet squat", section: "warmup" }), cardio] }])).toEqual([]);
  });
});

const GOALS = ["muscle", "strength", "fat_loss", "general"] as const;
const LEVELS = ["beginner", "intermediate", "advanced"] as const;
const DAYS = [1, 2, 3, 4, 5, 6, 7] as const;
const GEAR = ["gym", "dumbbells", "bodyweight"] as const;
const MINUTES = [30, 45, 60, 75] as const;

describe("the generator follows the rules", () => {
  const every: Prefs[] = GOALS.flatMap((goal) => LEVELS.flatMap((experience) => DAYS.flatMap((daysPerWeek) => GEAR.flatMap((equipment) => MINUTES.map((minutes) => ({ goal, experience, daysPerWeek, equipment, minutes }))))));

  it("every goal, split, level, equipment and length, every week: a range on every exercise, core in every workout", () => {
    for (const prefs of every) {
      const plan = generatePlan(prefs);
      for (let week = 1; week <= planWeeks(plan); week++) {
        expect(planViolations(generatedDays({ days: weekVariant(plan, week) })), JSON.stringify({ ...prefs, week })).toEqual([]);
      }
    }
  });

  it("still holds with conditions, emphasis and a finisher pushing slots out", () => {
    for (const daysPerWeek of DAYS) {
      for (const equipment of GEAR) {
        for (const minutes of MINUTES) {
          const plan = generatePlan({ goal: "fat_loss", experience: "intermediate", daysPerWeek, equipment, minutes, conditions: ["lower_back", "knee", "shoulder", "post_rehab"], goalText: "glutes legs chest back arms" });
          expect(planViolations(generatedDays(plan)), `${daysPerWeek}d ${equipment} ${minutes}min`).toEqual([]);
        }
      }
    }
  });

  it("upper and push days gain a core exercise in place of their last accessory", () => {
    const names = (daysPerWeek: Prefs["daysPerWeek"]) => generatePlan({ goal: "muscle", experience: "intermediate", daysPerWeek, equipment: "gym", minutes: 60 }).days.map((d) => [d.name, d.exercises.map((e) => e.name)] as const);
    const four = Object.fromEntries(names(4));
    expect(four["Upper A"]).toEqual(["Bench Press", "Barbell Row", "Overhead Press", "Lat Pulldown", "Dumbbell Curl", "Pallof Press"]);
    expect(four["Upper B"]).toEqual(["Overhead Press", "Lat Pulldown", "Incline Dumbbell Press", "Seated Cable Row", "Lateral Raise", "Plank"]);
    const six = Object.fromEntries(names(6));
    expect(six["Push"]).toEqual(["Bench Press", "Overhead Press", "Incline Dumbbell Press", "Lateral Raise", "Triceps Pushdown", "Hanging Knee Raise"]);
    expect(six["Push B"]).toEqual(["Overhead Press", "Incline Dumbbell Press", "Bench Press", "Lateral Raise", "Triceps Pushdown", "Plank"]);
  });

  it("a 30-minute day keeps its core exercise in place of the last lift, never a main one", () => {
    const plan = generatePlan({ goal: "muscle", experience: "intermediate", daysPerWeek: 4, equipment: "gym", minutes: 30 });
    for (const d of plan.days) {
      expect(d.exercises).toHaveLength(4);
      expect(d.exercises[3].unit === "secs" || /Pallof|Plank|Knee Raise|Dead Bug/.test(d.exercises[3].name), d.name).toBe(true);
    }
  });
});
