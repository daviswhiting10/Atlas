import { describe, expect, it } from "vitest";
import { conflictMessage, replayConflict } from "./replay";

describe("replayConflict: an offline tick arriving late", () => {
  it("no conflict when the server still has what the phone last saw", () => {
    expect(replayConflict(false, null)).toBe(false); // never saved, still no row
    expect(replayConflict(false, { completed: false })).toBe(false);
    expect(replayConflict(true, { completed: true })).toBe(false);
  });
  it("conflict when the other device ticked it in the meantime", () => {
    expect(replayConflict(false, { completed: true })).toBe(true);
  });
  it("conflict when the other device un-ticked it (or there is no row any more)", () => {
    expect(replayConflict(true, { completed: false })).toBe(true);
    expect(replayConflict(true, null)).toBe(true);
  });
  it("says which set", () => {
    expect(conflictMessage(3)).toBe("Set 3 was changed on another device. Showing that version.");
  });
});
