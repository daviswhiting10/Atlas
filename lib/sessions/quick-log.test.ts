import { describe, expect, it } from "vitest";
import { QuickSessionInput, cleanSession, describeLast, matchesTokens, prefillSets, searchTokens } from "./quick-log";

const base = { date: "2026-11-13", exercises: [] as unknown[] };

describe("QuickSessionInput", () => {
  it("lets a workout with no exercises through only with a name and a time", () => {
    expect(QuickSessionInput.safeParse(base).success).toBe(false);
    expect(QuickSessionInput.safeParse({ ...base, title: "Walk" }).success).toBe(false);
    expect(QuickSessionInput.safeParse({ ...base, durationMin: 45 }).success).toBe(false);
    expect(QuickSessionInput.safeParse({ ...base, title: "Walk", durationMin: 45 }).success).toBe(true);
    expect(QuickSessionInput.safeParse({ ...base, title: "  ", durationMin: 45 }).success).toBe(false);
    expect(cleanSession(QuickSessionInput.parse({ ...base, title: "Walk", durationMin: 45 }))).toMatchObject({ exercises: [], totalSets: 0, title: "Walk", durationMin: 45 });
  });

  it("needs a real day", () => {
    const one = { ...base, exercises: [{ exerciseId: null, name: "Sled push", sets: [{ weight: null, reps: 3, band: null }] }] };
    expect(QuickSessionInput.safeParse(one).success).toBe(true);
    expect(QuickSessionInput.safeParse({ ...one, date: "11/13/2026" }).success).toBe(false);
  });

  it("refuses silly numbers and unknown bands", () => {
    const bad = (s: object) => QuickSessionInput.safeParse({ ...base, exercises: [{ exerciseId: "x", name: "Squat", sets: [{ weight: null, reps: 5, band: null, ...s }] }] }).success;
    expect(bad({ weight: -5 })).toBe(false);
    expect(bad({ weight: 99999 })).toBe(false);
    expect(bad({ band: "pink" })).toBe(false);
    expect(bad({ band: "blue" })).toBe(true);
  });
});

describe("cleanSession", () => {
  it("keeps sets with reps, drops empty rows and empty exercises", () => {
    const out = cleanSession(
      QuickSessionInput.parse({
        ...base,
        title: "  ",
        exercises: [
          { exerciseId: "a", name: " Goblet   Squat ", sets: [{ weight: 45, reps: 10, band: null }, { weight: 45, reps: null, band: null }, { weight: 0, reps: 8.4, band: null }] },
          { exerciseId: null, name: "Sled push", sets: [{ weight: null, reps: null, band: null }] },
        ],
      })
    );
    expect(out.exercises).toEqual([{ exerciseId: "a", name: "Goblet Squat", sets: [{ weight: 45, reps: 10, band: null }, { weight: null, reps: 8, band: null }] }]);
    expect(out.totalSets).toBe(2);
    expect(out.title).toBeNull();
  });
});

describe("search", () => {
  it("expands coach shorthand", () => {
    expect(searchTokens("DB ro")).toEqual(["dumbbell", "ro"]);
    expect(searchTokens("kb swing")).toEqual(["kettlebell", "swing"]);
    expect(searchTokens("rdl")).toEqual(["romanian", "deadlift"]);
  });

  it("finds names containing every word", () => {
    const t = searchTokens("db ro");
    expect(matchesTokens("Dumbbell Row", t)).toBe(true);
    expect(matchesTokens("Dumbbell Romanian Deadlift", t)).toBe(true);
    expect(matchesTokens("Dumbbell Bench Press", t)).toBe(false);
    expect(matchesTokens("Anything", [])).toBe(false);
  });
});

describe("last time", () => {
  const s = (reps: number | null, weight: number | null = null, band: null | "blue" = null) => ({ reps, weight, band });

  it("describes it the way a coach writes it", () => {
    expect(describeLast({ date: "2026-11-06", unit: "reps", sets: [s(10, 45), s(10, 45), s(10, 45)] })).toBe("3 × 10 @ 45 lb");
    expect(describeLast({ date: "2026-11-06", unit: "reps", sets: [s(10, 40), s(8, 45), s(6, 50)] })).toBe("10, 8, 6 @ 40–50 lb");
    expect(describeLast({ date: "2026-11-06", unit: "secs", sets: [s(45), s(45), s(45)] })).toBe("3 × 45 s");
    expect(describeLast({ date: "2026-11-06", unit: "reps", sets: [s(12, null, "blue"), s(12, null, "blue")] })).toBe("2 × 12 · blue band");
    expect(describeLast({ date: "2026-11-06", unit: "reps", sets: [s(15), s(12)] })).toBe("15, 12");
  });

  it("prefills as many sets as last time, or 3 empty rows", () => {
    expect(prefillSets(null)).toEqual([s(null), s(null), s(null)]);
    expect(prefillSets({ date: "2026-11-06", unit: "reps", sets: [s(10, 45), s(8, 50)] })).toEqual([s(10, 45), s(8, 50)]);
    expect(prefillSets({ date: "2026-11-06", unit: "reps", sets: [s(null, 45)] })).toHaveLength(3);
  });
});
