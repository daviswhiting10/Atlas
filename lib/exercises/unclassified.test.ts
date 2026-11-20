import { describe, expect, it } from "vitest";
import { countsTowardVolume, exerciseGroup } from "./muscles";
import { groupLookup, weeklyHardSets } from "@/lib/history/volume";
import { onDays, sess, set, UTC } from "@/lib/history/fixtures";

/** A typed exercise has no muscles. It must be unclassified, never an error. */
describe("an exercise with no muscle data", () => {
  it("has no group, and so doesn't count toward volume", () => {
    expect(exerciseGroup([])).toBeNull();
    expect(exerciseGroup(null)).toBeNull();
    expect(exerciseGroup(undefined)).toBeNull();
    expect(countsTowardVolume(exerciseGroup([]))).toBe(false);
  });
  it("is looked up as unclassified, alongside classified ones", () => {
    const groupOf = groupLookup([{ id: "typed", primaryMuscles: [] }, { id: "bench", primaryMuscles: ["chest"] }]);
    expect(groupOf("typed")).toBeNull();
    expect(groupOf("bench")).toBe("Chest");
    expect(groupOf("missing")).toBeNull();
    expect(groupOf(null)).toBeNull();
  });
  it("weekly volume keeps its numbers and reports the typed exercise's sets as unassigned", () => {
    const groupOf = groupLookup([{ id: "typed", primaryMuscles: [] }, { id: "bench", primaryMuscles: ["chest"] }]);
    const rows = weeklyHardSets([sess("s1", "2026-11-16T12:00:00Z", [set("bench", 100, 5), set("typed", 0, 10), set("typed", 0, 10)])], groupOf, { timeZone: UTC, today: "2026-11-18" });
    expect(rows).toHaveLength(1);
    expect(rows[0].sets.Chest).toBe(1);
    expect(rows[0].total).toBe(1);
    expect(rows[0].unassigned).toBe(2);
  });
  it("a history made only of typed exercises still draws (no rows lost, no throw)", () => {
    const groupOf = groupLookup([{ id: "typed", primaryMuscles: [] }]);
    expect(() => weeklyHardSets(onDays(["2026-11-16"]), groupOf, { timeZone: UTC, today: "2026-11-18" })).not.toThrow();
  });
});
