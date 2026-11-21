import { describe, expect, it } from "vitest";
import { mainLifts, weekChips, weekCount } from "./week";

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

describe("weekChips", () => {
  const named = (offset: number, done: boolean, name: string, status = "PLANNED") => ({ ...w(offset, done, status), name });
  it("lists the week's planned workouts in date order with whether each is done", () => {
    const r = weekChips(start, [named(4, false, "Lower B"), named(0, true, "Upper A"), named(1, true, "Lower A"), named(3, true, "Upper B"), named(8, false, "next week")], day(3.5));
    expect(r?.chips.map((c) => `${c.name}:${c.done}`)).toEqual(["Upper A:true", "Lower A:true", "Upper B:true", "Lower B:false"]);
    expect([r?.done, r?.planned, r?.week]).toEqual([3, 4, 1]);
  });
  it("leaves out a skipped workout and is null with nothing planned", () => {
    expect(weekChips(start, [named(0, true, "A"), named(2, false, "B", "SKIPPED")], day(1))?.chips.map((c) => c.name)).toEqual(["A"]);
    expect(weekChips(start, [], day(1))).toBeNull();
  });
});

describe("mainLifts", () => {
  const pt = (date: string, e1rm: number | null, reps = 5, deload = false) => ({ date, e1rm, reps, deload });
  const ex = (exerciseId: string, name: string, loaded: boolean, series: ReturnType<typeof pt>[]) => ({ exerciseId, name, loaded, series });
  const lifts = [
    ex("bench", "Bench Press", true, [pt("2026-11-01", 117), pt("2026-11-08", 123), pt("2026-11-15", 130), pt("2026-11-20", 99, 5, true)]),
    ex("pu", "Pull-Up", false, [pt("2026-11-01", null, 7), pt("2026-11-08", null, 9)]),
    ex("once", "Squat", true, [pt("2026-11-01", 140)]),
  ];
  it("gives each lift's estimated max over its counted sessions, in the plan's order", () => {
    const r = mainLifts(lifts, ["pu", "bench"]);
    expect(r.map((l) => l.name)).toEqual(["Pull-Up", "Bench Press"]);
    expect(r[1]).toMatchObject({ values: [117, 123, 130], latest: 130, delta: 13 });
    expect(r[0]).toMatchObject({ loaded: false, values: [7, 9], delta: 2 });
  });
  it("leaves a lighter week out, and a lift with one session", () => {
    expect(mainLifts(lifts, ["bench"])[0].values).not.toContain(99);
    expect(mainLifts(lifts, ["once"])).toEqual([]);
  });
  it("skips lifts that aren't in her history and stops at the limit", () => {
    expect(mainLifts(lifts, ["nope", "bench"]).map((l) => l.name)).toEqual(["Bench Press"]);
    expect(mainLifts(lifts, ["bench", "pu"], 1)).toHaveLength(1);
  });
});
