import { describe, it, expect } from "vitest";
import { suggestNext, type SetRecord } from "./progression";

// ── Helpers ────────────────────────────────────────────────────────────────────

function sets(
  records: Array<{ weight?: number | null; reps?: number | null; rpe?: number | null; completed?: boolean }>
): SetRecord[] {
  return records.map((r) => ({
    weight: r.weight ?? null,
    reps: r.reps ?? null,
    rpe: r.rpe ?? null,
    completed: r.completed ?? true,
  }));
}

const PRESCRIBED = 8; // default prescribed reps for tests

// ── Edge cases ────────────────────────────────────────────────────────────────

describe("no history", () => {
  it("returns first_time when lastSets is empty", () => {
    const result = suggestNext({ lastSets: [], prescribedReps: PRESCRIBED, goal: "hypertrophy", exerciseLoadType: "upper" });
    expect(result.type).toBe("first_time");
    expect(result.weight).toBeNull();
    expect(result.reps).toBeNull();
    expect(result.reasoning).toMatch(/first time/i);
  });
});

describe("deload after RPE 10", () => {
  it("drops ~10% (upper) when any set hit RPE 10", () => {
    const result = suggestNext({
      lastSets: sets([{ weight: 100, reps: 8, rpe: 10 }, { weight: 100, reps: 7, rpe: 9 }]),
      prescribedReps: PRESCRIBED,
      goal: "hypertrophy",
      exerciseLoadType: "upper",
    });
    expect(result.type).toBe("deload");
    expect(result.weight).toBe(90); // 100 * 0.9 = 90, rounded to 2.5
    expect(result.reasoning).toMatch(/deload/i);
  });

  it("drops ~10% (lower, rounds to 5 lb) when any set hit RPE 10", () => {
    const result = suggestNext({
      lastSets: sets([{ weight: 185, reps: 5, rpe: 10 }]),
      prescribedReps: 5,
      goal: "performance",
      exerciseLoadType: "lower",
    });
    expect(result.type).toBe("deload");
    expect(result.weight).toBe(165); // 185 * 0.9 = 166.5 → round to 5 → 165
  });
});

describe("RPE missing", () => {
  it("progresses if reps hit but flags RPE not recorded", () => {
    const result = suggestNext({
      lastSets: sets([{ weight: 135, reps: 8, rpe: null }, { weight: 135, reps: 8, rpe: null }]),
      prescribedReps: 8,
      goal: "hypertrophy",
      exerciseLoadType: "upper",
    });
    expect(result.type).toBe("progress");
    expect(result.weight).toBe(137.5);
    expect(result.reasoning).toMatch(/rpe not recorded/i);
  });

  it("holds if reps missed and RPE not recorded", () => {
    const result = suggestNext({
      lastSets: sets([{ weight: 135, reps: 6, rpe: null }, { weight: 135, reps: 5, rpe: null }]),
      prescribedReps: 8,
      goal: "hypertrophy",
      exerciseLoadType: "upper",
    });
    expect(result.type).toBe("hold");
    expect(result.weight).toBe(135);
  });
});

describe("partial reps last time", () => {
  it("holds weight when reps missed even at low RPE", () => {
    const result = suggestNext({
      lastSets: sets([{ weight: 135, reps: 6, rpe: 7 }, { weight: 135, reps: 5, rpe: 6 }]),
      prescribedReps: 8,
      goal: "hypertrophy",
      exerciseLoadType: "upper",
    });
    expect(result.type).toBe("hold");
    expect(result.weight).toBe(135);
    expect(result.reasoning).toMatch(/reps missed/i);
  });
});

// ── Hypertrophy ───────────────────────────────────────────────────────────────

describe("hypertrophy", () => {
  it("adds 2.5 lb (upper) when RPE ≤ 8 and reps hit", () => {
    const result = suggestNext({
      lastSets: sets([{ weight: 100, reps: 8, rpe: 7 }, { weight: 100, reps: 8, rpe: 8 }]),
      prescribedReps: 8,
      goal: "hypertrophy",
      exerciseLoadType: "upper",
    });
    expect(result.type).toBe("progress");
    expect(result.weight).toBe(102.5);
  });

  it("adds 5 lb (lower) when RPE ≤ 8 and reps hit", () => {
    const result = suggestNext({
      lastSets: sets([{ weight: 135, reps: 8, rpe: 7 }]),
      prescribedReps: 8,
      goal: "hypertrophy",
      exerciseLoadType: "lower",
    });
    expect(result.type).toBe("progress");
    expect(result.weight).toBe(140);
  });

  it("holds when RPE > 8 even if reps hit", () => {
    const result = suggestNext({
      lastSets: sets([{ weight: 100, reps: 8, rpe: 9 }, { weight: 100, reps: 8, rpe: 9 }]),
      prescribedReps: 8,
      goal: "hypertrophy",
      exerciseLoadType: "upper",
    });
    expect(result.type).toBe("hold");
    expect(result.weight).toBe(100);
  });

  it("holds when RPE = 8.5", () => {
    const result = suggestNext({
      lastSets: sets([{ weight: 100, reps: 8, rpe: 8.5 }]),
      prescribedReps: 8,
      goal: "hypertrophy",
      exerciseLoadType: "upper",
    });
    expect(result.type).toBe("hold");
  });
});

// ── Fat loss / weight loss ────────────────────────────────────────────────────

