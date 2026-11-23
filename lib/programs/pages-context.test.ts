import { describe, expect, it } from "vitest";
import { NO_CONTEXT, contextFromText, pagesContext } from "./plan-context";
import { summarizeSheetImport } from "./sheet-summary";

const grid = {
  days: [{ name: "Day 1", exercises: [{ name: "Bench", weeks: [1, 2, 3, 4].map((week) => ({ week, setsReps: "3x8", load: String(130 + week * 5) })) }] }],
};
const today = new Date("2026-11-23T12:00:00");

describe("a coach's PDF or screenshots: where the plan starts", () => {
  it("without a note: week 1, nothing marked done", () => {
    const ctx = pagesContext(NO_CONTEXT);
    expect(ctx.startAtWeek).toBe(1);
    const s = summarizeSheetImport({ grid, context: ctx, today });
    expect(s.completedWeeks).toBe(0);
    expect(s.readAs).toContain("starting at week 1");
  });
  it("a note saying 'start at week 3' overrides it, and the preview says so", () => {
    const noted = contextFromText("start at week 3");
    expect(noted.startAtWeek).toBe(3);
    const ctx = pagesContext(noted);
    expect(ctx.startAtWeek).toBe(3);
    const s = summarizeSheetImport({ grid, context: ctx, today });
    expect(s.completedWeeks).toBe(2); // the preview line: "Starts at week 3"
    expect(s.readAs).toContain("starting at week 3");
  });
});
