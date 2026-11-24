import { describe, expect, it } from "vitest";
import { youLine, youPlan } from "./you-summary";

const plan = { name: "Build muscle", goalText: "  Get stronger  ", currentWeek: 12, totalWeeks: 12, done: 36, workouts: [{ status: "LOGGED" }, { status: "PLANNED" }, { status: "SKIPPED" }] };

describe("the You screen's plan summary", () => {
  it("name, goal in their words, week, and done of planned (skipped ones don't count)", () => {
    expect(youPlan(plan)).toEqual({ name: "Build muscle", goalText: "Get stronger", week: 12, totalWeeks: 12, done: 36, total: 2 });
  });
  it("no plan: nothing", () => {
    expect(youPlan(null)).toBeNull();
    expect(youLine(null)).toBeNull();
  });
  it("one line", () => {
    expect(youLine({ name: "x", goalText: null, week: 3, totalWeeks: 12, done: 5, total: 36 })).toBe("Week 3 of 12 · 5 of 36 workouts done");
  });
  it("an empty goal is no goal", () => {
    expect(youPlan({ ...plan, goalText: "   " })?.goalText).toBeNull();
  });
});
