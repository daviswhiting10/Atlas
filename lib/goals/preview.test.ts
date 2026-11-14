import { describe, expect, it } from "vitest";
import { previewStart } from "./preview";

describe("previewStart", () => {
  it("counts Nov 4 as day 1, so Nov 13 is day 10 with 9 days from before Atlas", () => {
    expect(previewStart("2026-11-04", "2026-11-13", 75)).toEqual({ ok: true, carriedDays: 9, dayOfGoal: 10 });
  });
  it("starting today is day 1 with nothing carried", () => {
    expect(previewStart("2026-11-13", "2026-11-13", 75)).toEqual({ ok: true, carriedDays: 0, dayOfGoal: 1 });
  });
  it("refuses the future, junk, and a start so old the goal would already be over", () => {
    expect(previewStart("2026-11-14", "2026-11-13", 75).ok).toBe(false);
    expect(previewStart("tomorrow", "2026-11-13", 75).ok).toBe(false);
    expect(previewStart("2026-08-01", "2026-11-13", 75).ok).toBe(false);
  });
  it("the last possible start leaves today as day 75", () => {
    expect(previewStart("2026-09-01", "2026-11-14", 75)).toEqual({ ok: true, carriedDays: 74, dayOfGoal: 75 });
  });
});
