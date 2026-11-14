import { describe, expect, it } from "vitest";
import { HONOLULU, set, sess, TONGA, UTC } from "./fixtures";
import { groupLookup, weeklyHardSets } from "./volume";

const groupOf = groupLookup([
  { id: "sq", primaryMuscles: ["quadriceps"] },
  { id: "bench", primaryMuscles: ["chest", "triceps"] },
  { id: "row", primaryMuscles: ["lats"] },
  { id: "bike", primaryMuscles: ["conditioning"] },
  { id: "stretch", primaryMuscles: ["mobility"] },
  { id: "mystery", primaryMuscles: ["something new"] },
  { id: "empty", primaryMuscles: [] },
]);

describe("weeklyHardSets", () => {
  it("counts each hard set once, toward its exercise's group", () => {
    const rows = weeklyHardSets(
      [sess("s1", "2026-03-03T12:00:00Z", [set("sq", 225, 5), set("sq", 225, 5), set("bench", 185, 5), set("row", 135, 8)])],
      groupOf,
      { timeZone: UTC, today: "2026-03-04" }
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].week).toBe("2026-03-02");
    expect(rows[0].sets.Quads).toBe(2);
    expect(rows[0].sets.Chest).toBe(1); // not also Arms
    expect(rows[0].sets.Arms).toBe(0);
    expect(rows[0].sets.Back).toBe(1);
    expect(rows[0].total).toBe(4);
  });

  it("only hard sets: warm-ups, easy sets and sets that didn't happen are left out", () => {
    const rows = weeklyHardSets(
      [sess("s1", "2026-03-03T12:00:00Z", [set("sq", 95, 8), set("sq", 225, 5), set("sq", 225, 5, { rpe: 5 }), set("sq", 225, 5, { completed: false })])],
      groupOf,
      { timeZone: UTC, today: "2026-03-04" }
    );
    expect(rows[0].sets.Quads).toBe(1);
  });

  it("leaves conditioning and mobility out of the groups and out of the total", () => {
    const rows = weeklyHardSets([sess("s1", "2026-03-03T12:00:00Z", [set("bike", null, 20), set("stretch", null, 30), set("sq", 225, 5)])], groupOf, {
      timeZone: UTC,
      today: "2026-03-04",
    });
    expect(rows[0].total).toBe(1);
    expect(rows[0].unassigned).toBe(0);
  });

  it("says how many sets it couldn't place instead of dropping them quietly", () => {
    const rows = weeklyHardSets([sess("s1", "2026-03-03T12:00:00Z", [set("mystery", 50, 10), set("empty", 50, 10), set("nope", 50, 10), set(null, 50, 10), set("sq", 225, 5)])], groupOf, {
      timeZone: UTC,
      today: "2026-03-04",
    });
    expect(rows[0].unassigned).toBe(4);
    expect(rows[0].total).toBe(1);
  });

  it("weeks start on Monday: Sunday and Monday are different weeks", () => {
    const rows = weeklyHardSets(
      [sess("sun", "2026-03-01T12:00:00Z", [set("sq", 225, 5)]), sess("mon", "2026-03-02T12:00:00Z", [set("sq", 225, 5), set("sq", 225, 5)])],
      groupOf,
      { timeZone: UTC, today: "2026-03-04" }
    );
    expect(rows.map((r) => [r.week, r.sets.Quads])).toEqual([
      ["2026-02-23", 1],
      ["2026-03-02", 2],
    ]);
  });

  it("a quiet stretch of 21+ days is rows of zeros, not missing rows, and the current week is partial", () => {
    const rows = weeklyHardSets([sess("a", "2026-02-02T12:00:00Z", [set("sq", 225, 5)]), sess("b", "2026-03-02T12:00:00Z", [set("sq", 225, 5)])], groupOf, {
      timeZone: UTC,
      today: "2026-03-04",
    });
    expect(rows.map((r) => [r.week, r.total, r.partial])).toEqual([
      ["2026-02-02", 1, false],
      ["2026-02-09", 0, false],
      ["2026-02-16", 0, false],
      ["2026-02-23", 0, false],
      ["2026-03-02", 1, true],
    ]);
  });

  it("a session logged late counts in the week it was done", () => {
    const late = sess("late", "2026-02-24T12:00:00Z", [set("sq", 225, 5)], { completedAt: new Date("2026-03-04T09:00:00Z") });
    const rows = weeklyHardSets([late], groupOf, { timeZone: UTC, today: "2026-03-04" });
    expect(rows.map((r) => [r.week, r.sets.Quads])).toEqual([
      ["2026-02-23", 1],
      ["2026-03-02", 0],
    ]);
  });

  it("ignores a session that isn't finished", () => {
    expect(weeklyHardSets([sess("run", "2026-03-03T12:00:00Z", [set("sq", 225, 5)], { completedAt: null })], groupOf, { timeZone: UTC, today: "2026-03-04" })).toEqual([]);
  });

  it("puts a session in the week of its day in the athlete's timezone: UTC+13 and UTC-10", () => {
    const tonga = sess("t", "2026-03-01T12:00:00Z", [set("sq", 225, 5)]); // Mon Mar 2 01:00 in Tonga, Sun Mar 1 in UTC
    const honolulu = sess("h", "2026-03-02T05:00:00Z", [set("sq", 225, 5)]); // Sun Mar 1 19:00 in Honolulu, Mon Mar 2 in UTC
    const weekOf = (s: typeof tonga, tz: string) => weeklyHardSets([s], groupOf, { timeZone: tz, today: "2026-03-05" }).find((r) => r.total === 1)?.week;
    expect(weekOf(tonga, UTC)).toBe("2026-02-23");
    expect(weekOf(tonga, TONGA)).toBe("2026-03-02");
    expect(weekOf(honolulu, UTC)).toBe("2026-03-02");
    expect(weekOf(honolulu, HONOLULU)).toBe("2026-02-23");
  });

  it("no sessions, no rows", () => {
    expect(weeklyHardSets([], groupOf, { timeZone: UTC, today: "2026-03-04" })).toEqual([]);
  });
});

describe("groupLookup", () => {
  it("returns null for an exercise it hasn't been given, or no exercise", () => {
    expect(groupOf("sq")).toBe("Quads");
    expect(groupOf("missing")).toBeNull();
    expect(groupOf(null)).toBeNull();
  });
});
