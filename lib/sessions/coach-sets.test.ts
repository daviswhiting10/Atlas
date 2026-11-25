import { describe, expect, it } from "vitest";
import { MAX_SETS, rxAt, setCount, setValues } from "./coach-sets";

const set = (o: Partial<Parameters<typeof setValues>[0]> = {}) => ({ weight: "135", isBodyweight: false, isBand: false, bandColor: "green", reps: "8", rpe: "", note: "", completed: true, ...o });

describe("coach logger: sets logged past the plan are shown", () => {
  it("opens with the plan's count when nothing was added", () => {
    expect(setCount(3, [{ setNumber: 1 }, { setNumber: 2 }])).toBe(3);
  });
  it("opens with every logged set when the client did more than planned", () => {
    expect(setCount(3, [{ setNumber: 1 }, { setNumber: 4 }, { setNumber: 5 }])).toBe(5);
  });
  it("an exercise with no prescription still shows its logged sets", () => {
    expect(setCount(0, [{ setNumber: 2 }])).toBe(2);
  });
  it("is capped like the athlete's logger", () => {
    expect(setCount(3, [{ setNumber: 99 }])).toBe(MAX_SETS);
  });
  it("a row past the plan copies the last prescription with its own set number", () => {
    const rx = [{ setNumber: 1, unit: "secs" as const, repMax: 30 }, { setNumber: 2, unit: "secs" as const, repMax: 45 }];
    expect(rxAt(rx, 1, { unit: "secs", repMax: 0 })).toBe(rx[1]);
    expect(rxAt(rx, 3, { unit: "secs", repMax: 0 })).toEqual({ setNumber: 4, unit: "secs", repMax: 45 });
    expect(rxAt([] as Array<{ setNumber: number; repMax: number }>, 0, { repMax: 0 })).toEqual({ setNumber: 1, repMax: 0 });
  });
});

describe("coach logger: leaving a field saves only a real change", () => {
  it("the same values compare equal however they were typed", () => {
    expect(setValues(set())).toBe(setValues(set()));
    expect(setValues(set({ weight: "135.0", note: "  " }))).toBe(setValues(set({ weight: "135", note: "" })));
  });
  it("any field that's sent differs", () => {
    const base = setValues(set());
    for (const o of [{ weight: "140" }, { reps: "9" }, { rpe: "8" }, { note: "grip" }, { completed: false }, { isBodyweight: true }, { isBand: true }, { implements: 2 }, { implements: 1 }])
      expect(setValues(set(o))).not.toBe(base);
  });
  it("per hand is a change: on, off, and off against not recorded", () => {
    expect(setValues(set({ implements: 2 }))).not.toBe(setValues(set({ implements: 1 })));
    expect(setValues(set({ implements: 1 }))).not.toBe(setValues(set({ implements: null })));
    expect(setValues(set({ implements: null }))).toBe(setValues(set()));
  });
  it("a hidden weight or band colour doesn't count", () => {
    expect(setValues(set({ isBodyweight: true, weight: "135" }))).toBe(setValues(set({ isBodyweight: true, weight: "" })));
    expect(setValues(set({ bandColor: "blue" }))).toBe(setValues(set({ bandColor: "green" })));
  });
});
