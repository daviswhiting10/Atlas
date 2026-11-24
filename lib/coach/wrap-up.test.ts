import { describe, expect, it } from "vitest";
import { compareWithLast, medalsOf, volumeOf, type WrapSet } from "./wrap-up";

const s = (exerciseId: string, weight: number | null, reps: number | null, name = exerciseId): WrapSet => ({ exerciseId, name, weight, reps });

describe("volume", () => {
  it("weight times reps, over sets that have both", () => {
    expect(volumeOf([s("a", 100, 5), s("a", 100, 5), s("b", null, 12), s("c", 0, 10)])).toBe(1000);
  });
});

describe("against last time", () => {
  const cur = [s("a", 100, 10), s("a", 100, 10), s("a", 100, 10)];
  const prev = [s("a", 100, 10), s("a", 100, 10)];
  it("volume change in whole percent, sets now and last", () => {
    expect(compareWithLast(cur, prev, 3)).toEqual({ volumePct: 50, done: 3, lastDone: 2, skipped: 0 });
  });
  it("never done before (or nothing logged then): nothing to compare, so no card", () => {
    expect(compareWithLast(cur, null, 3)).toBeNull();
    expect(compareWithLast(cur, [], 3)).toBeNull();
  });
  it("a plan we can't count leaves skipped out; skipped is never negative", () => {
    expect(compareWithLast(cur, prev, null)?.skipped).toBeNull();
    expect(compareWithLast(cur, prev, 2)?.skipped).toBe(0);
    expect(compareWithLast(cur.slice(0, 1), prev, 3)?.skipped).toBe(2);
  });
  it("no weights to compare (bodyweight work): sets only, no percent", () => {
    expect(compareWithLast([s("a", null, 10)], [s("a", null, 8)], 1)?.volumePct).toBeNull();
  });
  it("a lighter session says so: a negative percent", () => {
    expect(compareWithLast(prev, cur, 3)?.volumePct).toBe(-33);
  });
});

describe("medals: a lift's heaviest weight beat its earlier best", () => {
  const before = new Map([["bench", 180], ["row", 165]]);
  it("lists the lifts that went up, by how much, biggest first", () => {
    const m = medalsOf([s("bench", 185, 5, "Bench Press"), s("bench", 175, 8, "Bench Press"), s("row", 175, 8, "Row")], before);
    expect(m).toEqual([{ name: "Row", weight: 175, delta: 10 }, { name: "Bench Press", weight: 185, delta: 5 }]);
  });
  it("matching the best, or lighter, is not a record", () => {
    expect(medalsOf([s("bench", 180, 5)], before)).toEqual([]);
  });
  it("a lift never done before is not a record", () => {
    expect(medalsOf([s("curl", 40, 10)], before)).toEqual([]);
  });
  it("bodyweight sets have no weight to beat", () => {
    expect(medalsOf([s("bench", null, 20)], before)).toEqual([]);
  });
});
