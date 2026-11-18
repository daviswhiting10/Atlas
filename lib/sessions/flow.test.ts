import { describe, expect, it } from "vitest";
import { allDone, nextOpen } from "./flow";

describe("logger flow", () => {
  it("is done only when every set of every exercise is logged", () => {
    expect(allDone([[true, true], [true]])).toBe(true);
    expect(allDone([[true, false], [true]])).toBe(false);
    expect(allDone([[true], []])).toBe(true); // an exercise with no sets doesn't hold it open
    expect(allDone([])).toBe(false);
    expect(allDone([[]])).toBe(false);
  });

  it("goes to the next exercise with sets left, then back to one skipped earlier", () => {
    expect(nextOpen([true, false, false], 0)).toBe(1);
    expect(nextOpen([true, true, false], 1)).toBe(2);
    expect(nextOpen([false, true, true], 2)).toBe(0);
    expect(nextOpen([true, true, true], 1)).toBeNull();
    // Skips ones already done ahead of it.
    expect(nextOpen([false, true, true, false], 1)).toBe(3);
  });
});
