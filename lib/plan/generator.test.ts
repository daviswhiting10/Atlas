import { describe, expect, it } from "vitest";
import { CATALOG_BY_SLUG, SLOTS } from "./catalog";
import { DEFAULT_PREFS, TOTAL_WEEKS, generatePlan, normalizePrefs, prefsFromCoachTags, resolvePrefs, weekInfo, weekVariant, type Prefs } from "./generator";
import { interpretGoal } from "./goal";

const GOALS = ["muscle", "strength", "fat_loss", "general"] as const;
const LEVELS = ["beginner", "intermediate", "advanced"] as const;
const DAYS = [1, 2, 3, 4, 5, 6, 7] as const;
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
    expect(everyCombination).toHaveLength(1008); // 4 goals × 3 levels × 7 day counts × 3 equipment × 4 lengths
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

  it("offers one to seven days, each with its own split and spacing", () => {
    for (const daysPerWeek of DAYS) {
      const plan = generatePlan({ ...DEFAULT_PREFS, daysPerWeek });
      expect(plan.days).toHaveLength(daysPerWeek);
      const offsets = plan.days.map((d) => d.offset);
      expect(new Set(offsets).size, `${daysPerWeek} days`).toBe(daysPerWeek); // no two workouts on one day
      expect(Math.max(...offsets)).toBeLessThan(7);
      expect([...offsets].sort((a, b) => a - b)).toEqual(offsets); // in order through the week
    }
    expect(generatePlan({ ...DEFAULT_PREFS, daysPerWeek: 1 }).split).toBe("Full Body");
    expect(generatePlan({ ...DEFAULT_PREFS, daysPerWeek: 7 }).days[6].name).toBe("Conditioning & Core");
  });

  it("makes the seventh day lighter than the lifting days", () => {
    const plan = generatePlan({ ...DEFAULT_PREFS, daysPerWeek: 7 });
    const seventh = plan.days[6].exercises.map((e) => e.slug);
    for (const heavy of ["barbell-squat", "barbell-deadlift", "barbell-bench-press-medium-grip"]) expect(seventh).not.toContain(heavy);
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
    expect(normalizePrefs({ daysPerWeek: 0 }).daysPerWeek).toBe(DEFAULT_PREFS.daysPerWeek);
    expect(normalizePrefs({ daysPerWeek: 8 }).daysPerWeek).toBe(DEFAULT_PREFS.daysPerWeek);
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

describe("normalizePrefs — goal text, conditions, emphasis", () => {
  it("keeps the athlete's words, tidied and bounded", () => {
    expect(normalizePrefs({ goalText: "  bigger   glutes\n please " }).goalText).toBe("bigger glutes please");
    expect(normalizePrefs({ goalText: "x".repeat(900) }).goalText).toHaveLength(280);
    expect(normalizePrefs({ goalText: 42 })).toEqual(DEFAULT_PREFS);
  });

  it("drops unknown conditions and areas, and leaves empty lists off", () => {
    expect(normalizePrefs({ conditions: ["knee", "elbow", "knee"], emphasis: ["glutes", "toes"] })).toMatchObject({ conditions: ["knee"], emphasis: ["glutes"] });
    expect(normalizePrefs({ conditions: [], emphasis: "legs" })).toEqual(DEFAULT_PREFS);
  });
});

describe("interpretGoal", () => {
  it("reads the training goal from plain words", () => {
    expect(interpretGoal("I want to get stronger and bench 225").goal).toBe("strength");
    expect(interpretGoal("lose 20 pounds before the wedding").goal).toBe("fat_loss");
    expect(interpretGoal("put on size, I'm too skinny").goal).toBe("muscle");
    expect(interpretGoal("just stay healthy and active").goal).toBe("general");
  });

  it("leaves the goal to the quick pick when the text doesn't say", () => {
    expect(interpretGoal("for my daughter").goal).toBeNull();
    expect(interpretGoal("").goal).toBeNull();
    expect(interpretGoal(undefined)).toMatchObject({ goal: null, emphasis: [], conditions: [] });
  });

  it("finds the areas to emphasise", () => {
    expect(interpretGoal("bigger glutes and stronger legs").emphasis).toEqual(["glutes", "legs"]);
    expect(interpretGoal("I want my first pull-up").emphasis).toEqual(["back"]);
    expect(interpretGoal("visible abs and bigger arms").emphasis).toEqual(["arms", "core"]);
  });

  it("treats a body part named with pain as something to protect, not to build", () => {
    const r = interpretGoal("build muscle but my lower back hurts and I have bad knees");
    expect(r.conditions).toEqual(["lower_back", "knee"]);
    expect(r.emphasis).not.toContain("back");
    expect(r.emphasis).not.toContain("legs");
  });

  it("does not mistake 'coming back' for the back", () => {
    const r = interpretGoal("coming back from shoulder surgery, want to get back to lifting");
    expect(r.emphasis).not.toContain("back");
    expect(r.conditions).toEqual(expect.arrayContaining(["shoulder", "post_rehab"]));
  });

  it("reads surgery and a return to training as post-rehab", () => {
    expect(interpretGoal("get back into lifting after shoulder surgery").conditions).toEqual(expect.arrayContaining(["shoulder", "post_rehab"]));
  });

  it("notices a wish for stamina", () => {
    expect(interpretGoal("get fit for soccer season").conditioning).toBe(true);
    expect(interpretGoal("bench 225").conditioning).toBe(false);
  });

  it("says back what it understood", () => {
    expect(interpretGoal("bigger glutes, bad knees").understood).toEqual(["building muscle", "extra work for glutes", "knee pain"]);
  });
});

describe("a goal in the athlete's own words shapes the plan", () => {
  const base: Prefs = { ...DEFAULT_PREFS, daysPerWeek: 4 };
  const slugs = (p: Prefs) => generatePlan(p).days.map((d) => d.exercises.map((e) => e.slug));
  const all = (p: Prefs) => generatePlan(p).days.flatMap((d) => d.exercises);

  it("lets the text decide the goal over the quick pick", () => {
    const plan = generatePlan({ ...base, goal: "muscle", goalText: "I want to get as strong as possible" });
    expect(plan.prefs.goal).toBe("strength");
    expect(plan.name).toContain("Get stronger");
    expect(plan.days[0].exercises[0].repMax).toBeLessThanOrEqual(6);
  });

  it("falls back to the quick pick when the text names no goal", () => {
    expect(generatePlan({ ...base, goal: "fat_loss", goalText: "for my wedding in June" }).prefs.goal).toBe("fat_loss");
  });

  it("produces visibly different plans for goals that mean different things", () => {
    const texts = ["bigger glutes and legs", "bench 225 and get stronger", "lose fat, my knees are bad", "stay healthy, keep up with my kids playing soccer"];
    const plans = texts.map((goalText) => JSON.stringify(slugs({ ...base, goalText })) + generatePlan({ ...base, goalText }).name);
    expect(new Set(plans).size).toBe(texts.length);
  });

  it("gives an emphasised area more lifts and one more set on each", () => {
    const plain = all(base);
    const glutes = all({ ...base, goalText: "bigger glutes" });
    const thrusts = (xs: typeof plain) => xs.filter((e) => e.slug === "barbell-hip-thrust");
    expect(thrusts(glutes).length).toBeGreaterThan(thrusts(plain).length);
    expect(thrusts(glutes)[0].sets).toBe(thrusts(plain)[0].sets + 1);
    expect(generatePlan({ ...base, goalText: "bigger glutes" }).name).toContain("glutes focus");
  });

  it("explains what it read from the goal", () => {
    const plan = generatePlan({ ...base, goalText: "bigger glutes, bad knees" });
    expect(plan.rationale[0]).toContain("bigger glutes, bad knees");
    expect(plan.rationale.join(" ")).toContain("Knee pain");
  });

  it("is deterministic for the same words", () => {
    const p = { ...base, goalText: "bigger glutes, bad knees" };
    expect(generatePlan(p)).toEqual(generatePlan(p));
  });
});

describe("conditions change which exercises are chosen", () => {
  const gym: Prefs = { ...DEFAULT_PREFS, daysPerWeek: 4 };
  const slugs = (p: Prefs) => generatePlan(p).days.flatMap((d) => d.exercises.map((e) => e.slug));

  it("lower back: no deadlifts or bent-over rows", () => {
    const s = slugs({ ...gym, conditions: ["lower_back"] });
    for (const out of ["barbell-deadlift", "romanian-deadlift", "bent-over-barbell-row", "barbell-squat"]) expect(s).not.toContain(out);
    expect(s).toContain("barbell-hip-thrust");
    expect(s).toContain("seated-cable-rows");
  });

  it("knee: no lunges or leg extensions, and a lighter squat", () => {
    const s = slugs({ ...gym, conditions: ["knee"] });
    for (const out of ["dumbbell-lunges", "atlas-leg-extension", "barbell-squat"]) expect(s).not.toContain(out);
    expect(s).toContain("goblet-squat");
  });

  it("shoulder: nothing pressed overhead", () => {
    const s = slugs({ ...gym, conditions: ["shoulder"] });
    for (const out of ["standing-military-press", "dumbbell-shoulder-press", "side-lateral-raise"]) expect(s).not.toContain(out);
  });

  it("post-rehab: no set of fewer than ten reps, no more than three sets, even in the last block", () => {
    const plan = generatePlan({ ...gym, goal: "strength", conditions: ["post_rehab"] });
    for (const week of [1, 5, 9]) {
      for (const e of weekVariant(plan, week).flatMap((d) => d.exercises)) {
        if (e.unit !== "reps") continue;
        expect(e.repMin, `${e.slug} week ${week}`).toBeGreaterThanOrEqual(10);
      }
    }
    for (const e of plan.days.flatMap((d) => d.exercises)) expect(e.sets).toBeLessThanOrEqual(3);
  });

  it("a condition named in the goal text has the same effect as one set explicitly", () => {
    expect(slugs({ ...gym, goalText: "build muscle, my knees hurt" })).toEqual(slugs({ ...gym, goalText: "build muscle", conditions: ["knee"] }));
    expect(resolvePrefs({ ...gym, goalText: "my knees hurt", conditions: ["knee"] }).conditions).toEqual(["knee"]);
  });

  it("still fills every day, whatever is swapped out", () => {
    for (const daysPerWeek of DAYS) {
      for (const equipment of GEAR) {
        const plan = generatePlan({ ...DEFAULT_PREFS, daysPerWeek, equipment, conditions: ["lower_back", "knee", "shoulder", "post_rehab"], goalText: "glutes legs chest back arms core" });
        for (const day of plan.days) {
          expect(day.exercises.length, `${daysPerWeek}d ${equipment} ${day.name}`).toBeGreaterThanOrEqual(3);
          expect(new Set(day.exercises.map((e) => e.slug)).size).toBe(day.exercises.length);
        }
      }
    }
  });
});

describe("experience changes the tools, not just the volume", () => {
  const first = (experience: Prefs["experience"]) => generatePlan({ ...DEFAULT_PREFS, experience, daysPerWeek: 3 });

  it("starts a new lifter on dumbbells and cables in place of the barbell", () => {
    const s = first("beginner").days.flatMap((d) => d.exercises.map((e) => e.slug));
    expect(s).toContain("goblet-squat");
    expect(s).not.toContain("barbell-squat");
    expect(s).not.toContain("barbell-deadlift");
  });

  it("gives an experienced lifter the harder pull", () => {
    const s = first("advanced").days.flatMap((d) => d.exercises.map((e) => e.slug));
    expect(s).toContain("pullups");
  });

  it("has a new lifter practise for more reps and an experienced one do more sets", () => {
    const b = first("beginner").days[0].exercises[0];
    const i = first("intermediate").days[0].exercises[0];
    const a = first("advanced").days[0].exercises[0];
    expect(b.repMin).toBeGreaterThan(i.repMin);
    expect(a.sets).toBeGreaterThan(i.sets);
  });
});

describe("phases set the length of a plan", () => {
  it("runs all three phases by default", () => {
    const plan = generatePlan(DEFAULT_PREFS);
    expect(plan.blocks.map((b) => b.phase)).toEqual(["foundation", "build", "peak"]);
  });

  it("can run fewer phases, in their natural order", () => {
    const plan = generatePlan({ ...DEFAULT_PREFS, phases: ["peak", "build"] });
    expect(plan.blocks.map((b) => b.name)).toEqual(["Build", "Peak"]);
    expect(normalizePrefs({ phases: ["peak", "nonsense", "build"] }).phases).toEqual(["build", "peak"]);
    expect(normalizePrefs({ phases: ["foundation", "build", "peak"] }).phases).toBeUndefined(); // the default is not stored
  });

  it("periodises by phase, not by position: a Build-first plan gets Build's extra set in week one", () => {
    const full = generatePlan({ ...DEFAULT_PREFS });
    const buildFirst = generatePlan({ ...DEFAULT_PREFS, phases: ["build", "peak"] });
    expect(weekVariant(buildFirst, 1)[0].exercises[0].sets).toBe(weekVariant(full, 5)[0].exercises[0].sets);
  });
});

describe("the coach's goal and condition pills feed the generator", () => {
  it("maps goal pills to a goal", () => {
    expect(prefsFromCoachTags(DEFAULT_PREFS, { goals: ["Strength"] }).goal).toBe("strength");
    expect(prefsFromCoachTags(DEFAULT_PREFS, { goals: ["Weight Loss", "Strength"] }).goal).toBe("fat_loss"); // first pill decides
    expect(prefsFromCoachTags(DEFAULT_PREFS, { goals: ["Endurance"] })).toMatchObject({ goal: "general", conditioning: true });
    expect(prefsFromCoachTags(DEFAULT_PREFS, { goals: ["Corrective"] }).conditions).toEqual(["post_rehab"]);
  });

  it("maps modifier pills to conditions, experience and equipment", () => {
    const p = prefsFromCoachTags(DEFAULT_PREFS, { conditions: ["Lower Back Safe", "Knee Pain", "Beginner", "No Equipment", "Made up"] });
    expect(p).toMatchObject({ conditions: ["lower_back", "knee"], experience: "beginner", equipment: "bodyweight" });
  });

  it("changes the exercises chosen", () => {
    const plain = generatePlan({ ...DEFAULT_PREFS }).days.flatMap((d) => d.exercises.map((e) => e.slug));
    const safe = generatePlan(prefsFromCoachTags(DEFAULT_PREFS, { conditions: ["Lower Back Safe"] })).days.flatMap((d) => d.exercises.map((e) => e.slug));
    expect(plain).toContain("barbell-deadlift");
    expect(safe).not.toContain("barbell-deadlift");
  });

  it("adds a conditioning finisher when asked", () => {
    const slugs = generatePlan({ ...DEFAULT_PREFS, conditioning: true }).days.flatMap((d) => d.exercises.map((e) => e.slug));
    expect(slugs).toContain("farmer-s-walk");
  });
});
