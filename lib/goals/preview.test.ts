import { describe, expect, it } from "vitest";
import { confirmStart, previewStart } from "./preview";

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

describe("confirmStart (the server's check that the button told the truth)", () => {
  it("accepts when the day number shown matches: Nov 4 start, Nov 15 is Day 12", () => {
    expect(confirmStart("2026-11-04", "2026-11-15", 75, 12)).toEqual({ ok: true, carriedDays: 11, dayOfGoal: 12 });
    expect(confirmStart("2026-11-15", "2026-11-15", 75, 1)).toEqual({ ok: true, carriedDays: 0, dayOfGoal: 1 });
  });
  it("refuses the Nov 15 case: the field committed Nov 4 but the button still said Day 1", () => {
    const r = confirmStart("2026-11-04", "2026-11-15", 75, 1);
    expect(r).toEqual({ ok: false, error: "That start day makes today Day 12, not Day 1. Check the start day and tap Start again." });
  });
  it("refuses the reverse too: the button said Day 12 but today's date arrived", () => {
    expect(confirmStart("2026-11-15", "2026-11-15", 75, 12).ok).toBe(false);
  });
  it("refuses when the day turned over between showing and saving", () => {
    // Shown at 11:59 pm on Nov 14 as Day 11; saved after midnight, when it's Day 12.
    expect(confirmStart("2026-11-04", "2026-11-15", 75, 11).ok).toBe(false);
  });
  it("still applies the start-day rules first", () => {
    expect(confirmStart("2026-11-16", "2026-11-15", 75, 1)).toEqual({ ok: false, error: "The start day can't be in the future." });
    expect(confirmStart("junk", "2026-11-15", 75, 1).ok).toBe(false);
  });
});
