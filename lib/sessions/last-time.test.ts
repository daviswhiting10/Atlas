import { vi } from "vitest";
vi.hoisted(() => { process.env.DATABASE_URL ??= "postgresql://test:test@localhost:5432/test"; });
import { describe, expect, it } from "vitest";
import { lastSetsByExercise } from "./last-time";

const row = (exerciseId: string | null, day: string, weight: number) => ({ exerciseId, day, weight, reps: 8, rpe: null, completed: true });

describe("lastSetsByExercise", () => {
  it("keeps each exercise's sets from its most recent day only, in set order", () => {
    const out = lastSetsByExercise([row("squat", "2026-11-12", 100), row("squat", "2026-11-12", 105), row("squat", "2026-11-05", 95), row("row", "2026-11-10", 60), row(null, "2026-11-12", 1)]);
    expect(out.get("squat")!.map((s) => s.weight)).toEqual([100, 105]);
    expect(out.get("row")!.map((s) => s.weight)).toEqual([60]);
    expect(out.size).toBe(2);
  });

  it("looks only at an exercise's first 20 rows, like getLastPerformance", () => {
    const rows = Array.from({ length: 25 }, (_, i) => row("plank", "2026-11-12", i));
    expect(lastSetsByExercise(rows).get("plank")).toHaveLength(20);
  });
});
