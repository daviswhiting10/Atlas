import { describe, expect, it } from "vitest";
import { planSessionSource, planWorkoutStatus, withDerivedStatus } from "./status";

describe("a plan workout's status comes from its session", () => {
  const done = { completedAt: new Date("2026-11-13T15:00:00Z") };
  const started = { completedAt: null };

  it("done only when its session is finished", () => {
    expect(planWorkoutStatus("PLANNED", done)).toBe("LOGGED");
    expect(planWorkoutStatus("PLANNED", started)).toBe("PLANNED");
    expect(planWorkoutStatus("PLANNED", null)).toBe("PLANNED");
  });

  it("a stored LOGGED without a finished session isn't done", () => {
    expect(planWorkoutStatus("LOGGED", null)).toBe("PLANNED");
    expect(planWorkoutStatus("LOGGED", started)).toBe("PLANNED");
  });

  it("skipped stays skipped unless a session was finished anyway", () => {
    expect(planWorkoutStatus("SKIPPED", undefined)).toBe("SKIPPED");
    expect(planWorkoutStatus("SKIPPED", done)).toBe("LOGGED");
  });

  it("rows keep their other fields", () => {
    expect(withDerivedStatus({ id: "w1", status: "PLANNED" as const, workoutLog: done })).toEqual({ id: "w1", status: "LOGGED", workoutLog: done });
  });
});

describe("planSessionSource", () => {
  it("generated plans are the non-template programs", () => {
    expect(planSessionSource({ isTemplate: false })).toBe("GENERATED");
    expect(planSessionSource({ isTemplate: true })).toBe("PLAN");
  });
});
