import { describe, expect, it } from "vitest";
import type { PlanOverview, WorkoutSummary } from "./overview";
import { defaultDay, mondayOf, weekGrid, weekRange } from "./week-grid";

const wo = (id: string, week: number, status: WorkoutSummary["status"], date: string): WorkoutSummary =>
  ({ id, name: id, week, date, status, note: null, history: [], deload: false, estMinutes: 50, exercises: [] });
const plan = (workouts: WorkoutSummary[]): PlanOverview =>
  ({ workouts, nextUp: workouts.find((w) => w.status === "PLANNED") ?? null, totalWeeks: 24, currentWeek: 20 }) as unknown as PlanOverview;

describe("the Plan week grid", () => {
  const four = [wo("a", 20, "LOGGED", "2026-11-23"), wo("b", 20, "PLANNED", "2026-11-24"), wo("c", 20, "PLANNED", "2026-11-26"), wo("d", 20, "PLANNED", "2026-11-27")];
  it("Monday to Sunday: seven cells from the week's Monday", () => {
    const g = weekGrid(plan(four), 20, "2026-11-25")!;
    expect(g.monday).toBe("2026-11-23");
    expect(g.cells.map((c) => c.date.slice(8))).toEqual(["23", "24", "25", "26", "27", "28", "29"]);
  });
  it("four workouts spread Mon, Wed, Thu, Fri in order; the other days rest", () => {
    const g = weekGrid(plan(four), 20, "2026-11-25")!;
    expect(g.cells.map((c) => c.workout?.id ?? "-")).toEqual(["a", "-", "b", "c", "d", "-", "-"]);
  });
  it("the plan's next workout is outlined, not a date", () => {
    const g = weekGrid(plan(four), 20, "2026-11-25")!;
    expect(g.cells.filter((c) => c.upNext).map((c) => c.workout!.id)).toEqual(["b"]);
  });
  it("skipping the next one moves the outline on in sequence", () => {
    const skipped = [wo("a", 20, "LOGGED", "2026-11-23"), wo("b", 20, "SKIPPED", "2026-11-24"), wo("c", 20, "PLANNED", "2026-11-26"), wo("d", 20, "PLANNED", "2026-11-27")];
    const g = weekGrid(plan(skipped), 20, "2026-11-25")!;
    expect(g.cells.filter((c) => c.upNext).map((c) => c.workout!.id)).toEqual(["c"]);
  });
  it("today is marked when it is in the week", () => {
    expect(weekGrid(plan(four), 20, "2026-11-25")!.cells.filter((c) => c.today).map((c) => c.index)).toEqual([2]);
    expect(weekGrid(plan(four), 20, "2026-12-30")!.cells.some((c) => c.today)).toBe(false);
  });
  it("the card opens on today, else the next workout, else the first", () => {
    expect(defaultDay(weekGrid(plan(four), 20, "2026-11-25")!.cells)).toBe(2);
    expect(defaultDay(weekGrid(plan(four), 20, "2026-12-30")!.cells)).toBe(2);
    const done = [wo("a", 20, "LOGGED", "2026-11-23"), wo("b", 20, "LOGGED", "2026-11-24")];
    expect(defaultDay(weekGrid(plan(done), 20, "2026-12-30")!.cells)).toBe(0);
  });
  it("a week with no workouts has no grid", () => {
    expect(weekGrid(plan(four), 5, "2026-11-25")).toBeNull();
  });
  it("Monday and the range", () => {
    expect(mondayOf("2026-11-29")).toBe("2026-11-23");
    expect(mondayOf("2026-11-23")).toBe("2026-11-23");
    expect(weekRange("2026-11-23")).toBe("Nov 23 – 29");
    expect(weekRange("2026-11-30")).toBe("Nov 30 – Dec 6");
  });
});
