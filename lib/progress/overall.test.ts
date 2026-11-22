import { describe, expect, it } from "vitest";
import { buildSeries, sessionPoint } from "@/lib/plan/overload";
import { hasProgressToShow, newestIsLighter, overallProgress } from "./overall";

const set = (weight: number | null, reps: number) => ({ weight, reps, completed: true });
const lift = (sessions: Array<[string, number | null, number, boolean?]>) => {
  const series = buildSeries(sessions.map(([d, w, r, deload]) => sessionPoint(d, [set(w, r)], deload ?? false)!));
  return { series, loaded: series.some((p) => p.weight != null) };
};

describe("overall progress", () => {
  it("averages each lift's change from its own start, week by week", () => {
    // Bench e1RM 100 x 5 ≈ 116.7 → 110 x 5 ≈ 128.3 (+10%). Row 100 x 5 → 100 x 5 (0%).
    const bench = lift([["2026-10-05", 100, 5], ["2026-10-12", 110, 5]]);
    const row = lift([["2026-10-05", 100, 5], ["2026-10-12", 100, 5]]);
    const o = overallProgress([bench, row]);
    expect(o.points.map((p) => p.pct)).toEqual([0, 5]);
    expect(o).toMatchObject({ change: 5, lifts: 2, since: "2026-10-05" });
  });

  it("carries a lift's latest value through weeks it wasn't trained", () => {
    const squat = lift([["2026-10-05", 100, 5], ["2026-10-19", 120, 5]]);
    const press = lift([["2026-10-05", 60, 5], ["2026-10-12", 66, 5]]);
    const o = overallProgress([squat, press]);
    // Week 2: squat still at start (0%), press +10%. Week 3: squat +20%, press +10%.
    expect(o.points.map((p) => [p.week, p.pct])).toEqual([
      ["2026-10-05", 0],
      ["2026-10-12", 5],
      ["2026-10-19", 15],
    ]);
  });

  it("leaves lighter weeks out, and needs two sessions before a lift counts", () => {
    const bench = lift([["2026-10-05", 100, 5], ["2026-10-12", 80, 5, true], ["2026-10-19", 105, 5]]);
    const once = lift([["2026-10-05", 200, 5]]);
    const o = overallProgress([bench, once]);
    expect(o.points.map((p) => p.week)).toEqual(["2026-10-05", "2026-10-19"]);
    expect(o).toMatchObject({ change: 5, lifts: 1 });
  });

  it("measures bodyweight work by reps", () => {
    const pullups = lift([["2026-10-05", null, 8], ["2026-10-12", null, 10]]);
    expect(overallProgress([pullups]).change).toBe(25);
  });

  it("says nothing without enough data", () => {
    expect(overallProgress([])).toEqual({ points: [], change: null, lifts: 0, since: null });
  });
});

describe("hasProgressToShow", () => {
  const pt = (date: string, weight: number) => ({ date, weight, reps: 5, e1rm: weight * 1.17, volume: weight * 5, record: false, deload: false }) as never;
  it("is false with nothing logged, or one session of a lift and no record", () => {
    expect(hasProgressToShow({ exercises: [], recentPRs: [], totals: { sessions: 0 } })).toBe(false);
    expect(hasProgressToShow({ exercises: [{ loaded: true, series: [pt("2026-11-17", 100)] }], recentPRs: [], totals: { sessions: 1 } })).toBe(false);
  });
  it("is true with a strength line, or a record", () => {
    expect(hasProgressToShow({ exercises: [{ loaded: true, series: [pt("2026-11-02", 100), pt("2026-11-16", 110)] }], recentPRs: [], totals: { sessions: 2 } })).toBe(true);
    expect(hasProgressToShow({ exercises: [], recentPRs: [{}], totals: { sessions: 1 } })).toBe(true);
  });
});

describe("newestIsLighter", () => {
  it("is true when the latest session was in a lighter week (the line ends before it)", () => {
    const bench = lift([["2026-10-05", 100, 5], ["2026-10-12", 105, 5], ["2026-10-19", 80, 5, true]]);
    const row = lift([["2026-10-05", 90, 5], ["2026-10-20", 70, 5, true]]);
    expect(newestIsLighter([bench, row])).toBe(true);
    expect(overallProgress([bench]).points.map((p) => p.week)).toEqual(["2026-10-05", "2026-10-12"]);
  });
  it("is false when the latest session counts, or there are none", () => {
    expect(newestIsLighter([lift([["2026-10-05", 100, 5, true], ["2026-10-12", 105, 5]])])).toBe(false);
    expect(newestIsLighter([])).toBe(false);
  });
});

