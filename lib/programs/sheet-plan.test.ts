import { describe, expect, it } from "vitest";
import { inferWeekOneStart, parseLoad, parseSetsReps, planFromGrid, readGrid, spreadDays, type SheetGrid } from "./sheet-plan";

describe("sets/reps cells", () => {
  it("reads the ways coaches write a prescription", () => {
    expect(parseSetsReps("2x12")).toEqual({ sets: 2, repMin: 12, repMax: 12, unit: "reps", note: null });
    expect(parseSetsReps("2x12-15")).toEqual({ sets: 2, repMin: 12, repMax: 15, unit: "reps", note: null });
    expect(parseSetsReps("1x10")).toMatchObject({ sets: 1, repMin: 10 });
    expect(parseSetsReps("5 min")).toEqual({ sets: 1, repMin: 300, repMax: 300, unit: "secs", note: null });
    expect(parseSetsReps("3x20 seconds")).toMatchObject({ sets: 3, repMin: 20, unit: "secs" });
    expect(parseSetsReps("4x20 yd")).toEqual({ sets: 4, repMin: 20, repMax: 20, unit: "reps", note: "yd" });
    expect(parseSetsReps("3 × 8")).toMatchObject({ sets: 3, repMin: 8 });
    expect(parseSetsReps("")).toBeNull();
    expect(parseSetsReps("see notes")).toBeNull();
  });
});

describe("load cells", () => {
  it("tells weight, bodyweight, bands and notes apart", () => {
    expect(parseLoad("12.5")).toEqual({ weight: 12.5, band: null, note: null });
    expect(parseLoad("30?")).toEqual({ weight: 30, band: null, note: "30?" });
    expect(parseLoad("BW")).toEqual({ weight: null, band: null, note: null });
    expect(parseLoad("blue")).toEqual({ weight: null, band: "blue", note: null });
    expect(parseLoad("Yellow")).toEqual({ weight: null, band: "yellow", note: null });
    expect(parseLoad("2nd to hardest. 3x")).toEqual({ weight: null, band: null, note: "2nd to hardest. 3x" });
    expect(parseLoad("")).toBeNull();
  });
});

/** Day 1 of the coach's sheet: weeks 1–3 filled in, week 4 not yet. */
const GRID: SheetGrid = {
  days: [
    {
      name: "Day 1",
      exercises: [
        { name: "Recumbent bike", notes: "Easy, conversational pace", weeks: [1, 2, 3, 4].map((week) => ({ week, setsReps: "5 min", load: "" })) },
        { name: "Bodyweight box squat", weeks: [1, 2, 3, 4].map((week) => ({ week, setsReps: "1x10", load: "BW" })) },
        { name: "Row with band", notes: "Blue", weeks: [{ week: 1, setsReps: "2x15", load: "" }] },
        { name: "Goblet box squat", weeks: [
          { week: 1, setsReps: "2x12", load: "12.5" },
          { week: 2, setsReps: "2x12", load: "15" },
          { week: 3, setsReps: "3x12", load: "17.5" },
          { week: 4, setsReps: "3x12", load: "" },
        ] },
        { name: "Sled push", notes: "Light load", weeks: [
          { week: 1, setsReps: "4x20 yd", load: "" },
          { week: 2, setsReps: "4x20 yd", load: "2nd to hardest. 3x" },
          { week: 3, setsReps: "5x20 yd", load: "" },
          { week: 4, setsReps: "5x20 yd", load: "" },
        ] },
      ],
    },
  ],
};

describe("the plan from a filled-in sheet", () => {
  it("keeps each week's own prescription", () => {
    const { weeks } = planFromGrid(GRID);
    expect(weeks).toHaveLength(4);
    const goblet = (w: number) => weeks[w - 1].days[0].entries.find((e) => e.exercise === "Goblet box squat")!.rx.sets;
    expect([goblet(1), goblet(2), goblet(3), goblet(4)]).toEqual([2, 2, 3, 3]);
    // A row that only runs in week 1 is only in week 1.
    expect(weeks.map((w) => w.days[0].entries.some((e) => e.exercise === "Row with band"))).toEqual([true, false, false, false]);
  });

  it("treats a week with recorded loads as done, and picks up at the first that isn't", () => {
    const { weeks, lastLoggedWeek } = planFromGrid(GRID);
    // Week 4 has "BW" written ahead for the box squat, but no recorded load: not done yet.
    expect(weeks.map((w) => w.days[0].logged)).toEqual([true, true, true, false]);
    expect(lastLoggedWeek).toBe(3);
    expect(weeks[2].days[0].entries.find((e) => e.exercise === "Goblet box squat")!.load).toEqual({ weight: 17.5, band: null, note: null });
  });

  it("repeats last week's prescription when only the load is filled in", () => {
    const g: SheetGrid = { days: [{ name: "Day 1", exercises: [{ name: "Hinge", weeks: [{ week: 1, setsReps: "3x8", load: "blue" }, { week: 2, setsReps: "", load: "Blue" }, { week: 3, setsReps: "", load: "" }] }] }] };
    const { weeks } = planFromGrid(g);
    expect(weeks[1].days[0].entries[0]).toMatchObject({ rx: { sets: 3, repMin: 8 }, load: { band: "blue" } });
    // Nothing written at all that week: not planned, not done.
    expect(weeks[2]?.days ?? []).toEqual([]);
  });

  it("doesn't count a week whose only load is BW", () => {
    const g: SheetGrid = { days: [{ name: "Day 1", exercises: [{ name: "Push-up", weeks: [{ week: 1, setsReps: "3x10", load: "BW" }] }] }] };
    expect(planFromGrid(g).lastLoggedWeek).toBe(0);
  });

  it("dates week 1 back so the first unfilled week is this week", () => {
    // Wednesday Nov 11 2026; three weeks done → week 1 began Monday Oct 19.
    const start = inferWeekOneStart(3, new Date(2026, 10, 11, 15));
    expect([start.getFullYear(), start.getMonth(), start.getDate(), start.getDay()]).toEqual([2026, 9, 19, 1]);
  });

  it("spreads training days through the week", () => {
    expect(spreadDays(3)).toEqual([1, 3, 5]);
    expect(spreadDays(2)).toEqual([1, 4]);
  });

  it("reads the model's JSON, fenced or not, and drops junk", () => {
    expect(readGrid("```json\n" + JSON.stringify(GRID) + "\n```")?.days[0].exercises).toHaveLength(5);
    expect(readGrid("not json")).toBeNull();
    expect(readGrid(JSON.stringify({ days: [{ name: "x", exercises: [] }] }))).toBeNull();
  });
});
