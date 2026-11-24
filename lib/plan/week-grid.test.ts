import { describe, expect, it } from "vitest";
import type { PlanOverview, WorkoutSummary } from "./overview";
import { defaultDay, mondayOf, openingMonday, planWeekOf, weekBounds, weekGrid, weekRange } from "./week-grid";

const wo = (id: string, week: number, status: WorkoutSummary["status"], date: string, sessionAt: string | null = null): WorkoutSummary =>
  ({ id, name: id, week, date, status, sessionAt, note: null, history: [], deload: false, estMinutes: 50, exercises: [] });
const plan = (workouts: WorkoutSummary[], startDate = "2026-07-13"): PlanOverview =>
  ({ workouts, startDate, nextUp: workouts.find((w) => w.status === "PLANNED") ?? null, totalWeeks: 24, currentWeek: 20 }) as unknown as PlanOverview;
const ids = (g: ReturnType<typeof weekGrid>) => g!.cells.map((c) => c.items.map((x) => x.workout.id).join("+") || "-");
const NY = "America/New_York";

describe("the Plan week grid: a calendar week", () => {
  const four = [wo("a", 20, "LOGGED", "2026-11-23"), wo("b", 20, "PLANNED", "2026-11-24"), wo("c", 20, "PLANNED", "2026-11-26"), wo("d", 20, "PLANNED", "2026-11-27")];
  it("Monday to Sunday: seven cells from the Monday", () => {
    const g = weekGrid(plan(four), "2026-11-23", "2026-11-25", "UTC")!;
    expect(g.monday).toBe("2026-11-23");
    expect(g.cells.map((c) => c.date.slice(8))).toEqual(["23", "24", "25", "26", "27", "28", "29"]);
  });
  it("each workout lands on its date", () => {
    expect(ids(weekGrid(plan(four), "2026-11-23", "2026-11-25", "UTC"))).toEqual(["a", "b", "-", "c", "d", "-", "-"]);
  });
  it("Tuesday is no longer forced to rest: four workouts Mon to Thu fill Mon to Thu", () => {
    const monThu = ["23", "24", "25", "26"].map((d, i) => wo(`w${i}`, 20, "PLANNED", `2026-11-${d}`));
    const g = weekGrid(plan(monThu), "2026-11-23", "2026-11-25", "UTC")!;
    expect(ids(g)).toEqual(["w0", "w1", "w2", "w3", "-", "-", "-"]);
    expect(g.cells[1].items).toHaveLength(1);
  });
  it("a logged session lands on its session day in the athlete's timezone, not the slot's", () => {
    // Slot Monday 11/23; done Tuesday 11/24 at 13:55 UTC (08:55 in New York).
    const p = plan([wo("day3", 1, "LOGGED", "2026-11-23", "2026-11-24T13:55:00.000Z")]);
    expect(ids(weekGrid(p, "2026-11-23", "2026-11-25", NY))).toEqual(["-", "day3", "-", "-", "-", "-", "-"]);
    // 01:20 UTC on 11/24 is still the evening of 11/23 in New York.
    const late = plan([wo("day3", 1, "LOGGED", "2026-11-22", "2026-11-24T01:20:00.000Z")]);
    expect(ids(weekGrid(late, "2026-11-23", "2026-11-25", NY))).toEqual(["day3", "-", "-", "-", "-", "-", "-"]);
    expect(ids(weekGrid(late, "2026-11-23", "2026-11-25", "UTC"))).toEqual(["-", "day3", "-", "-", "-", "-", "-"]);
  });
  it("a workout not yet done stays on its scheduled date whatever the timezone", () => {
    expect(ids(weekGrid(plan([wo("x", 1, "PLANNED", "2026-11-24")]), "2026-11-23", "2026-11-25", "Pacific/Kiritimati"))).toEqual(["-", "x", "-", "-", "-", "-", "-"]);
  });
  it("two items on one day: both listed in plan order, the first one's icon, done only when both are", () => {
    const p = plan([wo("day3", 1, "LOGGED", "2026-11-23", "2026-11-24T13:55:00.000Z"), wo("day4", 1, "LOGGED", "2026-11-24", "2026-11-24T22:00:00.000Z"), wo("day5", 1, "PLANNED", "2026-11-25")]);
    const g = weekGrid(p, "2026-11-23", "2026-11-25", NY)!;
    expect(ids(g)).toEqual(["-", "day3+day4", "day5", "-", "-", "-", "-"]);
    expect(g.cells[1].done).toBe(true);
    expect(g.cells[1].kind).toBe(g.cells[1].items[0].kind);
    const mixed = weekGrid(plan([wo("a", 1, "LOGGED", "2026-11-24", "2026-11-24T15:00:00.000Z"), wo("b", 1, "PLANNED", "2026-11-24")]), "2026-11-23", "2026-11-25", NY)!;
    expect(mixed.cells[1].done).toBe(false);
    expect(mixed.cells[1].upNext).toBe(true);
  });
  it("a plan that starts on a Saturday: its first week splits across two calendar weeks, labelled by the Monday's plan week", () => {
    // Plan weeks run Sat to Fri from 11/21. Days 1-2 on Sat 11/21 and Sun 11/22, Days 3-6 Mon to Thu.
    const sat = plan(
      [wo("d1", 1, "LOGGED", "2026-11-21", "2026-11-21T15:00:00.000Z"), wo("d2", 1, "LOGGED", "2026-11-22", "2026-11-22T15:00:00.000Z"), wo("d3", 1, "LOGGED", "2026-11-23", "2026-11-24T13:55:00.000Z"), wo("d4", 1, "LOGGED", "2026-11-24", "2026-11-24T23:00:00.000Z"), wo("d5", 1, "PLANNED", "2026-11-25"), wo("d6", 1, "PLANNED", "2026-11-26"), wo("e1", 2, "PLANNED", "2026-11-28")],
      "2026-11-21"
    );
    expect(ids(weekGrid(sat, "2026-11-16", "2026-11-24", NY))).toEqual(["-", "-", "-", "-", "-", "d1", "d2"]);
    expect(ids(weekGrid(sat, "2026-11-23", "2026-11-24", NY))).toEqual(["-", "d3+d4", "d5", "d6", "-", "e1", "-"]);
    expect(planWeekOf("2026-11-23", "2026-11-21", 24)).toBe(1);
    expect(planWeekOf("2026-11-30", "2026-11-21", 24)).toBe(2);
    expect(planWeekOf("2026-11-16", "2026-11-21", 24)).toBeNull(); // before the plan
    expect(weekBounds(sat, "2026-11-24", NY)).toEqual({ first: "2026-11-16", last: "2026-11-23" });
  });
  it("an empty week has no grid", () => {
    expect(weekGrid(plan(four), "2026-06-01", "2026-11-25", "UTC")).toBeNull();
  });
  it("skipped workouts aren't drawn", () => {
    const skipped = [wo("a", 20, "LOGGED", "2026-11-23"), wo("b", 20, "SKIPPED", "2026-11-24"), wo("c", 20, "PLANNED", "2026-11-26")];
    expect(ids(weekGrid(plan(skipped), "2026-11-23", "2026-11-25", "UTC"))).toEqual(["a", "-", "-", "c", "-", "-", "-"]);
  });
  it("the plan's next workout is outlined on its date, and skipping one moves the outline on in sequence", () => {
    expect(weekGrid(plan(four), "2026-11-23", "2026-11-25", "UTC")!.cells.filter((c) => c.upNext).map((c) => c.index)).toEqual([1]);
    const skipped = [wo("a", 20, "LOGGED", "2026-11-23"), wo("b", 20, "SKIPPED", "2026-11-24"), wo("c", 20, "PLANNED", "2026-11-26"), wo("d", 20, "PLANNED", "2026-11-27")];
    expect(weekGrid(plan(skipped), "2026-11-23", "2026-11-25", "UTC")!.cells.filter((c) => c.upNext).map((c) => c.items[0].workout.id)).toEqual(["c"]);
  });
  it("today is marked when it is in the week", () => {
    expect(weekGrid(plan(four), "2026-11-23", "2026-11-25", "UTC")!.cells.filter((c) => c.today).map((c) => c.index)).toEqual([2]);
    expect(weekGrid(plan(four), "2026-11-23", "2026-12-30", "UTC")!.cells.some((c) => c.today)).toBe(false);
  });
  it("the card opens on today, else the next workout, else the first day with something", () => {
    expect(defaultDay(weekGrid(plan(four), "2026-11-23", "2026-11-25", "UTC")!.cells)).toBe(2);
    expect(defaultDay(weekGrid(plan(four), "2026-11-23", "2026-12-30", "UTC")!.cells)).toBe(1);
    const done = [wo("a", 20, "LOGGED", "2026-11-24"), wo("b", 20, "LOGGED", "2026-11-25")];
    expect(defaultDay(weekGrid(plan(done), "2026-11-23", "2026-12-30", "UTC")!.cells)).toBe(1);
  });
  it("opens on today's week; on the next workout's week when today's has nothing", () => {
    expect(openingMonday(plan(four), "2026-11-25", "UTC")).toBe("2026-11-23");
    expect(openingMonday(plan([wo("x", 1, "PLANNED", "2026-12-02")]), "2026-11-25", "UTC")).toBe("2026-11-30");
    expect(openingMonday(plan([wo("x", 1, "LOGGED", "2026-10-01")]), "2026-11-25", "UTC")).toBe("2026-11-23");
  });
  it("Monday and the range", () => {
    expect(mondayOf("2026-11-29")).toBe("2026-11-23");
    expect(mondayOf("2026-11-23")).toBe("2026-11-23");
    expect(weekRange("2026-11-23")).toBe("Nov 23 – 29");
    expect(weekRange("2026-11-30")).toBe("Nov 30 – Dec 6");
  });
});