describe("weight_loss", () => {
  it("keeps same weight and suggests +1 rep", () => {
    const result = suggestNext({
      lastSets: sets([{ weight: 60, reps: 12, rpe: 7 }, { weight: 60, reps: 12, rpe: 7 }]),
      prescribedReps: 12,
      goal: "weight_loss",
      exerciseLoadType: "upper",
    });
    expect(result.type).toBe("progress");
    expect(result.weight).toBe(60);
    expect(result.reps).toBe(13); // avg 12, +1
  });

  it("still suggests +1 rep even at higher RPE", () => {
    const result = suggestNext({
      lastSets: sets([{ weight: 60, reps: 12, rpe: 9 }]),
      prescribedReps: 12,
      goal: "weight_loss",
      exerciseLoadType: "lower",
    });
    expect(result.weight).toBe(60);
    expect(result.reps).toBe(13);
  });
});

// ── Strength / performance ────────────────────────────────────────────────────

describe("performance (strength)", () => {
  it("adds 5 lb (upper) when RPE ≤ 8 and reps hit", () => {
    const result = suggestNext({
      lastSets: sets([{ weight: 200, reps: 5, rpe: 7 }]),
      prescribedReps: 5,
      goal: "performance",
      exerciseLoadType: "upper",
    });
    expect(result.type).toBe("progress");
    expect(result.weight).toBe(205);
  });

  it("adds 10 lb (lower) when RPE ≤ 8 and reps hit", () => {
    const result = suggestNext({
      lastSets: sets([{ weight: 315, reps: 5, rpe: 8 }]),
      prescribedReps: 5,
      goal: "performance",
      exerciseLoadType: "lower",
    });
    expect(result.type).toBe("progress");
    expect(result.weight).toBe(325);
  });

  it("holds when RPE > 8", () => {
    const result = suggestNext({
      lastSets: sets([{ weight: 315, reps: 5, rpe: 9 }]),
      prescribedReps: 5,
      goal: "performance",
      exerciseLoadType: "lower",
    });
    expect(result.type).toBe("hold");
    expect(result.weight).toBe(315);
  });
});

// ── General fitness / beginner ────────────────────────────────────────────────

describe("general", () => {
  it("adds 2.5 lb when reps hit and RPE ≤ 7", () => {
    const result = suggestNext({
      lastSets: sets([{ weight: 50, reps: 10, rpe: 6 }, { weight: 50, reps: 10, rpe: 7 }]),
      prescribedReps: 10,
      goal: "general",
      exerciseLoadType: "upper",
    });
    expect(result.type).toBe("progress");
    expect(result.weight).toBe(52.5);
  });

  it("holds when RPE = 8 even if reps hit (threshold is 7 for general)", () => {
    const result = suggestNext({
      lastSets: sets([{ weight: 50, reps: 10, rpe: 8 }]),
      prescribedReps: 10,
      goal: "general",
      exerciseLoadType: "upper",
    });
    expect(result.type).toBe("hold");
  });

  it("holds when RPE = 7.5", () => {
    const result = suggestNext({
      lastSets: sets([{ weight: 50, reps: 10, rpe: 7.5 }]),
      prescribedReps: 10,
      goal: "general",
      exerciseLoadType: "upper",
    });
    expect(result.type).toBe("hold");
  });
});

// ── Corrective / pain management ─────────────────────────────────────────────

describe("corrective", () => {
  it("returns match_last regardless of RPE or reps", () => {
    const result = suggestNext({
      lastSets: sets([{ weight: 20, reps: 15, rpe: 4 }]),
      prescribedReps: 15,
      goal: "corrective",
      exerciseLoadType: "upper",
    });
    expect(result.type).toBe("match_last");
    expect(result.weight).toBe(20);
    expect(result.reasoning).toMatch(/match last/i);
  });
});

describe("pain_mgmt", () => {
  it("returns match_last", () => {
    const result = suggestNext({
      lastSets: sets([{ weight: 30, reps: 12, rpe: 5 }]),
      prescribedReps: 12,
      goal: "pain_mgmt",
      exerciseLoadType: "lower",
    });
    expect(result.type).toBe("match_last");
  });
});

// ── Bodyweight ────────────────────────────────────────────────────────────────

describe("bodyweight exercises", () => {
  it("suggests +1 rep when RPE ≤ 8", () => {
    const result = suggestNext({
      lastSets: sets([
        { weight: null, reps: 10, rpe: 7 },
        { weight: null, reps: 10, rpe: 7 },
      ]),
      prescribedReps: 10,
      goal: "hypertrophy",
      exerciseLoadType: "bodyweight",
    });
    expect(result.weight).toBeNull();
    expect(result.reps).toBe(11);
    expect(result.type).toBe("progress");
  });

  it("holds reps when RPE > 8", () => {
    const result = suggestNext({
      lastSets: sets([{ weight: null, reps: 10, rpe: 9 }]),
      prescribedReps: 10,
      goal: "hypertrophy",
      exerciseLoadType: "bodyweight",
    });
    expect(result.type).toBe("hold");
    expect(result.weight).toBeNull();
  });

  it("handles missing RPE for bodyweight", () => {
    const result = suggestNext({
      lastSets: sets([{ weight: null, reps: 15, rpe: null }]),
      prescribedReps: 15,
      goal: "general",
      exerciseLoadType: "bodyweight",
    });
    expect(result.weight).toBeNull();
    expect(result.reps).toBe(16);
    expect(result.reasoning).toMatch(/rpe not recorded/i);
  });
});
