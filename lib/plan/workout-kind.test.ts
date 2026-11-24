import { describe, expect, it } from "vitest";
import { exerciseKind, workoutKind } from "./workout-kind";

describe("an exercise's kind", () => {
  it("conditioning is cardio, mobility is mobility, anything else is strength", () => {
    expect(exerciseKind(["conditioning"])).toBe("cardio");
    expect(exerciseKind(["mobility"])).toBe("mobility");
    expect(exerciseKind(["chest"])).toBe("strength");
    expect(exerciseKind(null)).toBe("strength");
  });
});

describe("a workout's kind: what most of its exercises are", () => {
  const ex = (kind: "strength" | "cardio" | "mobility", section: string | null = "block:1") => ({ kind, section });
  it("all strength is strength; all cardio is cardio; all mobility is mobility", () => {
    expect(workoutKind([ex("strength"), ex("strength")])).toBe("strength");
    expect(workoutKind([ex("cardio")])).toBe("cardio");
    expect(workoutKind([ex("mobility"), ex("mobility")])).toBe("mobility");
  });
  it("the majority wins", () => {
    expect(workoutKind([ex("strength"), ex("cardio"), ex("cardio")])).toBe("cardio");
  });
  it("a tie goes to the first exercise", () => {
    expect(workoutKind([ex("cardio"), ex("strength")])).toBe("cardio");
    expect(workoutKind([ex("mobility"), ex("strength")])).toBe("mobility");
  });
  it("a warm-up or cool-down doesn't decide while there is main work", () => {
    expect(workoutKind([ex("cardio", "warmup"), ex("mobility", "cooldown"), ex("strength")])).toBe("strength");
  });
  it("only warm-up and cool-down: they decide; nothing at all: strength", () => {
    expect(workoutKind([ex("mobility", "warmup")])).toBe("mobility");
    expect(workoutKind([])).toBe("strength");
  });
  it("an exercise with no kind counts as strength", () => {
    expect(workoutKind([{ section: "block:1" }])).toBe("strength");
  });
});
