import { describe, expect, it } from "vitest";
import { HONOLULU, onDays, sess, TONGA, UTC } from "./fixtures";
import { bestStretch, weeklyStreaks } from "./streaks";

const threeIn = (monday: string) => {
  const d = new Date(`${monday}T00:00:00Z`);
  return [0, 2, 4].map((n) => new Date(d.getTime() + n * 86_400_000).toISOString().slice(0, 10));
};
const weekOf = (monday: string, n: number) => threeIn(monday).slice(0, n);

describe("weeklyStreaks", () => {
  it("counts weeks with at least 3 sessions by default: current and longest", () => {
    const days = [
      ...weekOf("2026-01-05", 3),
      ...weekOf("2026-01-12", 3),
      ...weekOf("2026-01-19", 2), // short
      ...weekOf("2026-01-26", 3),
      ...weekOf("2026-02-02", 3),
      ...weekOf("2026-02-09", 3),
    ];
    const s = weeklyStreaks(onDays(days), { timeZone: UTC, today: "2026-02-15" });
    expect(s.target).toBe(3);
    expect(s.current).toBe(3);
    expect(s.longest).toEqual({ weeks: 3, from: "2026-01-26", to: "2026-02-09" });
    expect(s.weeks.map((w) => w.hit)).toEqual([true, true, false, true, true, true]);
  });

  it("the week in progress counts if it's already a hit and never breaks the streak if it isn't", () => {
    const base = [...weekOf("2026-01-05", 3), ...weekOf("2026-01-12", 3), ...weekOf("2026-01-19", 3)];
    expect(weeklyStreaks(onDays([...base, "2026-01-26"]), { timeZone: UTC, today: "2026-01-27" }).current).toBe(3);
    expect(weeklyStreaks(onDays([...base, ...weekOf("2026-01-26", 3)]), { timeZone: UTC, today: "2026-01-30" }).current).toBe(4);
  });

  it("a gap of three weeks or more ends the current streak and leaves the longest alone", () => {
    const days = [...weekOf("2026-01-05", 3), ...weekOf("2026-01-12", 3), ...weekOf("2026-01-19", 3), "2026-03-02"];
    const s = weeklyStreaks(onDays(days), { timeZone: UTC, today: "2026-03-04" });
    expect(s.current).toBe(0);
    expect(s.longest).toEqual({ weeks: 3, from: "2026-01-05", to: "2026-01-19" });
    expect(s.weeks).toHaveLength(9); // quiet weeks are rows, not holes
  });

  it("a streak that has already ended doesn't count as current", () => {
    const days = [...weekOf("2026-01-05", 3), ...weekOf("2026-01-12", 3)];
    expect(weeklyStreaks(onDays(days), { timeZone: UTC, today: "2026-01-27" }).current).toBe(0); // two quiet weeks since
  });

  it("when two runs tie, the longest is the most recent", () => {
    const days = [...weekOf("2026-01-05", 3), ...weekOf("2026-01-12", 3), ...weekOf("2026-02-02", 3), ...weekOf("2026-02-09", 3)];
    expect(weeklyStreaks(onDays(days), { timeZone: UTC, today: "2026-02-15" }).longest).toEqual({ weeks: 2, from: "2026-02-02", to: "2026-02-09" });
  });

  it("the target is adjustable; 1 per week is 'weeks active'", () => {
    const days = ["2026-01-05", "2026-01-13", "2026-01-21"];
    expect(weeklyStreaks(onDays(days), { timeZone: UTC, today: "2026-01-22" }).current).toBe(0);
    const s = weeklyStreaks(onDays(days), { timeZone: UTC, today: "2026-01-22", target: 1 });
    expect(s.current).toBe(3);
    expect(s.longest?.weeks).toBe(3);
  });

  it("two sessions in a day are two sessions (75 Hard days count twice)", () => {
    const s = weeklyStreaks([sess("am", "2026-03-02T08:00:00Z"), sess("pm", "2026-03-02T18:00:00Z"), sess("x", "2026-03-03T12:00:00Z")], { timeZone: UTC, today: "2026-03-05" });
    expect(s.weeks[0]).toEqual({ week: "2026-03-02", sessions: 3, hit: true });
  });

  it("a session logged late completes the week it was done in", () => {
    const onTime = onDays(weekOf("2026-01-05", 2));
    const late = sess("late", "2026-01-09T12:00:00Z", [], { completedAt: new Date("2026-01-20T09:00:00Z") });
    expect(weeklyStreaks(onTime, { timeZone: UTC, today: "2026-01-21" }).weeks[0].hit).toBe(false);
    expect(weeklyStreaks([...onTime, late], { timeZone: UTC, today: "2026-01-21" }).weeks[0].hit).toBe(true);
  });

  it("ignores sessions that aren't finished", () => {
    const s = weeklyStreaks([...onDays(weekOf("2026-01-05", 2)), sess("run", "2026-01-09T12:00:00Z", [], { completedAt: null })], { timeZone: UTC, today: "2026-01-12" });
    expect(s.weeks[0].hit).toBe(false);
  });

  it("puts sessions in the Monday-first week of their day in the athlete's timezone: UTC+13 and UTC-10", () => {
    // Tonga: Mon Mar 2, Wed Mar 4, Thu Mar 5 (all one week). UTC: the first is Sunday Mar 1, the week before.
    const tonga = [sess("a", "2026-03-01T12:00:00Z"), sess("b", "2026-03-03T12:00:00Z"), sess("c", "2026-03-04T12:00:00Z")];
    expect(weeklyStreaks(tonga, { timeZone: TONGA, today: "2026-03-06" }).current).toBe(1);
    expect(weeklyStreaks(tonga, { timeZone: UTC, today: "2026-03-06" }).current).toBe(0);
    // Honolulu: Sun Mar 1 19:00, Tue Mar 3, Wed Mar 4. UTC: all three are Mar 2-4, one week.
    const honolulu = [sess("a", "2026-03-02T05:00:00Z"), sess("b", "2026-03-03T12:00:00Z"), sess("c", "2026-03-04T12:00:00Z")];
    expect(weeklyStreaks(honolulu, { timeZone: UTC, today: "2026-03-06" }).current).toBe(1);
    expect(weeklyStreaks(honolulu, { timeZone: HONOLULU, today: "2026-03-06" }).current).toBe(0);
  });

  it("no sessions: no streak", () => {
    expect(weeklyStreaks([], { timeZone: UTC, today: "2026-03-04" })).toEqual({ target: 3, current: 0, longest: null, weeks: [] });
  });
});

