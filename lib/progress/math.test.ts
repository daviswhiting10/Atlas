import { describe, it, expect } from "vitest";
import {
  e1RM,
  bestE1RM,
  isEnduranceSet,
  sessionVolume,
  weightTrendEMA,
  strengthComposite,
  weekStart,
  type SetRecord,
} from "./math";

// ── e1RM ─────────────────────────────────────────────────────────────────────

describe("e1RM", () => {
  it("computes Epley for standard set", () => {
    // 100 lb × 10 reps → 100 * (1 + 10/30) = 133.33
    expect(e1RM(100, 10)).toBeCloseTo(133.33, 1);
  });

  it("caps reps at 12 for high-rep sets", () => {
    // 100 lb × 20 reps should equal 100 lb × 12 reps
    expect(e1RM(100, 20)).toBeCloseTo(e1RM(100, 12), 5);
  });

  it("returns weight itself at 1 rep", () => {
    expect(e1RM(225, 1)).toBeCloseTo(225 * (1 + 1 / 30), 5);
  });
});

// ── bestE1RM ──────────────────────────────────────────────────────────────────

describe("bestE1RM", () => {
  it("returns null for empty sets", () => {
    expect(bestE1RM([])).toBeNull();
  });

  it("returns null for bodyweight-only sets", () => {
    const sets: SetRecord[] = [{ weight: null, reps: 10, completed: true }];
    expect(bestE1RM(sets)).toBeNull();
  });

  it("ignores incomplete sets", () => {
    const sets: SetRecord[] = [
      { weight: 200, reps: 5, completed: false },
      { weight: 135, reps: 10, completed: true },
    ];
    expect(bestE1RM(sets)).toBeCloseTo(e1RM(135, 10), 5);
  });

  it("returns the best (highest) e1RM across sets", () => {
    const sets: SetRecord[] = [
      { weight: 100, reps: 10, completed: true },  // e1RM 133.3
      { weight: 120, reps: 5,  completed: true },  // e1RM 140.0
      { weight: 80,  reps: 12, completed: true },  // e1RM 112.0
    ];
    expect(bestE1RM(sets)).toBeCloseTo(e1RM(120, 5), 5);
  });

  it("ignores sets with 0 reps", () => {
    const sets: SetRecord[] = [
      { weight: 100, reps: 0, completed: true },
      { weight: 50,  reps: 8, completed: true },
    ];
    expect(bestE1RM(sets)).toBeCloseTo(e1RM(50, 8), 5);
  });
});

// ── isEnduranceSet ────────────────────────────────────────────────────────────

describe("isEnduranceSet", () => {
  it("returns false for ≤ 12 reps", () => {
    expect(isEnduranceSet(12)).toBe(false);
    expect(isEnduranceSet(5)).toBe(false);
  });

  it("returns true for > 12 reps", () => {
    expect(isEnduranceSet(13)).toBe(true);
    expect(isEnduranceSet(20)).toBe(true);
  });
});

// ── sessionVolume ─────────────────────────────────────────────────────────────

describe("sessionVolume", () => {
  it("returns 0 for empty sets", () => {
    expect(sessionVolume([])).toBe(0);
  });

  it("skips bodyweight sets", () => {
    const sets: SetRecord[] = [{ weight: null, reps: 10, completed: true }];
    expect(sessionVolume(sets)).toBe(0);
  });

  it("skips incomplete sets", () => {
    const sets: SetRecord[] = [{ weight: 100, reps: 10, completed: false }];
    expect(sessionVolume(sets)).toBe(0);
  });

  it("sums weight × reps for all completed weighted sets", () => {
    const sets: SetRecord[] = [
      { weight: 100, reps: 10, completed: true },  // 1000
      { weight: 120, reps: 8,  completed: true },  // 960
      { weight: null, reps: 10, completed: true }, // 0 (BW)
    ];
    expect(sessionVolume(sets)).toBe(1960);
  });
});

// ── weightTrendEMA ─────────────────────────────────────────────────────────────

describe("weightTrendEMA", () => {
  it("returns empty for empty input", () => {
    expect(weightTrendEMA([])).toHaveLength(0);
  });

  it("returns single reading with EMA = weight", () => {
    const readings = [{ date: new Date("2024-01-01"), weightKg: 80 }];
    const result = weightTrendEMA(readings);
    expect(result).toHaveLength(1);
    expect(result[0].ema).toBeCloseTo(80, 5);
  });

  it("EMA smooths out noise", () => {
    const readings = [
      { date: new Date("2024-01-01"), weightKg: 80 },
      { date: new Date("2024-01-02"), weightKg: 82 }, // spike
      { date: new Date("2024-01-03"), weightKg: 80 },
    ];
    const result = weightTrendEMA(readings, 7);
    // EMA should be between 80 and 82
    expect(result[1].ema).toBeGreaterThan(80);
    expect(result[1].ema).toBeLessThan(82);
  });

  it("sorts readings by date regardless of input order", () => {
    const readings = [
      { date: new Date("2024-01-03"), weightKg: 79 },
      { date: new Date("2024-01-01"), weightKg: 81 },
      { date: new Date("2024-01-02"), weightKg: 80 },
    ];
    const result = weightTrendEMA(readings);
    expect(result[0].date).toEqual(new Date("2024-01-01"));
  });
});

// ── strengthComposite ─────────────────────────────────────────────────────────

describe("strengthComposite", () => {
  it("returns null for empty input", () => {
    expect(strengthComposite([])).toBeNull();
  });

  it("returns null when all baselines are null", () => {
    expect(strengthComposite([{ baselineE1RM: null, currentE1RM: 100 }])).toBeNull();
  });

  it("computes correct % change for a single lift", () => {
    // baseline 100 → current 110 → 10%
    expect(strengthComposite([{ baselineE1RM: 100, currentE1RM: 110 }])).toBeCloseTo(10, 5);
  });

  it("averages across multiple lifts", () => {
    // 10% + 20% → avg 15%
    expect(
      strengthComposite([
        { baselineE1RM: 100, currentE1RM: 110 },
        { baselineE1RM: 200, currentE1RM: 240 },
      ])
    ).toBeCloseTo(15, 5);
  });
});

// ── weekStart ─────────────────────────────────────────────────────────────────

describe("weekStart", () => {
  it("returns the Monday for a Wednesday", () => {
    const wed = new Date("2024-01-10T12:00:00Z"); // Wednesday
    const mon = weekStart(wed);
    expect(mon.getUTCDay()).toBe(1);
    expect(mon.toISOString().slice(0, 10)).toBe("2024-01-08");
  });

  it("returns itself for a Monday", () => {
    const mon = new Date("2024-01-08T00:00:00Z");
    expect(weekStart(mon).toISOString().slice(0, 10)).toBe("2024-01-08");
  });

  it("returns the Monday for a Sunday", () => {
    const sun = new Date("2024-01-14T12:00:00Z");
    expect(weekStart(sun).toISOString().slice(0, 10)).toBe("2024-01-08");
  });
});
