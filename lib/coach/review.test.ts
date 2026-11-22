import { describe, expect, it } from "vitest";
import { exceptionGroups, judgeSet, reviewSession, sessionPrs, setRange } from "./review";

const plan = (weight: number | null, repMin: number, repMax: number) => ({ weight, repMin, repMax });
const done = (weight: number | null, reps: number) => ({ weight, reps, completed: true });

describe("judgeSet", () => {
  it("heavier than planned at the planned reps is a beat", () => {
    expect(judgeSet(plan(70, 6, 10), done(75, 7))).toBe("beat");
    expect(judgeSet(plan(70, 6, 10), done(75, 6))).toBe("beat");
  });
  it("more reps than the top of the range is a beat", () => {
    expect(judgeSet(plan(70, 6, 10), done(70, 11))).toBe("beat");
    expect(judgeSet(plan(null, 10, 15), done(null, 16))).toBe("beat");
  });
  it("within the range at the planned weight is met", () => {
    expect(judgeSet(plan(70, 6, 10), done(70, 6))).toBe("met");
    expect(judgeSet(plan(70, 6, 10), done(70, 10))).toBe("met");
    expect(judgeSet(plan(null, 8, 12), done(40, 9))).toBe("met"); // no planned weight: reps decide
  });
  it("fewer reps than the bottom of the range, or lighter than planned, is short", () => {
    expect(judgeSet(plan(70, 6, 10), done(70, 5))).toBe("short");
    expect(judgeSet(plan(70, 6, 10), done(65, 8))).toBe("short");
    expect(judgeSet(plan(null, 8, 12), done(null, 7))).toBe("short");
  });
  it("heavier but under the rep floor is met: she traded reps for weight", () => {
    expect(judgeSet(plan(70, 6, 10), done(80, 5))).toBe("met");
  });
  it("lighter and over the top is short, not a beat", () => {
    expect(judgeSet(plan(100, 6, 10), done(90, 12))).toBe("short");
  });
  it("no set, an unticked set, or no reps is skipped", () => {
    expect(judgeSet(plan(70, 6, 10), undefined)).toBe("skipped");
    expect(judgeSet(plan(70, 6, 10), { weight: 70, reps: 8, completed: false })).toBe("skipped");
    expect(judgeSet(plan(70, 6, 10), done(70, 0))).toBe("skipped");
  });
  it("a hold in seconds is judged on its seconds", () => {
    expect(judgeSet({ weight: null, repMin: 30, repMax: 60 }, done(null, 45))).toBe("met");
    expect(judgeSet({ weight: null, repMin: 30, repMax: 60 }, done(null, 20))).toBe("short");
  });
});

describe("reviewSession: each set against its own prescription", () => {
  // planned 95 / 105 / 115, all 6–10
  const sets = [95, 105, 115].map((weight, i) => ({ setNumber: i + 1, weight, repMin: 6, repMax: 10 }));
  const ex = (logged: Array<[number, number | null, number | null]>) => ({
    name: "Bench Press",
    prescribedSets: sets,
    sets: logged.map(([setNumber, weight, reps]) => ({ setNumber, weight, reps, completed: true })),
  });

  it("logging what was planned, set by set, is on plan: a heavier planned set doesn't read as short", () => {
    const r = reviewSession([ex([[1, 95, 6], [2, 105, 6], [3, 115, 6]])]);
    expect(r.counts).toEqual({ beat: 0, met: 3, short: 0, skipped: 0 });
  });
  it("95 on every set (the first set's weight) shows sets 2 and 3 as short", () => {
    const r = reviewSession([ex([[1, 95, 6], [2, 95, 6], [3, 95, 6]])]);
    expect(r.exercises[0].sets.map((s) => s.outcome)).toEqual(["met", "short", "short"]);
  });
  it("counts beat, met, short and skipped across exercises", () => {
    const r = reviewSession([
      ex([[1, 100, 6], [2, 105, 6]]), // beat, met, then set 3 skipped
      { name: "Row", prescribedSets: [plan(85, 8, 12), plan(85, 8, 12)], sets: [{ setNumber: 1, weight: 85, reps: 7, completed: true }] }, // short, skipped
    ]);
    expect(r.counts).toEqual({ beat: 1, met: 1, short: 1, skipped: 2 });
    expect(r.planned).toBe(5);
    expect(r.onPlan).toBe(2);
  });
  it("ignores sets she added beyond the plan", () => {
    const r = reviewSession([ex([[1, 95, 6], [2, 105, 6], [3, 115, 6], [4, 115, 6]])]);
    expect(r.planned).toBe(3);
  });
  it("a workout with no prescription has nothing to judge", () => {
    expect(reviewSession([{ name: "x", prescribedSets: [], sets: [{ setNumber: 1, weight: 10, reps: 5, completed: true }] }]).planned).toBe(0);
  });
});

describe("exceptionGroups", () => {
  it("lists only beat, short and skipped, grouped by exercise, beats first", () => {
    const r = reviewSession([
      { name: "A", prescribedSets: [plan(50, 5, 8), plan(50, 5, 8)], sets: [{ setNumber: 1, weight: 50, reps: 5, completed: true }, { setNumber: 2, weight: 50, reps: 5, completed: true }] }, // all met
      { name: "B", prescribedSets: [plan(50, 5, 8), plan(50, 5, 8), plan(50, 5, 8)], sets: [] }, // all skipped
      { name: "C", prescribedSets: [plan(50, 5, 8), plan(50, 5, 8)], sets: [{ setNumber: 1, weight: 55, reps: 6, completed: true }, { setNumber: 2, weight: 55, reps: 6, completed: true }] }, // beat
    ]);
    expect(exceptionGroups(r).map((g) => `${g.kind}:${g.exercise}:${g.sets.length}`)).toEqual(["beat:C:2", "skipped:B:3"]);
  });
  it("says which sets", () => {
    expect(setRange([1, 2, 3], 3)).toBe("all 3 sets");
    expect(setRange([3], 3)).toBe("set 3");
    expect(setRange([1, 2], 3)).toBe("sets 1–2");
    expect(setRange([1], 1)).toBe("set 1");
  });
});

describe("sessionPrs", () => {
  const pt = (date: string, record: boolean, best: boolean) => ({ date, weight: 100, reps: 5, e1rm: 116.7, record, best });
  it("names the lifts with a record or a new best on that day, with the estimated max", () => {
    const ex = [
      { name: "Bench Press", loaded: true, series: [pt("2026-11-20", true, false)] },
      { name: "Row", loaded: true, series: [pt("2026-11-20", false, false)] },
      { name: "Pull-Up", loaded: false, series: [{ date: "2026-11-20", weight: null, reps: 9, e1rm: null, record: true, best: false }] },
      { name: "Squat", loaded: true, series: [pt("2026-11-13", true, false)] },
    ];
    expect(sessionPrs(ex, "2026-11-20")).toEqual([{ name: "Bench Press", value: 117 }, { name: "Pull-Up", value: 9 }]);
  });
});
