import { describe, expect, it } from "vitest";
import { isGenerated, isLighterWeek, lighterWeeksOn } from "./lighter";

const start = new Date("2026-11-02T00:00:00");
const day = (n: number) => new Date(start.getTime() + n * 86_400_000);
const generated = { goalTags: { goals: [], prefs: { goal: "strength" } } };
const handBuilt = { goalTags: { goals: ["Strength"], conditions: [] } };

describe("lighter weeks", () => {
  it("tells generated programs from hand-built ones", () => {
    expect(isGenerated(generated.goalTags)).toBe(true);
    expect(isGenerated(handBuilt.goalTags)).toBe(false);
    expect(isGenerated(null)).toBe(false);
  });

  it("defaults on for generated plans and off for hand-built ones", () => {
    expect(lighterWeeksOn({ lighterWeeks: null, sourceProgram: generated })).toBe(true);
    expect(lighterWeeksOn({ lighterWeeks: null, sourceProgram: handBuilt })).toBe(false);
  });

  it("treats an athlete's older plans (no stored prefs) as generated", () => {
    expect(lighterWeeksOn({ lighterWeeks: null, sourceProgram: handBuilt }, true)).toBe(true);
  });

  it("never treats a library program as generated, even on a self-built profile", () => {
    expect(lighterWeeksOn({ lighterWeeks: null, sourceProgram: { ...handBuilt, isTemplate: true } }, true)).toBe(false);
  });

  it("lets the switch override the default either way", () => {
    expect(lighterWeeksOn({ lighterWeeks: true, sourceProgram: handBuilt })).toBe(true);
    expect(lighterWeeksOn({ lighterWeeks: false, sourceProgram: generated })).toBe(false);
    expect(lighterWeeksOn({ lighterWeeks: false, sourceProgram: handBuilt }, true)).toBe(false);
  });

  it("marks only the 4th, 8th, 12th… week", () => {
    const plan = { startDate: start, lighterWeeks: true, sourceProgram: handBuilt };
    const lighter = Array.from({ length: 12 }, (_, w) => isLighterWeek(day(w * 7 + 2), plan)).flatMap((on, w) => (on ? [w + 1] : []));
    expect(lighter).toEqual([4, 8, 12]);
  });

  it("marks nothing when the plan has them off", () => {
    const plan = { startDate: start, lighterWeeks: false, sourceProgram: generated };
    expect(isLighterWeek(day(3 * 7), plan)).toBe(false);
  });
});
