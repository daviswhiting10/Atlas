import { describe, expect, it } from "vitest";
import { bodyWeightSummary, dailyPoints, kgToLb, lbToKg } from "./body-weight";

describe("body weight", () => {
  it("stored in kg, shown in lb, round trip to a tenth", () => {
    expect(kgToLb(lbToKg(182.4))).toBe(182.4);
  });
  it("one point a day (the last that day), oldest first; empty weights skipped", () => {
    const d = (s: string) => new Date(s);
    expect(
      dailyPoints([
        { measuredAt: d("2026-11-20T08:00:00Z"), bodyWeightKg: lbToKg(184) },
        { measuredAt: d("2026-11-18T08:00:00Z"), bodyWeightKg: lbToKg(186) },
        { measuredAt: d("2026-11-20T20:00:00Z"), bodyWeightKg: lbToKg(183) },
        { measuredAt: d("2026-11-19T08:00:00Z"), bodyWeightKg: null },
      ])
    ).toEqual([{ day: "2026-11-18", lb: 186 }, { day: "2026-11-20", lb: 183 }]);
  });
  it("summary: latest, change since the first, a padded range", () => {
    const s = bodyWeightSummary([{ day: "2026-06-01", lb: 188 }, { day: "2026-11-20", lb: 180 }])!;
    expect(s).toMatchObject({ change: -8, latest: { lb: 180 } });
    expect(s.min).toBeLessThan(180);
    expect(s.max).toBeGreaterThan(188);
    expect(bodyWeightSummary([])).toBeNull();
  });
});
