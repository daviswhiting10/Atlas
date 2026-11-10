import { describe, expect, it } from "vitest";
import { buildSeries, e1rm, metricFor, nextTarget, sessionPoint, targetValue } from "./overload";

const set = (weight: number | null, reps: number, completed = true) => ({ weight, reps, completed });
const range = { repMin: 6, repMax: 10, increment: 5 };

describe("nextTarget", () => {
  it("asks for a baseline when there is no history", () => {
    expect(nextTarget({ last: [], ...range })).toMatchObject({ kind: "first", weight: null, reps: 6 });
  });

  it("adds a rep while inside the range", () => {
    expect(nextTarget({ last: [set(150, 8), set(150, 8), set(150, 7)], ...range })).toMatchObject({ kind: "add_reps", weight: 150, reps: 9 });
  });

  it("adds weight once the top of the range is reached", () => {
    expect(nextTarget({ last: [set(150, 10), set(150, 9)], ...range })).toMatchObject({ kind: "add_weight", weight: 155, reps: 8 });
  });

  it("holds the weight when reps fell short of the range", () => {
    expect(nextTarget({ last: [set(150, 4)], ...range })).toMatchObject({ kind: "hold", weight: 150, reps: 6 });
  });

  it("judges by the heaviest weight used, not a lighter back-off set", () => {
    expect(nextTarget({ last: [set(150, 7), set(135, 12)], ...range })).toMatchObject({ weight: 150, reps: 8 });
  });

  it("ignores sets that were not completed", () => {
    expect(nextTarget({ last: [set(150, 10, false)], ...range }).kind).toBe("first");
  });

  it("progresses bodyweight work by reps and timed work by seconds", () => {
    expect(nextTarget({ last: [set(null, 12)], repMin: 8, repMax: 15, increment: 0 })).toMatchObject({ kind: "add_reps", weight: null, reps: 13 });
    expect(nextTarget({ last: [set(null, 40)], repMin: 30, repMax: 60, increment: 0, unit: "secs" }).reps).toBe(45);
  });
});

describe("sessionPoint", () => {
  it("summarises a session", () => {
    const p = sessionPoint("2026-01-05", [set(100, 10), set(110, 8), set(110, 6), set(120, 5, false)]);
    expect(p).toMatchObject({ weight: 110, reps: 8, volume: 100 * 10 + 110 * 8 + 110 * 6, sets: 3 });
    expect(p?.e1rm).toBeCloseTo(e1rm(110, 8), 1);
  });

  it("counts total reps as volume for bodyweight work", () => {
    expect(sessionPoint("2026-01-05", [set(null, 12), set(null, 10)])).toMatchObject({ weight: null, reps: 12, e1rm: null, volume: 22 });
  });

  it("returns nothing when no set was completed", () => {
    expect(sessionPoint("2026-01-05", [set(100, 5, false)])).toBeNull();
  });
});

describe("buildSeries", () => {
  const points = [
    sessionPoint("2026-01-12", [set(105, 8)])!,
    sessionPoint("2026-01-05", [set(100, 8)])!,
    sessionPoint("2026-01-19", [set(105, 7)])!,
  ];

  it("sorts by date and flags records, treating the first session as a baseline", () => {
    const series = buildSeries(points);
    expect(series.map((p) => p.date)).toEqual(["2026-01-05", "2026-01-12", "2026-01-19"]);
    expect(series[0].pr).toEqual({});
    expect(series[1].pr).toMatchObject({ weight: true, e1rm: true, volume: true });
    expect(series[2].pr).toEqual({});
  });

  it("falls back to reps when an exercise has no load to chart", () => {
    const bodyweight = buildSeries([sessionPoint("2026-01-05", [set(null, 10)])!]);
    expect(metricFor("e1rm", bodyweight)).toBe("reps");
    expect(metricFor("volume", bodyweight)).toBe("volume");
    expect(metricFor("e1rm", buildSeries(points))).toBe("e1rm");
  });
});

describe("targetValue", () => {
  const target = nextTarget({ last: [set(150, 10)], ...range });

  it("projects the next point for the metric being charted", () => {
    expect(targetValue(target, "weight")).toBe(155);
    expect(targetValue(target, "reps")).toBe(8);
    expect(targetValue(target, "e1rm")).toBeCloseTo(e1rm(155, 8), 1);
    expect(targetValue(target, "volume")).toBeNull();
    expect(targetValue(null, "weight")).toBeNull();
  });
});
