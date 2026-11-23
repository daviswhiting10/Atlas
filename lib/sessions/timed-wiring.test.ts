import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (p: string) => readFileSync(new URL(`../../${p}`, import.meta.url), "utf8");
const logger = read("components/athlete/WorkoutLogger.tsx");
const data = read("lib/athlete/data.ts");
const editor = read("components/athlete/TargetEditor.tsx");

describe("a timed set in the athlete logger", () => {
  it("is one min:sec field, not a count of seconds", () => {
    expect(logger).toContain("<DurationStepper");
    expect(logger).toContain("durationRange(ex.repMin, ex.repMax)");
    expect(logger).not.toContain("seconds`}"); // the old 'Set N seconds' stepper label is gone
  });
  it("a bare typed number is minutes for steady cardio and seconds otherwise", () => {
    expect(logger).toContain('bare={ex.timedKind === "steady" ? "min" : "sec"}');
  });
  it("has no weight field when the exercise has no load", () => {
    expect(data).toContain("timedHasLoad(");
    expect(data).toContain("loaded: !bodyweight && hasLoad");
  });
  it("the helper line comes from the exercise type", () => {
    expect(data).toContain("timedKind(e.exercise.name, e.notes)");
    expect(data).toContain('timed: kind ?? "hold"');
  });
  it("the target editor takes a time, so a 15 minute target can be set", () => {
    expect(editor).toContain("<TimeField");
  });
  it("stays quiet: the time field has no transition and no toast", () => {
    const stepper = read("components/athlete/DurationStepper.tsx");
    expect(stepper).not.toMatch(/toast|transition|animate/);
  });
});
