import { describe, expect, it } from "vitest";
import { inPlanOrder, nextInPlan } from "./plan-order";

const w = (name: string, order: number, week: number, status = "PLANNED") => ({ name, order, week, status });

describe("up next in plan order", () => {
  it("is the first unlogged workout in plan order, even when its date is in the past or later than the rest", () => {
    // Day 1 was deleted (unlogged again) and now sits in week 2 by date; Day 2 and 3 are logged.
    const plan = [w("Day 2", 2, 1, "LOGGED"), w("Day 3", 3, 1, "LOGGED"), w("Day 4", 4, 1), w("Day 1", 1, 2)];
    expect(nextInPlan(plan)?.name).toBe("Day 1");
  });
  it("passes over skipped and logged workouts", () => {
    expect(nextInPlan([w("A", 1, 1, "LOGGED"), w("B", 2, 1, "SKIPPED"), w("C", 3, 1)])?.name).toBe("C");
  });
  it("nothing left to do is null", () => expect(nextInPlan([w("A", 1, 1, "LOGGED")])).toBeNull());
  it("an imported plan numbers each week's days from 1: there it is week, then day", () => {
    const plan = [w("W2 Day 1", 1, 2), w("W1 Day 2", 2, 1), w("W1 Day 1", 1, 1, "LOGGED"), w("W2 Day 2", 2, 2)];
    expect(inPlanOrder(plan).map((x) => x.name)).toEqual(["W1 Day 1", "W1 Day 2", "W2 Day 1", "W2 Day 2"]);
    expect(nextInPlan(plan)?.name).toBe("W1 Day 2");
  });
});
