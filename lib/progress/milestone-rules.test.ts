import { describe, expect, it } from "vitest";
import { isRecordWeight, sessionMilestones } from "./milestone-rules";

const d = (day: string) => new Date(`${day}T12:00:00Z`);
const days = (n: number, start = "2026-01-01") => Array.from({ length: n }, (_, i) => d(new Date(Date.parse(`${start}T12:00:00Z`) + i * 86_400_000 * 3).toISOString().slice(0, 10)));
const types = (dates: Date[]) => sessionMilestones(dates).map((m) => m.type);

describe("sessionMilestones", () => {
  it("is empty with no finished sessions", () => {
    expect(sessionMilestones([])).toEqual([]);
  });

  it("awards the first session on its own date", () => {
    const [m] = sessionMilestones([d("2026-03-03")]);
    expect(m).toMatchObject({ type: "first_session", title: "First session", metricValue: 1, achievedAt: d("2026-03-03") });
  });

  it("puts each count on the date of the session that reached it", () => {
    const dates = days(100); // every third day
    const by = Object.fromEntries(sessionMilestones(dates).map((m) => [m.type, m.achievedAt]));
    expect(by.session_25).toEqual(dates[24]);
    expect(by.session_50).toEqual(dates[49]);
    expect(by.session_100).toEqual(dates[99]);
  });

  it("does not depend on the order the dates arrive in", () => {
    const dates = days(30);
    const shuffled = [...dates].reverse();
    expect(sessionMilestones(shuffled)).toEqual(sessionMilestones(dates));
  });

  it("returns every milestone up to the total, so a missed call is made good later", () => {
    expect(types(days(60))).toEqual(["first_session", "session_25", "session_50"]);
    expect(types(days(24))).toEqual(["first_session"]);
  });

  it("puts a session logged late on its own date, not on the day it was logged", () => {
    // 25 sessions; the 25th by date is the late one (done in January, logged in March).
    const regular = days(24, "2026-02-01");
    const dates = [...regular, d("2026-01-10")];
    const m = sessionMilestones(dates).find((x) => x.type === "session_25");
    expect(m?.achievedAt).toEqual(regular[23]); // the 25th by date, not the late one
    expect(sessionMilestones(dates).find((x) => x.type === "first_session")?.achievedAt).toEqual(d("2026-01-10"));
  });

  it("awards 7 sessions in 14 days on the day of the 7th, once", () => {
    const week = ["2026-01-01", "2026-01-03", "2026-01-05", "2026-01-07", "2026-01-09", "2026-01-11", "2026-01-13", "2026-01-15"].map(d);
    const burst = sessionMilestones(week).filter((m) => m.type === "session_7_streak");
    expect(burst).toHaveLength(1);
    expect(burst[0].achievedAt).toEqual(d("2026-01-13"));
  });

  it("needs all seven inside 14 days", () => {
    const spread = ["2026-01-01", "2026-01-04", "2026-01-07", "2026-01-10", "2026-01-13", "2026-01-16", "2026-01-19"].map(d);
    expect(types(spread)).not.toContain("session_7_streak");
  });

  it("finds a burst that happened in the past, not only the latest 7", () => {
    const burst = ["2026-01-01", "2026-01-02", "2026-01-03", "2026-01-04", "2026-01-05", "2026-01-06", "2026-01-07"].map(d);
    const later = days(5, "2026-06-01");
    expect(sessionMilestones([...burst, ...later]).find((m) => m.type === "session_7_streak")?.achievedAt).toEqual(d("2026-01-07"));
  });

  it("uses the words the copy rules allow", () => {
    const all = sessionMilestones(days(100)).flatMap((m) => [m.title, m.description]).join(" ");
    expect(all).not.toMatch(/!|missed|lost|broke|behind|failed|only|elite/i);
  });
});

describe("isRecordWeight", () => {
  it("is false for the first loaded set: a baseline", () => {
    expect(isRecordWeight([], 135)).toBe(false);
    expect(isRecordWeight([null, 0], 135)).toBe(false);
  });
  it("is true only for a strictly heavier weight", () => {
    expect(isRecordWeight([135, 155], 160)).toBe(true);
    expect(isRecordWeight([135, 155], 155)).toBe(false);
    expect(isRecordWeight([135, 155], 145)).toBe(false);
  });
  it("is false for bodyweight or missing weights", () => {
    expect(isRecordWeight([135], null)).toBe(false);
    expect(isRecordWeight([135], 0)).toBe(false);
  });
  it("ignores unloaded earlier sets", () => {
    expect(isRecordWeight([null, 0, 100], 105)).toBe(true);
  });
});