describe("bestStretch", () => {
  it("is the most sessions in any 28 days, with the window's dates", () => {
    const days = ["2026-01-05", "2026-01-12", "2026-01-19", "2026-03-10", "2026-03-11", "2026-03-12", "2026-03-13"];
    expect(bestStretch(onDays(days), { timeZone: UTC })).toEqual({ sessions: 4, from: "2026-03-10", to: "2026-04-06" });
  });

  it("doesn't join two bursts across a gap of 28+ days", () => {
    const days = ["2026-01-05", "2026-01-06", "2026-01-07", "2026-02-20", "2026-02-21", "2026-02-22"];
    expect(bestStretch(onDays(days), { timeZone: UTC })?.sessions).toBe(3);
  });

  it("a window is exactly 28 days: day 28 is in, day 29 is out", () => {
    expect(bestStretch(onDays(["2026-01-05", "2026-02-01"]), { timeZone: UTC })?.sessions).toBe(2); // 27 days apart
    expect(bestStretch(onDays(["2026-01-05", "2026-02-02"]), { timeZone: UTC })?.sessions).toBe(1); // 28 days apart
  });

  it("two sessions in a day count twice, and ties go to the earliest window", () => {
    const days = ["2026-01-05", "2026-01-05", "2026-01-06", "2026-03-02", "2026-03-03", "2026-03-04"];
    expect(bestStretch(onDays(days), { timeZone: UTC })).toEqual({ sessions: 3, from: "2026-01-05", to: "2026-02-01" });
  });

  it("a session logged late counts on the day it was done", () => {
    const late = sess("late", "2026-01-06T12:00:00Z", [], { completedAt: new Date("2026-02-20T09:00:00Z") });
    expect(bestStretch([...onDays(["2026-01-05", "2026-01-07"]), late], { timeZone: UTC })).toEqual({ sessions: 3, from: "2026-01-05", to: "2026-02-01" });
  });

  it("reads days in the athlete's timezone: UTC+13 and UTC-10", () => {
    const s = [sess("a", "2026-03-01T12:00:00Z")]; // Mar 2 in Tonga
    expect(bestStretch(s, { timeZone: TONGA })?.from).toBe("2026-03-02");
    expect(bestStretch([sess("h", "2026-03-02T05:00:00Z")], { timeZone: HONOLULU })?.from).toBe("2026-03-01");
  });

  it("ignores unfinished sessions; nothing to find is null", () => {
    expect(bestStretch([sess("run", "2026-03-02T12:00:00Z", [], { completedAt: null })], { timeZone: UTC })).toBeNull();
    expect(bestStretch([], { timeZone: UTC })).toBeNull();
  });
});
