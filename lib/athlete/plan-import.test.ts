import { describe, expect, it } from "vitest";
import { previewFromGrid } from "./plan-import";
import { shapeSheet } from "@/lib/programs/sheet-summary";
import type { SheetGrid } from "@/lib/programs/sheet-plan";

const FRESH = { durationWeeks: null, trainingDays: null, startAtWeek: 1 };
const wk = (rows: Array<[string, string]>) => rows.map(([setsReps, load], i) => ({ week: i + 1, setsReps, load }));
// The 4-week PDF: week 3 is heavier (4 × 6–8), week 4 is a deload.
const grid: SheetGrid = {
  programName: "Strength Base",
  days: [
    { name: "Day 1 - Upper A", exercises: [
      { name: "Barbell Bench Press", weeks: wk([["3x8-10", "135"], ["3x8-10", "140"], ["4x6-8", "155"], ["2x8-10", "115"]]) },
      { name: "Lat Pulldown", weeks: wk([["3x10-12", ""], ["3x10-12", ""], ["3x10-12", ""], ["3x10-12", ""]]) },
    ] },
    { name: "Day 2 - Lower A", exercises: [{ name: "Back Squat", weeks: wk([["3x8-10", "185"], ["3x8-10", "195"], ["4x6-8", "215"], ["2x8-10", "155"]]) }] },
  ],
};

describe("previewFromGrid", () => {
  it("shows each week as written, with its own sets, reps and weight", () => {
    const p = previewFromGrid(grid, FRESH);
    expect(p.meta).toBe("4 weeks · 2 days a week · 3 exercises");
    expect(p.lines).toEqual(["Day 1 - Upper A: 2 exercises", "Day 2 - Lower A: 1 exercise"]);
    expect(p.weekly).toEqual({ exercise: "Barbell Bench Press", weeks: ["Week 1: 3 × 8–10 at 135", "Week 2: 3 × 8–10 at 140", "Week 3: 4 × 6–8 at 155", "Week 4: 2 × 8–10 at 115"] });
    expect(p.sameEveryWeek).toBe(false);
  });
  it("says so when every week is the same", () => {
    const flat: SheetGrid = { days: [{ name: "Day 1", exercises: [{ name: "Squat", weeks: wk([["3x8", "100"], ["3x8", "100"]]) }] }] };
    expect(previewFromGrid(flat, FRESH).sameEveryWeek).toBe(true);
  });
  it("starting fresh, weights are targets: no week counts as done", () => {
    const { weeks, lastLoggedWeek } = shapeSheet(grid, FRESH);
    expect(lastLoggedWeek).toBe(0);
    expect(weeks.every((w) => w.days.every((d) => !d.logged))).toBe(true);
    expect(weeks[2].days[0].entries[0]).toMatchObject({ rx: { sets: 4, repMin: 6, repMax: 8 }, load: { weight: 155 } });
  });
});
