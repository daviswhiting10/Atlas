import { describe, expect, it } from "vitest";
import { detectPlateau, holdStreak, type PlateauSession } from "./plateau";

const TODAY = "2026-11-10";
const s = (date: string, topWeight: number | null, bestE1RM: number | null, extra: Partial<PlateauSession> = {}): PlateauSession => ({
  date,
  topWeight,
  bestE1RM,
  repsAtTop: 8,
  ...extra,
});

describe("detectPlateau", () => {
  it("flags exactly three flat sessions", () => {
    const r = detectPlateau([s("2026-10-27", 150, 190), s("2026-11-03", 150, 190), s("2026-11-09", 150, 190)], TODAY);
    expect(r).toMatchObject({ plateaued: true, sessionsConsidered: 3, daysCovered: 13, currentBestE1RM: 190 });
  });

  it("does not flag when the third session improves", () => {
    const r = detectPlateau([s("2026-10-27", 150, 190), s("2026-11-03", 150, 190), s("2026-11-09", 155, 196)], TODAY);
    expect(r.plateaued).toBe(false);
    expect(r.lastImprovementDate).toBe("2026-11-09");
  });

  it("counts an estimated-max gain at the same weight as improvement", () => {
    expect(detectPlateau([s("2026-10-27", 150, 190), s("2026-11-03", 150, 195), s("2026-11-09", 150, 195)], TODAY).plateaued).toBe(false);
  });

  it("counts more reps at the same weight as improvement, even past the 12-rep cap on estimated max", () => {
    const flat1rm = 196; // 140 lb for 12+ reps estimates the same max however many reps are done
    const sessions = [
      s("2026-10-27", 140, flat1rm, { repsAtTop: 12 }),
      s("2026-11-03", 140, flat1rm, { repsAtTop: 13 }),
      s("2026-11-09", 140, flat1rm, { repsAtTop: 14 }),
    ];
    expect(detectPlateau(sessions, TODAY).plateaued).toBe(false);
  });

  it("leaves a lighter-week session out of the streak", () => {
    // The dip on Nov 3 is a planned back-off. Without the exclusion the last
    // three would be [flat, dip, flat] and still read as a stall for the wrong reason.
    const sessions = [
      s("2026-10-20", 150, 190),
      s("2026-10-27", 155, 196),
      s("2026-11-03", 155, 180, { deload: true }),
      s("2026-11-09", 155, 196),
    ];
    const r = detectPlateau(sessions, TODAY);
    expect(r.sessionsConsidered).toBe(3);
    expect(r.plateaued).toBe(false); // Oct 27 beat Oct 20 inside the counted three
  });

  it("does not let a lighter week hide a real stall", () => {
    const sessions = [
      s("2026-10-20", 155, 196),
      s("2026-10-27", 155, 196),
      s("2026-11-03", 155, 180, { deload: true }),
      s("2026-11-09", 155, 196),
    ];
    expect(detectPlateau(sessions, TODAY).plateaued).toBe(true);
  });

  it("reports insufficient data with fewer than three counted sessions", () => {
    expect(detectPlateau([s("2026-11-03", 150, 190), s("2026-11-09", 150, 190)], TODAY)).toMatchObject({ plateaued: null, sessionsConsidered: 2 });
    expect(detectPlateau([], TODAY)).toMatchObject({ plateaued: null, sessionsConsidered: 0, currentBestE1RM: null, lastImprovementDate: null });
  });

  it("reports insufficient data when the lift has not been trained in the last 21 days", () => {
    const old = [s("2026-09-01", 150, 190), s("2026-09-08", 150, 190), s("2026-09-15", 150, 190)];
    expect(detectPlateau(old, TODAY).plateaued).toBeNull();
  });

  it("ignores bodyweight sessions, which have no load to compare", () => {
    const bw = [s("2026-10-27", null, null), s("2026-11-03", null, null), s("2026-11-09", null, null)];
    expect(detectPlateau(bw, TODAY)).toMatchObject({ plateaued: null, sessionsConsidered: 0 });
  });

  it("sorts sessions itself", () => {
    const r = detectPlateau([s("2026-11-09", 155, 196), s("2026-10-27", 150, 190), s("2026-11-03", 150, 190)], TODAY);
    expect(r.plateaued).toBe(false);
  });
});

describe("holdStreak", () => {
  it("counts trailing holds only", () => {
    expect(holdStreak(["progress", "hold", "hold"])).toBe(2);
    expect(holdStreak(["hold", "hold", "progress"])).toBe(0);
    expect(holdStreak([])).toBe(0);
  });
});
