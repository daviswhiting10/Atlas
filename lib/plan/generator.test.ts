import { describe, expect, it } from "vitest";
import { CATALOG_BY_SLUG, SLOTS } from "./catalog";
import { DEFAULT_PREFS, TOTAL_WEEKS, generatePlan, normalizePrefs, weekInfo, weekVariant, type Prefs } from "./generator";

const GOALS = ["muscle", "strength", "fat_loss", "general"] as const;
const LEVELS = ["beginner", "intermediate", "advanced"] as const;
const DAYS = [2, 3, 4, 5, 6] as const;
const GEAR = ["gym", "dumbbells", "bodyweight"] as const;
const MINUTES = [30, 45, 60, 75] as const;

const everyCombination: Prefs[] = GOALS.flatMap((goal) =>
  LEVELS.flatMap((experience) =>
    DAYS.flatMap((daysPerWeek) => GEAR.flatMap((equipment) => MINUTES.map((minutes) => ({ goal, experience, daysPerWeek, equipment, minutes }))))
  )
);

describe("catalog", () => {
  it("every slot points at an exercise that exists", () => {
    for (const options of Object.values(SLOTS)) {
      for (const slug of Object.values(options)) {
        if (slug) expect(CATALOG_BY_SLUG[slug], slug).toBeDefined();
      }
    }
  });
});

describe("generatePlan", () => {
  it("produces a valid plan for every combination of answers", () => {
    expect(everyCombination).toHaveLength(720);
    for (const prefs of everyCombination) {
      const plan = generatePlan(prefs);
      expect(plan.days).toHaveLength(prefs.daysPerWeek);
      for (const day of plan.days) {
        expect(day.exercises.length).toBeGreaterThanOrEqual(3);
        expect(new Set(day.exercises.map((e) => e.slug)).size).toBe(day.exercises.length);
        for (const e of day.exercises) {
          expect(e.sets).toBeGreaterThanOrEqual(2);
          expect(e.repMin).toBeGreaterThan(0);
          expect(e.repMin).toBeLessThanOrEqual(e.repMax);
        }
      }
    }
  });

  it("only uses exercises the athlete has equipment for", () => {
    const plan = generatePlan({ ...DEFAULT_PREFS, equipment: "bodyweight", daysPerWeek: 6 });
    for (const e of plan.days.flatMap((d) => d.exercises)) {
      expect(CATALOG_BY_SLUG[e.slug].tool).toBe("bodyweight");
    }
  });

  it("is deterministic", () => {
    expect(generatePlan(DEFAULT_PREFS)).toEqual(generatePlan(DEFAULT_PREFS));
  });

  it("gives strength plans heavier, lower-rep main lifts than muscle plans", () => {
    const strength = generatePlan({ ...DEFAULT_PREFS, goal: "strength" }).days[0].exercises[0];
    const muscle = generatePlan({ ...DEFAULT_PREFS, goal: "muscle" }).days[0].exercises[0];
    expect(strength.repMax).toBeLessThan(muscle.repMax);
    expect(strength.restSeconds).toBeGreaterThan(muscle.restSeconds);
  });

  it("prescribes an exercise the same way on every day it appears", () => {
    for (const prefs of everyCombination) {
      const seen = new Map<string, string>();
      for (const e of generatePlan(prefs).days.flatMap((d) => d.exercises)) {
        const rx = `${e.sets}x${e.repMin}-${e.repMax}`;
        expect(seen.get(e.slug) ?? rx).toBe(rx);
        seen.set(e.slug, rx);
      }
    }
  });

  it("fits shorter sessions with fewer exercises", () => {
    const short = generatePlan({ ...DEFAULT_PREFS, minutes: 30 });
    const long = generatePlan({ ...DEFAULT_PREFS, minutes: 75 });
    expect(short.days[0].exercises.length).toBeLessThan(long.days[0].exercises.length);
    expect(short.estMinutes).toBeLessThan(long.estMinutes);
  });
});

describe("periodisation", () => {
  const plan = generatePlan(DEFAULT_PREFS);

  it("splits 12 weeks into three blocks with a lighter week closing each", () => {
    expect(TOTAL_WEEKS).toBe(12);
    expect(weekInfo(plan, 1)).toMatchObject({ block: 0, deload: false });
    expect(weekInfo(plan, 4)).toMatchObject({ block: 0, deload: true });
    expect(weekInfo(plan, 5)).toMatchObject({ block: 1, deload: false });
    expect(weekInfo(plan, 12)).toMatchObject({ block: 2, deload: true });
  });

  it("adds a set to main lifts from the second block", () => {
    const first = weekVariant(plan, 1)[0].exercises[0];
    const second = weekVariant(plan, 5)[0].exercises[0];
    expect(second.sets).toBe(first.sets + 1);
  });

  it("drops the rep range in the final block for strength plans only", () => {
    const strength = generatePlan({ ...DEFAULT_PREFS, goal: "strength" });
    expect(weekVariant(strength, 9)[0].exercises[0].repMax).toBeLessThan(weekVariant(strength, 1)[0].exercises[0].repMax);
    expect(weekVariant(plan, 9)[0].exercises[0].repMax).toBe(weekVariant(plan, 1)[0].exercises[0].repMax);
  });
});

describe("normalizePrefs", () => {
  it("falls back to defaults for junk input", () => {
    expect(normalizePrefs(null)).toEqual(DEFAULT_PREFS);
    expect(normalizePrefs({ goal: "fly", daysPerWeek: 99, minutes: "soon" })).toEqual(DEFAULT_PREFS);
  });

  it("keeps valid answers, including numbers sent as strings", () => {
    expect(normalizePrefs({ goal: "strength", daysPerWeek: "3", equipment: "dumbbells", minutes: 45, experience: "beginner" })).toEqual({
      goal: "strength",
      experience: "beginner",
      daysPerWeek: 3,
      equipment: "dumbbells",
      minutes: 45,
    });
  });
});
