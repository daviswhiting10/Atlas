import { describe, expect, it } from "vitest";
import { addSuggestion, coreGaps, planEquipment, rangeAddedLines, savedRange } from "./plan-rules";
import { parseSetsReps, planFromGrid, readGrid, type GridExercise, type SheetGrid } from "./sheet-plan";
import { foundInFile } from "./extract";
import { summarizeSheetImport } from "./sheet-summary";

const rx = (cell: string, name = "Goblet Squat") => savedRange(parseSetsReps(cell, name)!, name);
const row = (name: string, cells: string[], extra: Partial<GridExercise> = {}): GridExercise => ({ name, weeks: cells.map((setsReps, i) => ({ week: i + 1, setsReps, load: "" })), ...extra });

describe("savedRange: a lone number widens down, a written range is kept", () => {
  it("widens reps two below the number written", () => {
    expect(rx("3x10")).toEqual({ repMin: 8, repMax: 10, note: null, added: true });
    expect(rx("3x6")).toMatchObject({ repMin: 4, repMax: 6, added: true });
    expect(rx("2x15")).toMatchObject({ repMin: 13, repMax: 15, added: true });
  });
  it("widens timed work by 15 s", () => {
    expect(rx("3x45 s", "Plank")).toEqual({ repMin: 30, repMax: 45, note: null, added: true });
  });
  it("keeps a written range exactly, however it is written", () => {
    for (const cell of ["3x8-10", "3 x 8 to 10", "3×8–10"]) expect(rx(cell)).toEqual({ repMin: 8, repMax: 10, note: null, added: false });
  });
  it("keeps 3×5 and 5×5 fixed, with the note", () => {
    expect(rx("3x5", "Back Squat")).toEqual({ repMin: 5, repMax: 5, note: "fixed: 3×5", added: false });
    expect(rx("5x5", "Back Squat")).toMatchObject({ note: "fixed: 5×5" });
  });
  it("leaves cardio, mobility, distances and long durations as written", () => {
    expect(rx("20 min", "Zone 2 bike")).toMatchObject({ repMin: 1200, repMax: 1200, note: null, added: false });
    expect(rx("4x20 yd", "Sled push")).toMatchObject({ repMin: 20, added: false, note: null });
    expect(rx("4x20 yd", "Farmer carry")).toMatchObject({ repMin: 20, added: false, note: null });
    expect(rx("2x30 s", "Hip flexor stretch")).toMatchObject({ repMin: 30, added: false, note: null });
    expect(rx("5 min", "Plank complex")).toMatchObject({ repMin: 300, added: false, note: null });
  });
});

const grid: SheetGrid = {
  days: [
    { name: "Day 1", exercises: [row("Back Squat", ["3x5", "3x5"]), row("Goblet Squat", ["3x10", "3x10"]), row("Dead bug", ["3x8-10", "3x8-10"])] },
    { name: "Day 2", exercises: [row("Barbell Bench Press", ["3x8-10", "3x8-10"]), row("Lat Pulldown", ["3x12", "3x12"]), row("Couch stretch", ["1x60 s", "1x60 s"], { label: "Cool-down" })] },
    { name: "Day 3", exercises: [row("Assault Bike", ["20 min", "20 min"])] },
    { name: "Day 4", exercises: [row("Romanian Deadlift", ["3x8-10", "3x8-10"]), row("Suitcase Carry", ["3x40 yd", "3x40 yd"])] },
  ],
};

describe("the import preview", () => {
  it("flags each widened exercise as range added, once, in the uncertain list", () => {
    expect(rangeAddedLines(grid)).toEqual(["Day 1 · Goblet Squat: range added, 10 → 8–10", "Day 2 · Lat Pulldown: range added, 12 → 10–12"]);
    expect(foundInFile({ ...grid, uncertain: ["Day 1 · Back Squat: rest"] }).uncertain).toEqual([
      "Day 1 · Back Squat: rest",
      "Day 1 · Goblet Squat: range added, 10 → 8–10",
      "Day 2 · Lat Pulldown: range added, 12 → 10–12",
    ]);
  });

  it("flags a strength day with no core work, with one suggestion that fits the equipment; a carry counts, a cardio day is exempt", () => {
    expect(coreGaps(grid)).toEqual([{ day: 1, dayName: "Day 2", slug: "plank", name: "Plank", dose: "3 × 30–45 s" }]);
  });

  it("suggests by equipment and rotates the suggestion across days", () => {
    const db: SheetGrid = { days: [{ name: "A", exercises: [row("Dumbbell Bench Press", ["3x10"])] }, { name: "B", exercises: [row("DB Row", ["3x10"])] }] };
    expect(planEquipment(db)).toBe("dumbbells");
    expect(coreGaps(db).map((g) => g.name)).toEqual(["Plank", "Dead Bug"]);
    expect(planEquipment({ days: [{ name: "A", exercises: [row("Push-up", ["3x10"])] }] })).toBe("bodyweight");
    expect(planEquipment(grid)).toBe("gym");
  });
});

describe("accepting the core suggestion", () => {
  it("is the only way it is added: nothing changes until accepted", () => {
    expect(planFromGrid(grid).weeks[0].days[1].entries.map((e) => e.exercise)).toEqual(["Barbell Bench Press", "Lat Pulldown", "Couch stretch"]);
  });

  it("adds it to that day, every week, before the cool-down, as a written range, marked added", () => {
    const g = addSuggestion(grid, 1, "plank");
    expect(g.days[1].exercises.map((e) => e.name)).toEqual(["Barbell Bench Press", "Lat Pulldown", "Plank", "Couch stretch"]);
    expect(g.days[1].exercises[2]).toEqual({ name: "Plank", added: true, weeks: [{ week: 1, setsReps: "3x30-45 s", load: "" }, { week: 2, setsReps: "3x30-45 s", load: "" }] });
    expect(g.days[0]).toBe(grid.days[0]);
    expect(coreGaps(g)).toEqual([]);
    expect(rangeAddedLines(g)).toEqual(rangeAddedLines(grid));
    const entry = planFromGrid(g).weeks[1].days[1].entries[2];
    expect(entry).toMatchObject({ exercise: "Plank", added: true, section: "block:3" });
    expect(savedRange(entry.rx, entry.exercise)).toEqual({ repMin: 30, repMax: 45, note: null, added: false });
  });

  it("survives the save step's checks, and is never counted as history", () => {
    const logged: SheetGrid = { days: [{ name: "Day 1", exercises: [row("Barbell Bench Press", ["3x8-10"]), row("Lat Pulldown", ["3x12"])] }] };
    logged.days[0].exercises[0].weeks[0].load = "135";
    const g = readGrid(JSON.stringify(addSuggestion(logged, 0, "plank")))!;
    expect(g.days[0].exercises[2].added).toBe(true);
    const summary = summarizeSheetImport({ grid: g, today: new Date("2026-11-25T12:00:00") });
    expect(summary.history.sets).toBe(6);
  });
});
