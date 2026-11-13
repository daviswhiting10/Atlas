import { describe, expect, it } from "vitest";
import { hasBlockLabel, nameKey } from "./names";

describe("nameKey", () => {
  it("treats shorthand, labels, plurals and hyphens as the same name", () => {
    const k = nameKey("Dumbbell Romanian Deadlift");
    expect(nameKey("db rdl")).toBe(k);
    expect(nameKey("2A Dumbbell Romanian Deadlift")).toBe(k);
    expect(nameKey("DB romanian deadlifts")).toBe(k);
    expect(nameKey("Push-Ups")).toBe(nameKey("push up"));
    expect(nameKey("Pullups")).toBe(nameKey("Pull-Up"));
    expect(nameKey("sl rdl")).toBe(nameKey("Single-Leg RDL"));
    expect(nameKey("Farmer's Walk")).toBe(nameKey("farmers walk"));
    expect(nameKey("Glue bridge")).toBe(nameKey("Glute Bridge"));
    expect(nameKey("hexbar deadlift")).toBe(nameKey("Trap Bar Deadlift"));
    expect(nameKey("1 arm row")).toBe(nameKey("One-Arm Row"));
  });

  it("keeps different exercises apart", () => {
    expect(nameKey("Single Leg Glute Bridge")).not.toBe(nameKey("Glute Bridge"));
    expect(nameKey("Half kneeling palloff press")).not.toBe(nameKey("Pallof Press"));
    expect(nameKey("glute bridge iso")).not.toBe(nameKey("Glute bridge"));
    expect(nameKey("Romanian Deadlift")).not.toBe(nameKey("Dumbbell Romanian Deadlift"));
  });

  it("spots block labels", () => {
    expect(hasBlockLabel("3A One-Arm Dumbbell Row")).toBe(true);
    expect(hasBlockLabel("90/90 stretch")).toBe(false);
    expect(hasBlockLabel("Squat")).toBe(false);
  });
});
