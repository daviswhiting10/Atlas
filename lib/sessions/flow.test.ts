import { describe, expect, it } from "vitest";
import { FINISH_DELAY_MS, allDone, nextOpen } from "./flow";

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

describe("logger flow: edges", () => {
  it("allDone: exercises with no sets never hold a session open, but never finish one alone", () => {
    expect(allDone([[], [], [true]])).toBe(true);
    expect(allDone([[], [false]])).toBe(false);
    expect(allDone([[], []])).toBe(false);
  });

  it("allDone: one unlogged set anywhere, first or last, keeps it open", () => {
    expect(allDone([[false], [true, true]])).toBe(false);
    expect(allDone([[true, true], [true, false]])).toBe(false);
    expect(allDone([[true]])).toBe(true);
  });

  it("allDone: a session with a single logged set is finished", () => {
    expect(allDone([[true]])).toBe(true);
    expect(allDone([[false]])).toBe(false);
  });

  it("nextOpen: with one exercise there is nowhere to go", () => {
    expect(nextOpen([true], 0)).toBeNull();
    expect(nextOpen([false], 0)).toBeNull(); // itself is not "the next"
  });

  it("nextOpen: no exercises at all", () => {
    expect(nextOpen([], 0)).toBeNull();
    expect(nextOpen([], -1)).toBeNull();
  });

  it("nextOpen: from the last exercise it wraps to the first one skipped, in order", () => {
    expect(nextOpen([true, false, false, true], 3)).toBe(1);
    expect(nextOpen([false, false, true], 2)).toBe(0);
  });

  it("nextOpen: prefers one ahead over one behind, even when the one behind is closer", () => {
    expect(nextOpen([false, true, true, false], 2)).toBe(3);
    expect(nextOpen([false, true, false, true, false], 3)).toBe(4);
  });

  it("nextOpen: with only the current one left open it finds nothing else", () => {
    expect(nextOpen([true, false, true], 1)).toBeNull();
  });

  it("nextOpen: an index outside the list starts from the top rather than failing", () => {
    expect(nextOpen([true, false, false], -1)).toBe(1);
    expect(nextOpen([false, true], 5)).toBe(0);
    expect(nextOpen([true, true], 5)).toBeNull();
  });

  it("does not change what it is given", () => {
    const done = [true, false, false];
    const lists = [[true], [false]];
    nextOpen(done, 0);
    allDone(lists);
    expect(done).toEqual([true, false, false]);
    expect(lists).toEqual([[true], [false]]);
  });

  it("gives the Undo toast a few seconds, not an instant and not a minute", () => {
    expect(FINISH_DELAY_MS).toBeGreaterThanOrEqual(3000);
    expect(FINISH_DELAY_MS).toBeLessThanOrEqual(10_000);
  });
});
