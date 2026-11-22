import { describe, expect, it } from "vitest";
import { parseSetsReps, planFromGrid, setTimeUnit, timedRows, type SheetGrid } from "./sheet-plan";
import { previewFromGrid } from "@/lib/athlete/plan-import";
import { NO_CONTEXT } from "./plan-context";

const grid = (rows: Array<{ name: string; notes?: string; setsReps: string }>): SheetGrid => ({
  days: [{ name: "Day 1", exercises: rows.map((r) => ({ name: r.name, notes: r.notes, weeks: [{ week: 1, setsReps: r.setsReps, load: "" }] })) }],
});

describe("durations are stored in seconds", () => {
  it("min, mins, minutes and ' all become seconds", () => {
    for (const s of ["15 min", "15 mins", "15 minutes", "15 minute", "15min", "15'", "15’"]) {
      expect(parseSetsReps(s), s).toMatchObject({ sets: 1, repMin: 900, repMax: 900, unit: "secs" });
      expect(parseSetsReps(s)?.unclear, s).toBeUndefined();
    }
    expect(parseSetsReps("3x2 min")).toMatchObject({ sets: 3, repMin: 120, unit: "secs" });
    expect(parseSetsReps("20-30 min")).toMatchObject({ repMin: 1200, repMax: 1800, unit: "secs" });
    expect(parseSetsReps('30"')).toMatchObject({ repMin: 30, unit: "secs" });
  });

  it("a row like 'Bike, Zone 2, 15 min' saves 900 seconds, never 15", () => {
    // As the model transcribes it: the name, then the cell.
    const g = grid([{ name: "Bike", setsReps: "Zone 2, 15 min" }]);
    const [e] = planFromGrid(g).weeks[0].days[0].entries;
    expect(e.rx).toMatchObject({ sets: 1, repMin: 900, repMax: 900, unit: "secs", note: "zone 2" });
    expect(e.rx.repMin).not.toBe(15);
    // And with "Zone 2" in the notes column instead.
    const g2 = grid([{ name: "Bike", notes: "Zone 2", setsReps: "15 min" }]);
    expect(planFromGrid(g2).weeks[0].days[0].entries[0].rx).toMatchObject({ repMin: 900, unit: "secs" });
    expect(timedRows(g2)).toEqual([{ day: 0, exercise: 0, name: "Bike", time: "15 min", unclear: false }]);
  });

  it("an unclear unit is read as minutes and flagged for the preview", () => {
    // No unit on a timed exercise.
    expect(parseSetsReps("15", "Bike Zone 2")).toMatchObject({ repMin: 900, unit: "secs", unclear: true });
    // "m": minutes or metres?
    expect(parseSetsReps("15m", "Bike")).toMatchObject({ repMin: 900, unit: "secs", unclear: true });
    // A bare number on a lift is still reps.
    expect(parseSetsReps("15", "Goblet squat")).toMatchObject({ repMin: 15, unit: "reps" });
    expect(parseSetsReps("15", "Goblet squat")?.unclear).toBeUndefined();

    const g = grid([{ name: "Bike", notes: "Zone 2", setsReps: "15" }]);
    expect(timedRows(g)).toEqual([{ day: 0, exercise: 0, name: "Bike", time: "15 min", unclear: true }]);
    expect(previewFromGrid(g, NO_CONTEXT).times).toEqual([{ day: 0, exercise: 0, name: "Bike", time: "15 min", unclear: true }]);
  });

  it("fixing the unit in the preview rewrites the cell", () => {
    const g = grid([{ name: "Bike", setsReps: "15" }]);
    const asSeconds = setTimeUnit(g, 0, 0, "s");
    expect(asSeconds.days[0].exercises[0].weeks[0].setsReps).toBe("15 s");
    expect(planFromGrid(asSeconds).weeks[0].days[0].entries[0].rx).toMatchObject({ repMin: 15, unit: "secs" });
    expect(timedRows(asSeconds)[0]).toMatchObject({ time: "15 s", unclear: false });
    const asMinutes = setTimeUnit(asSeconds, 0, 0, "min");
    expect(planFromGrid(asMinutes).weeks[0].days[0].entries[0].rx).toMatchObject({ repMin: 900, unit: "secs" });
    expect(timedRows(asMinutes)[0].unclear).toBe(false);
  });
});
