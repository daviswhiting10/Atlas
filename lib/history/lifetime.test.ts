import { describe, expect, it } from "vitest";
import { HONOLULU, onDays, set, sess, TONGA, UTC } from "./fixtures";
import { lifetimeStats } from "./lifetime";

const stats = (sessions: ReturnType<typeof sess>[], today = "2026-03-06", tz = UTC) => lifetimeStats(sessions, { timeZone: tz, today });

describe("lifetimeStats: totals", () => {
  it("counts finished sessions and completed sets with reps", () => {
    const s = stats([
      sess("a", "2026-03-02T12:00:00Z", [set("bench", 225, 5), set("bench", 225, 5), set("bench", 225, 5, { completed: false }), set("bench", 225, 0)]),
      sess("b", "2026-03-03T12:00:00Z", [set("squat", 315, 3)]),
      sess("run", "2026-03-04T12:00:00Z", [set("squat", 405, 1)], { completedAt: null }),
      sess("c", "2026-03-05T12:00:00Z"), // finished, nothing logged: still a session
    ]);
    expect(s.sessions).toBe(3);
    expect(s.sets).toBe(3);
    expect(s.since).toBe("2026-03-02");
  });

  it("a history of set-less sessions (walks, time-only workouts) still counts everywhere", () => {
    const s = stats(onDays(["2026-02-23", "2026-02-24", "2026-03-02", "2026-03-04"]).map((x) => ({ ...x, durationMin: 45 })));
    expect(s.sessions).toBe(4);
    expect(s.sets).toBe(0);
    expect(s.since).toBe("2026-02-23");
    expect(s.activeWeeks).toEqual({ active: 2, of: 2 });
    expect(s.longestRun).toMatchObject({ weeks: 2 });
    expect(s.bestStretch).toMatchObject({ sessions: 4 });
    expect(s.time).toEqual({ minutes: 180, fromSessions: 4, ofSessions: 4 });
    expect(s.records).toBe(0);
  });

  it("moved is tonnage for loaded sets; bodyweight and band reps are counted apart, not dropped", () => {
    const s = stats([
      sess("a", "2026-03-02T12:00:00Z", [
        set("bench", 225, 5), // 1125
        set("bench", 225, 5), // 1125
        set("pushup", null, 12),
        set("pushup", 0, 10),
        set("row", null, 15, { bandColor: "red" }),
        set("pushup", null, 8, { completed: false }),
      ]),
    ]);
    expect(s.moved).toEqual({ tonnageLb: 2250, unloadedReps: 37 });
  });

  it("a carry or a plank is never weight × seconds, nor bodyweight reps: it counts as a set only", () => {
    const s = stats([
      sess("a", "2026-03-02T12:00:00Z", [set("bench", 225, 5), set("carry", 60, 45, { timed: true }), set("plank", null, 60, { timed: true })]),
    ]);
    expect(s.moved).toEqual({ tonnageLb: 1125, unloadedReps: 0 });
    expect(s.sets).toBe(3);
  });

  it("time is shown only when at least half of the sessions have a duration", () => {
    const d = (id: string, day: string, min: number | null) => sess(id, `${day}T12:00:00Z`, [], { durationMin: min });
    expect(stats([d("a", "2026-03-02", 45), d("b", "2026-03-03", 30), d("c", "2026-03-04", null)]).time).toEqual({ minutes: 75, fromSessions: 2, ofSessions: 3 });
    expect(stats([d("a", "2026-03-02", 45), d("b", "2026-03-03", null)]).time).toEqual({ minutes: 45, fromSessions: 1, ofSessions: 2 }); // exactly half
    expect(stats([d("a", "2026-03-02", 45), d("b", "2026-03-03", null), d("c", "2026-03-04", null)]).time).toBeNull();
  });

  it("an athlete with nothing yet gets zeros and nulls", () => {
    expect(stats([])).toEqual({
      since: null,
      sessions: 0,
      sets: 0,
      moved: { tonnageLb: 0, unloadedReps: 0 },
      time: null,
      records: 0,
      bests: 0,
      activeWeeks: { active: 0, of: 0 },
      longestRun: null,
      currentRun: 0,
      bestStretch: null,
    });
  });
});

