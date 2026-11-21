import { describe, expect, it } from "vitest";
import { weekCount } from "./week";

const start = new Date("2026-10-27T04:00:00Z");
const day = (n: number) => new Date(start.getTime() + n * 86_400_000);
const w = (offset: number, done: boolean, status = "PLANNED") => ({ scheduledDate: day(offset), status, done });
const plan = [w(0, true), w(1, true), w(3, true), w(4, false), w(7, false), w(8, false)];

describe("weekCount", () => {
  it("counts done of planned in the plan's current week", () => {
    expect(weekCount(start, plan, day(3.5))).toEqual({ done: 3, planned: 4, week: 1 });
  });
  it("moves to the next week on its own seventh day", () => {
    expect(weekCount(start, plan, day(7.2))).toEqual({ done: 0, planned: 2, week: 2 });
  });
  it("leaves out skipped workouts: they aren't planned", () => {
    expect(weekCount(start, [w(0, true), w(1, false, "SKIPPED"), w(3, false)], day(2))).toEqual({ done: 1, planned: 2, week: 1 });
  });
  it("is null before the plan starts, and when the week has nothing planned", () => {
    expect(weekCount(start, plan, day(-5))).toBeNull();
    expect(weekCount(start, plan, day(15))).toBeNull();
    expect(weekCount(start, [], day(2))).toBeNull();
  });
  it("counts a week with nothing done as 0 of n", () => {
    expect(weekCount(start, [w(0, false), w(1, false)], day(1))).toEqual({ done: 0, planned: 2, week: 1 });
  });
});
