import { describe, expect, it } from "vitest";
import { compareWithLast, medalsOf, type WrapSet } from "./wrap-up";

const s = (exerciseId: string, weight: number | null, reps: number | null, name = exerciseId): WrapSet => ({ exerciseId, name, weight, reps });


describe("against last time", () => {
  const cur = [s("a", 100, 10), s("a", 100, 10), s("a", 100, 10)];
  const prev = [s("a", 100, 10), s("a", 100, 10)];
  it("volume change in whole percent, sets now and last", () => {
    expect(compareWithLast(cur, prev, 3)).toEqual({ kind: "full", volumePct: 50, done: 3, lastDone: 2, skipped: 0 });
  });
  it("never done before (or nothing logged then): nothing to compare, so no card", () => {
    expect(compareWithLast(cur, null, 3)).toBeNull();
    expect(compareWithLast(cur, [], 3)).toBeNull();
  });
  it("a plan we can't count leaves skipped out", () => {
    expect(compareWithLast(cur, prev, null)).toMatchObject({ kind: "full", skipped: null });
  });
  it("no weights to compare (bodyweight work): sets only, no percent", () => {
    expect(compareWithLast([s("a", null, 10)], [s("a", null, 8)], 1)).toMatchObject({ volumePct: null });
  });
  it("a carry or a plank adds no volume; weighted reps still compare", () => {
    const carry = (reps: number): WrapSet => ({ ...s("carry", 60, reps), timed: true });
    // Last time 2 × 100 × 10 and a 45 s carry; now 3 × 100 × 10 and a 90 s carry: +50%, as without the carries.
    expect(compareWithLast([...cur, carry(90)], [...prev, carry(45)], 4)).toMatchObject({ volumePct: 50 });
    expect(compareWithLast([carry(90)], [carry(45)], 1)).toMatchObject({ volumePct: null });
  });
  it("a lighter finished session says so: a negative percent", () => {
    expect(compareWithLast(prev, cur, 2)).toMatchObject({ volumePct: -33 });
  });
});

describe("a partial session is not compared", () => {
  const sets = (n: number) => Array.from({ length: n }, () => s("a", 100, 10));
  it("under 70% of the planned sets: 'Partial session · 3 of 22 sets', and no percentage or skipped count", () => {
    expect(compareWithLast(sets(3), sets(22), 22)).toEqual({ kind: "partial", done: 3, planned: 22 });
  });
  it("it says so even with nothing earlier to compare with", () => {
    expect(compareWithLast(sets(3), null, 22)).toEqual({ kind: "partial", done: 3, planned: 22 });
  });
  it("70% exactly is a finished session (compared)", () => {
    expect(compareWithLast(sets(7), sets(10), 10)).toMatchObject({ kind: "full" });
  });
  it("just under 70% is partial", () => {
    expect(compareWithLast(sets(15), sets(22), 22)).toMatchObject({ kind: "partial" });
  });
  it("a plan we can't count can't be judged partial", () => {
    expect(compareWithLast(sets(3), sets(22), null)).toMatchObject({ kind: "full" });
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