describe("lifetimeStats: records and bests", () => {
  it("a record is a new heaviest weight; a best is a new e1RM that wasn't also a record", () => {
    const s = stats([
      sess("a", "2026-03-02T12:00:00Z", [set("bench", 185, 5)]), // baseline
      sess("b", "2026-03-03T12:00:00Z", [set("bench", 195, 5)]), // heavier: a record (and a better e1RM, not counted twice)
      sess("c", "2026-03-04T12:00:00Z", [set("bench", 175, 10)]), // lighter, but 233 e1RM beats 227.5: a best
      sess("d", "2026-03-05T12:00:00Z", [set("bench", 175, 8)]), // neither
    ]);
    expect(s.records).toBe(1);
    expect(s.bests).toBe(1);
  });

  it("a first session is a baseline, not a record", () => {
    expect(stats([sess("a", "2026-03-02T12:00:00Z", [set("bench", 185, 5), set("squat", 225, 5)])])).toMatchObject({ records: 0, bests: 0 });
  });

  it("counts every exercise", () => {
    const s = stats([
      sess("a", "2026-03-02T12:00:00Z", [set("bench", 185, 5), set("squat", 225, 5)]),
      sess("b", "2026-03-03T12:00:00Z", [set("bench", 190, 5), set("squat", 235, 5)]),
    ]);
    expect(s.records).toBe(2);
  });
});

describe("lifetimeStats: weeks", () => {
  it("active weeks, the longest run and the current run, with a 21+ day gap between", () => {
    const s = stats(onDays(["2026-01-05", "2026-01-13", "2026-03-02"]), "2026-03-04");
    expect(s.activeWeeks).toEqual({ active: 3, of: 9 }); // Jan 5 to Mar 2 is nine Monday-first weeks
    expect(s.longestRun).toEqual({ weeks: 2, from: "2026-01-05", to: "2026-01-12" });
    expect(s.currentRun).toBe(1);
  });

  it("the current week doesn't break a run just because it has no session yet", () => {
    const s = stats(onDays(["2026-02-17", "2026-02-24"]), "2026-03-04"); // weeks Feb 16, Feb 23; this week (Mar 2) is empty
    expect(s.currentRun).toBe(2);
    expect(s.activeWeeks).toEqual({ active: 2, of: 3 });
  });

  it("best stretch is the most sessions in 28 days", () => {
    const s = stats(onDays(["2026-01-05", "2026-02-10", "2026-02-11", "2026-02-12"]), "2026-03-04");
    expect(s.bestStretch).toEqual({ sessions: 3, from: "2026-02-10", to: "2026-03-09" });
  });
});

describe("lifetimeStats: late logs and timezones", () => {
  it("a session logged late counts on the day it was done, so it can join two weeks into a run", () => {
    const late = sess("late", "2026-01-06T12:00:00Z", [set("bench", 185, 5)], { completedAt: new Date("2026-03-01T09:00:00Z") });
    const s = stats([...onDays(["2026-01-13"]), late], "2026-01-20");
    expect(s.since).toBe("2026-01-06");
    expect(s.longestRun).toEqual({ weeks: 2, from: "2026-01-05", to: "2026-01-12" });
  });

  it("reads days in the athlete's timezone: UTC+13 and UTC-10", () => {
    // Sat Feb 28 12:00Z and Sun Mar 1 12:00Z. UTC: both in the week of Feb 23. Tonga (+13): Sun Mar 1 and Mon Mar 2, two weeks.
    const s = [sess("a", "2026-02-28T12:00:00Z"), sess("b", "2026-03-01T12:00:00Z")];
    expect(stats(s, "2026-03-06", UTC).longestRun?.weeks).toBe(1);
    expect(stats(s, "2026-03-06", TONGA).longestRun?.weeks).toBe(2);
    // Mon Mar 2 05:00Z and Tue Mar 3 12:00Z. UTC: one week. Honolulu (-10): Sun Mar 1 19:00 and Tue Mar 3, two weeks.
    const h = [sess("c", "2026-03-02T05:00:00Z"), sess("d", "2026-03-03T12:00:00Z")];
    expect(stats(h, "2026-03-06", UTC).longestRun?.weeks).toBe(1);
    expect(stats(h, "2026-03-06", HONOLULU).longestRun?.weeks).toBe(2);
    expect(stats(h, "2026-03-06", HONOLULU).since).toBe("2026-03-01");
  });
});
