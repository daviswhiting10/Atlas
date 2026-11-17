import { describe, expect, it } from "vitest";
import { dayDate, describeDay, planStart, summarizeSheetImport } from "./sheet-summary";
import type { SheetGrid } from "./sheet-plan";

// Two days, four weeks; weeks 1 and 2 have loads written in (done).
const grid: SheetGrid = {
  days: [
    {
      name: "Day 1",
      exercises: [
        { label: "A", name: "Ski erg", notes: "Warm-up", weeks: [1, 2, 3, 4].map((week) => ({ week, setsReps: "5 min", load: "" })) },
        { label: "A", name: "Goblet squat", weeks: [1, 2, 3, 4].map((week) => ({ week, setsReps: "3x10", load: week <= 2 ? String(20 + week * 5) : "" })) },
        { label: "A", name: "Row", weeks: [1, 2, 3, 4].map((week) => ({ week, setsReps: "3x12", load: week <= 2 ? "40" : "" })) },
        { label: "B", name: "Plank", weeks: [1, 2, 3, 4].map((week) => ({ week, setsReps: "2x30 sec", load: "" })) },
      ],
    },
    {
      name: "Day 2",
      exercises: [{ name: "Deadlift", weeks: [1, 2, 3, 4].map((week) => ({ week, setsReps: "4x5", load: week <= 2 ? "100" : "" })) }],
    },
  ],
};

// Wednesday 2026-11-18.
const today = new Date(2026, 10, 18, 9);

describe("summarizeSheetImport", () => {
  it("counts the completed weeks' sessions and sets, and dates them back from this week", () => {
    const s = summarizeSheetImport({ grid, today });
    expect(s.weeks).toBe(4);
    expect(s.daysPerWeek).toBe(2);
    expect(s.completedWeeks).toBe(2);
    expect(s.readAs).toBe("4 weeks · 2 days a week · starting at week 3");
    // Week 3 is this week (Mon Nov 16), so week 1 began Nov 2. Day 1 is Mon, Day 2 Thu.
    expect(s.weekOneStart).toBe("2026-11-02");
    // Day 1: ski erg 1 + squat 3 + row 3 + plank 2 = 9 sets; Day 2: 4 sets. Two weeks.
    expect(s.history).toEqual({
      sessions: 4,
      sets: 26,
      from: "2026-11-02",
      to: "2026-11-12",
      perWeek: [
        { week: 1, sessions: 2, sets: 13 },
        { week: 2, sessions: 2, sets: 13 },
      ],
    });
  });

  it("shows each day's structure from the sheet's labels", () => {
    const s = summarizeSheetImport({ grid, today });
    expect(s.days).toEqual([
      { name: "Day 1", warmup: 1, blocks: [2, 1], cooldown: 0 },
      { name: "Day 2", warmup: 0, blocks: [1], cooldown: 0 },
    ]);
    expect(describeDay(s.days[0])).toBe("Warm-up 1 · Block 1 (2) · Block 2 (1) · Cool-down none");
  });

  it("follows the coach's note: starting fresh imports no history", () => {
    const s = summarizeSheetImport({ grid, today, context: { durationWeeks: null, trainingDays: null, startAtWeek: 1 } });
    expect(s.completedWeeks).toBe(0);
    expect(s.history.sessions).toBe(0);
    expect(s.history.from).toBeNull();
  });

  it("uses the coach's week-1 date when given", () => {
    const s = summarizeSheetImport({ grid, today, weekOneStart: new Date(2026, 9, 5) });
    expect(s.weekOneStart).toBe("2026-10-05");
    expect(s.history.from).toBe("2026-10-05");
  });
});

describe("planStart and dayDate", () => {
  it("starts today when nothing is done, and puts a workout on its week and weekday at noon", () => {
    expect(planStart(0, null, today).getDate()).toBe(18);
    const d = dayDate(new Date(2026, 10, 2), 2, 4);
    expect([d.getMonth(), d.getDate(), d.getHours()]).toEqual([10, 12, 12]);
  });
});
