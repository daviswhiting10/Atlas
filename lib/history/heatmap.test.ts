import { describe, expect, it } from "vitest";
import { heatmap, PRESENCE_WORK } from "./heatmap";
import { HONOLULU, set, sess, TONGA, UTC } from "./fixtures";

const timed = (id: string, day: string, min: number | null) => sess(id, `${day}T12:00:00Z`, [], { durationMin: min });

describe("heatmap", () => {
  it("intensity is relative to the athlete's own training days", () => {
    const h = heatmap([timed("a", "2026-03-02", 20), timed("b", "2026-03-03", 30), timed("c", "2026-03-04", 40), timed("d", "2026-03-05", 60)], { timeZone: UTC, today: "2026-03-06" });
    expect(h.days.filter((d) => d.sessions > 0).map((d) => d.level)).toEqual([1, 2, 3, 4]);
    // the same shape of days at a quarter of the length colours the same way
    const small = heatmap([timed("a", "2026-03-02", 5), timed("b", "2026-03-03", 7), timed("c", "2026-03-04", 10), timed("d", "2026-03-05", 15)], { timeZone: UTC, today: "2026-03-06" });
    expect(small.days.filter((d) => d.sessions > 0).map((d) => d.level)).toEqual([1, 2, 3, 4]);
  });

  it("work is the larger of minutes and hard sets, so a session of sets with no duration still shows", () => {
    const sets = Array.from({ length: 12 }, () => set("sq", 225, 5));
    const h = heatmap([sess("a", "2026-03-02T12:00:00Z", sets), timed("b", "2026-03-03", 30)], { timeZone: UTC, today: "2026-03-04" });
    expect(h.days[0].work).toBe(1); // 12 hard sets / 12
    expect(h.days[1].work).toBe(0.5); // 30 min / 60
  });

  it("a session with nothing logged is present, at the lowest step", () => {
    const h = heatmap([timed("a", "2026-03-02", null), timed("b", "2026-03-03", 45), timed("c", "2026-03-04", 60)], { timeZone: UTC, today: "2026-03-05" });
    expect(h.days[0]).toMatchObject({ sessions: 1, work: PRESENCE_WORK, level: 1 });
  });

  it("a rest day is level 0", () => {
    const h = heatmap([timed("a", "2026-03-02", 30), timed("b", "2026-03-04", 30)], { timeZone: UTC, today: "2026-03-04" });
    expect(h.days.map((d) => [d.day, d.level > 0])).toEqual([
      ["2026-03-02", true],
      ["2026-03-03", false],
      ["2026-03-04", true],
    ]);
  });

  it("two sessions in a day show as two, not as a darker colour", () => {
    const h = heatmap([timed("am", "2026-03-02", 20), sess("pm", "2026-03-02T19:00:00Z", [], { durationMin: 60 }), timed("x", "2026-03-03", 60)], { timeZone: UTC, today: "2026-03-04" });
    expect(h.days[0]).toMatchObject({ sessions: 2, minutes: 80, work: 1 }); // the larger session, not 1.33
    expect(h.days[0].level).toBe(h.days[1].level);
  });

  it("returns the last 12 months, but colours by the whole history", () => {
    const h = heatmap([timed("old", "2025-09-01", 120), timed("new", "2026-11-10", 60)], { timeZone: UTC, today: "2026-11-13" });
    expect(h.days).toHaveLength(365);
    expect(h.from).toBe("2025-11-14");
    expect(h.days.some((d) => d.day === "2025-09-01")).toBe(false);
    expect(h.thresholds).toEqual([1, 1, 2]); // the old 2-hour day still shapes the scale
  });

  it("starts at the first session when that is under a year ago, with Monday-first rows", () => {
    const h = heatmap([timed("a", "2026-02-25", 30)], { timeZone: UTC, today: "2026-03-04" }); // Wed Feb 25 to Wed Mar 4
    expect(h.from).toBe("2026-02-25");
    expect(h.weeks.map((w) => w.monday)).toEqual(["2026-02-23", "2026-03-02"]);
    expect(h.weeks[0].days.map((d) => d?.day ?? null)).toEqual([null, null, "2026-02-25", "2026-02-26", "2026-02-27", "2026-02-28", "2026-03-01"]);
    expect(h.weeks[1].days.map((d) => d?.day ?? null)).toEqual(["2026-03-02", "2026-03-03", "2026-03-04", null, null, null, null]);
  });

  it("a gap of 21+ days is a run of rest days, and the weeks around it are still counted", () => {
    const h = heatmap([timed("a", "2026-02-02", 45), timed("b", "2026-03-02", 45)], { timeZone: UTC, today: "2026-03-04" });
    expect(h.trainingDays).toBe(2);
    expect(h.days.filter((d) => d.day > "2026-02-02" && d.day < "2026-03-02").every((d) => d.level === 0)).toBe(true);
    expect(h.weeksInRange).toBe(5);
    expect(h.activeWeeks).toBe(2);
  });

  it("a session logged late sits on the day it was done", () => {
    const late = sess("late", "2026-03-02T12:00:00Z", [], { durationMin: 30, completedAt: new Date("2026-03-09T09:00:00Z") });
    const h = heatmap([late], { timeZone: UTC, today: "2026-03-09" });
    expect(h.days.filter((d) => d.sessions > 0).map((d) => d.day)).toEqual(["2026-03-02"]);
  });

  it("ignores unfinished sessions, and sessions dated after today", () => {
    const h = heatmap([timed("a", "2026-03-02", 30), sess("run", "2026-03-03T12:00:00Z", [], { completedAt: null }), timed("future", "2026-04-01", 30)], { timeZone: UTC, today: "2026-03-04" });
    expect(h.trainingDays).toBe(1);
    expect(h.to).toBe("2026-03-04");
  });

  it("reads days in the athlete's timezone: UTC+13 and UTC-10", () => {
    const tonga = sess("t", "2026-03-01T12:00:00Z", [], { durationMin: 30 }); // Mar 2 in Tonga
    const honolulu = sess("h", "2026-03-02T05:00:00Z", [], { durationMin: 30 }); // Mar 1 in Honolulu
    const trained = (s: typeof tonga, tz: string) => heatmap([s], { timeZone: tz, today: "2026-03-05" }).days.filter((d) => d.sessions > 0).map((d) => d.day);
    expect(trained(tonga, UTC)).toEqual(["2026-03-01"]);
    expect(trained(tonga, TONGA)).toEqual(["2026-03-02"]);
    expect(trained(honolulu, UTC)).toEqual(["2026-03-02"]);
    expect(trained(honolulu, HONOLULU)).toEqual(["2026-03-01"]);
  });

  it("an athlete with no sessions gets an empty heatmap, not a blank year", () => {
    expect(heatmap([], { timeZone: UTC, today: "2026-03-04" })).toMatchObject({ days: [], weeks: [], thresholds: null, trainingDays: 0 });
  });

  it("one training day gets level 1", () => {
    const h = heatmap([timed("a", "2026-03-02", 30)], { timeZone: UTC, today: "2026-03-02" });
    expect(h.days).toHaveLength(1);
    expect(h.days[0].level).toBe(1);
  });
});
