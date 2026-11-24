import { describe, expect, it } from "vitest";
import { isTimedSet, loggedVolume, setVolume, timedRx, volumeOf } from "./volume";

describe("weight lifted", () => {
  it("weight × reps over completed, loaded sets (moved from sessionVolume and the wrap-up's volumeOf)", () => {
    expect(volumeOf([])).toBe(0);
    expect(volumeOf([{ weight: 100, reps: 10, completed: true }, { weight: 120, reps: 8, completed: true }, { weight: null, reps: 10, completed: true }])).toBe(1960);
    expect(volumeOf([{ weight: 100, reps: 10, completed: false }])).toBe(0);
    expect(volumeOf([{ weight: 0, reps: 10 }, { weight: 100, reps: null }])).toBe(0);
  });

  it("a carry or a plank never adds weight × seconds", () => {
    expect(setVolume({ weight: 60, reps: 45, completed: true, timed: true })).toBe(0);
    expect(volumeOf([{ weight: 100, reps: 10 }, { weight: 60, reps: 45, timed: true }, { weight: 25, reps: 60, timed: true }])).toBe(1000);
  });
});

describe("the athlete done screen", () => {
  it("leaves a weighted carry out of the lb total; ticked weighted reps count, unticked ones don't", () => {
    const lift = { unit: "reps" as const, sets: [{ weight: 135, reps: 10, done: true }, { weight: 135, reps: 10, done: false }] };
    const carry = { unit: "secs" as const, sets: [{ weight: 60, reps: 45, done: true }] };
    expect(loggedVolume([lift, carry])).toBe(1350);
  });
});

describe("which sets are timed", () => {
  it("by the prescription: seconds, or logged as cardio", () => {
    expect(timedRx([{ unit: "secs", repMin: 30, repMax: 60 }])).toBe(true);
    expect(timedRx([{ repMin: 8, repMax: 12 }])).toBe(false);
    expect(timedRx([{ repMin: 8 }], "CARDIO")).toBe(true);
    expect(timedRx(null)).toBe(false);
  });

  it("a prescription wins; without one, the library's unit decides", () => {
    expect(isTimedSet({ assignedWorkoutExercise: { prescribedSets: [{ unit: "secs" }], mode: "STRENGTH" } }, "barbell-squat")).toBe(true);
    expect(isTimedSet({ assignedWorkoutExercise: { prescribedSets: [{ repMin: 8 }], mode: "STRENGTH" } }, "plank")).toBe(false);
    expect(isTimedSet({ assignedWorkoutExercise: null }, "plank")).toBe(true);
    expect(isTimedSet({ assignedWorkoutExercise: null }, "barbell-squat")).toBe(false);
    expect(isTimedSet({}, null)).toBe(false);
  });
});
