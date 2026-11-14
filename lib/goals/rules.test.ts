import { describe, expect, it } from "vitest";
import { GoalRules, addCheckInRule, keyForLabel, removeRule, ruleActiveOn } from "./rules";
import { SEVENTY_FIVE_HARD, templateByKey } from "./templates";

const small = () =>
  GoalRules.parse({
    length: { days: 5 },
    onMiss: "reset",
    rules: [{ key: "workout", label: "Workout", kind: "sessions", per: "day", min: 1 }],
  });

describe("75 Hard template", () => {
  it("is valid and has the rules we agreed", () => {
    expect(GoalRules.safeParse(SEVENTY_FIVE_HARD.rules).success).toBe(true);
    expect(SEVENTY_FIVE_HARD.rules.length.days).toBe(75);
    expect(SEVENTY_FIVE_HARD.rules.rules.map((r) => r.key)).toEqual(["workouts", "outdoors", "water", "reading", "diet", "photo"]);
    // The outdoor workout is one of the two 45-minute workouts.
    const outdoors = SEVENTY_FIVE_HARD.rules.rules.find((r) => r.key === "outdoors");
    expect(outdoors).toMatchObject({ kind: "sessions", min: 1, where: { minMinutes: 45, mark: "outdoors" } });
  });

  it("can be found by key", () => {
    expect(templateByKey("builtin:75hard")?.name).toBe("75 Hard");
    expect(templateByKey("nope")).toBeNull();
  });
});

describe("GoalRules", () => {
  it("refuses duplicate keys, backwards spans and unknown kinds", () => {
    const r = small().rules[0];
    expect(GoalRules.safeParse({ ...small(), rules: [r, r] }).success).toBe(false);
    expect(GoalRules.safeParse({ ...small(), rules: [{ ...r, fromDay: "2026-01-05", toDay: "2026-01-02" }] }).success).toBe(false);
    expect(GoalRules.safeParse({ ...small(), rules: [{ key: "x", label: "X", kind: "lift_target" }] }).success).toBe(false);
    expect(GoalRules.safeParse({ ...small(), onMiss: "count" }).success).toBe(false);
  });

  it("knows when a rule is in force", () => {
    expect(ruleActiveOn({}, "2026-01-01")).toBe(true);
    expect(ruleActiveOn({ fromDay: "2026-01-03" }, "2026-01-02")).toBe(false);
    expect(ruleActiveOn({ fromDay: "2026-01-03" }, "2026-01-03")).toBe(true);
    expect(ruleActiveOn({ toDay: "2026-01-03" }, "2026-01-03")).toBe(true);
    expect(ruleActiveOn({ toDay: "2026-01-03" }, "2026-01-04")).toBe(false);
  });
});

describe("editing rules mid-run", () => {
  it("an added rule counts from today", () => {
    const next = addCheckInRule(small(), "  No alcohol ", "2026-01-03");
    expect(next.rules.at(-1)).toMatchObject({ key: "no_alcohol", label: "No alcohol", kind: "check_in", fromDay: "2026-01-03" });
  });

  it("keeps keys unique", () => {
    expect(keyForLabel("Workout", ["workout"])).toBe("workout_2");
    expect(keyForLabel("!!!", [])).toBe("rule");
    const twice = addCheckInRule(addCheckInRule(small(), "Stretch", "2026-01-03"), "Stretch", "2026-01-04");
    expect(twice.rules.map((r) => r.key)).toEqual(["workout", "stretch", "stretch_2"]);
  });

  it("a removed rule stops counting after today and is kept", () => {
    const withTwo = addCheckInRule(small(), "Reading", "2026-01-01");
    const next = removeRule(withTwo, "reading", "2026-01-03");
    expect(next.rules.find((r) => r.key === "reading")).toMatchObject({ toDay: "2026-01-03" });
    expect(ruleActiveOn(next.rules[1], "2026-01-03")).toBe(true);
    expect(ruleActiveOn(next.rules[1], "2026-01-04")).toBe(false);
  });

  it("a rule added and removed on the same day never judged anything, so it goes", () => {
    const next = removeRule(addCheckInRule(small(), "Reading", "2026-01-03"), "reading", "2026-01-03");
    expect(next.rules.map((r) => r.key)).toEqual(["workout"]);
  });

  it("won't remove the last rule or one that doesn't exist", () => {
    expect(() => removeRule(small(), "workout", "2026-01-03")).toThrow(/at least one rule/);
    expect(() => removeRule(small(), "ghost", "2026-01-03")).toThrow(/No such rule/);
  });
});