describe("each cell's kind drives its icon", () => {
  const withKinds = (id: string, week: number, date: string, kinds: Array<"strength" | "cardio" | "mobility">): WorkoutSummary =>
    ({ ...wo(id, week, "PLANNED", date), exercises: kinds.map((kind, i) => ({ aweId: `${id}${i}`, kind, section: "block:1" })) }) as unknown as WorkoutSummary;
  it("strength, cardio and mobility days; rest has none", () => {
    const g = weekGrid(plan([withKinds("a", 20, "2026-11-23", ["strength", "strength"]), withKinds("b", 20, "2026-11-25", ["cardio"]), withKinds("c", 20, "2026-11-27", ["mobility", "mobility"])]), "2026-11-23", "2026-11-25", "UTC")!;
    expect(g.cells.map((c) => c.kind)).toEqual(["strength", null, "cardio", null, "mobility", null, null]);
  });
});

import { readFileSync } from "node:fs";
describe("any day can be started", () => {
  const src = readFileSync(new URL("../../components/athlete/PlanWeek.tsx", import.meta.url), "utf8");
  it("every workout day that isn't done says Start (past, today or ahead), not only the next one", () => {
    expect(src).toContain('{done ? "View session" : "Start"}');
    expect(src).not.toContain('"Open workout"');
  });
  it("only a finished day is the quiet button; the others are the solid one", () => {
    expect(src).toContain('done ? "border border-line-strong text-ink" : "bg-dusk-button text-dusk-button-text hover:brightness-110"');
  });
  it("a day behind us that wasn't done says so", () => {
    expect(src).toContain('cell.date < today ? "Not done"');
  });
});
