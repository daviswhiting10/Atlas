import { describe, expect, it } from "vitest";
import { HONOLULU, set, sess, TONGA, UTC } from "./fixtures";
import { prsOverTime } from "./records";

const bench = (w: number, reps: number, extra = {}) => set("bench", w, reps, extra);

describe("prsOverTime, heaviest weight", () => {
  const run = (sessions: ReturnType<typeof sess>[], tz = UTC) => prsOverTime(sessions, { metric: "weight", timeZone: tz }).bench;

  it("the first session is the baseline, a heavier one is a record, equal or lighter is not", () => {
    const r = run([
      sess("s1", "2026-03-02T12:00:00Z", [bench(185, 5)]),
      sess("s2", "2026-03-09T12:00:00Z", [bench(195, 5)]),
      sess("s3", "2026-03-16T12:00:00Z", [bench(195, 3)]),
      sess("s4", "2026-03-23T12:00:00Z", [bench(175, 8)]),
      sess("s5", "2026-03-30T12:00:00Z", [bench(205, 1)]),
    ]);
    expect(r.points.map((p) => [p.day, p.value, p.kind, p.best])).toEqual([
      ["2026-03-02", 185, "first", 185],
      ["2026-03-09", 195, "record", 195],
      ["2026-03-16", 195, "none", 195],
      ["2026-03-23", 175, "none", 195],
      ["2026-03-30", 205, "record", 205],
    ]);
    expect(r.records.map((p) => [p.day, p.value])).toEqual([
      ["2026-03-09", 195],
      ["2026-03-30", 205],
    ]);
    expect(r.best).toBe(205);
  });

  it("uses the best set in a session, whatever its order", () => {
    const r = run([sess("s1", "2026-03-02T12:00:00Z", [bench(135, 10), bench(225, 3), bench(185, 5)])]);
    expect(r.points).toHaveLength(1);
    expect(r.points[0].value).toBe(225);
  });

  it("ignores sets that can't be measured: bodyweight, band, not completed, no reps", () => {
    const r = run([
      sess("s1", "2026-03-02T12:00:00Z", [bench(135, 5)]),
      sess("s2", "2026-03-09T12:00:00Z", [set("bench", null, 20), set("bench", 300, 5, { completed: false }), bench(300, 0), set("bench", null, 10, { bandColor: "red" })]),
    ]);
    expect(r.points).toHaveLength(1);
    expect(r.best).toBe(135);
  });

  it("ignores a session that isn't finished", () => {
    const r = run([sess("s1", "2026-03-02T12:00:00Z", [bench(135, 5)]), sess("s2", "2026-03-09T12:00:00Z", [bench(315, 1)], { completedAt: null })]);
    expect(r.points.map((p) => p.sessionId)).toEqual(["s1"]);
  });

  it("keeps exercises apart, and can be limited to one", () => {
    const sessions = [sess("s1", "2026-03-02T12:00:00Z", [bench(185, 5), set("squat", 225, 5)])];
    expect(Object.keys(prsOverTime(sessions, { metric: "weight", timeZone: UTC })).sort()).toEqual(["bench", "squat"]);
    expect(Object.keys(prsOverTime(sessions, { metric: "weight", timeZone: UTC, exerciseId: "squat" }))).toEqual(["squat"]);
  });

  it("skips sets with no exercise", () => {
    expect(prsOverTime([sess("s1", "2026-03-02T12:00:00Z", [set(null, 100, 5)])], { metric: "weight", timeZone: UTC })).toEqual({});
  });
});

describe("prsOverTime, estimated 1-rep max", () => {
  it("a lighter weight for more reps can be the record in e1RM but not in weight", () => {
    const sessions = [sess("s1", "2026-03-02T12:00:00Z", [bench(225, 5)]), sess("s2", "2026-03-09T12:00:00Z", [bench(205, 10)])];
    const e1 = prsOverTime(sessions, { metric: "e1rm", timeZone: UTC }).bench;
    const wt = prsOverTime(sessions, { metric: "weight", timeZone: UTC }).bench;
    expect(e1.points.map((p) => [p.value, p.kind])).toEqual([[262.5, "first"], [273.3, "record"]]); // 225 x 5 = 262.5, 205 x 10 = 273.3
    expect(wt.points.map((p) => p.kind)).toEqual(["first", "none"]);
  });

  it("caps reps at 12 like the rest of the app", () => {
    const r = prsOverTime([sess("s1", "2026-03-02T12:00:00Z", [bench(100, 30)])], { metric: "e1rm", timeZone: UTC }).bench;
    expect(r.points[0].value).toBe(140); // 100 x (1 + 12/30)
  });
});

describe("a session logged late", () => {
  it("slots into the day it was done and can turn a later record into an ordinary day", () => {
    const march10 = sess("s-mar10", "2026-03-10T12:00:00Z", [bench(240, 5)]);
    const mar3Late = sess("s-mar3", "2026-03-03T12:00:00Z", [bench(245, 5)], { completedAt: new Date("2026-03-12T08:00:00Z") });

    const before = prsOverTime([march10], { metric: "weight", timeZone: UTC }).bench;
    expect(before.points[0].kind).toBe("first");

    const after = prsOverTime([march10, mar3Late], { metric: "weight", timeZone: UTC }).bench; // input order doesn't matter
    expect(after.points.map((p) => [p.sessionId, p.day, p.kind])).toEqual([
      ["s-mar3", "2026-03-03", "first"],
      ["s-mar10", "2026-03-10", "none"],
    ]);
    expect(after.records).toEqual([]);
  });
});

describe("days in other timezones", () => {
  it("dates a record by the athlete's day: UTC+13 and UTC-10", () => {
    const s = [sess("a", "2026-03-02T05:00:00Z", [bench(185, 5)]), sess("b", "2026-03-03T08:30:00Z", [bench(195, 5)])];
    // a: Mar 2 18:00 in Tonga, Mar 1 19:00 in Honolulu.  b: Mar 3 21:30 in Tonga, Mar 2 22:30 in Honolulu.
    expect(prsOverTime(s, { metric: "weight", timeZone: TONGA }).bench.points.map((p) => p.day)).toEqual(["2026-03-02", "2026-03-03"]);
    expect(prsOverTime(s, { metric: "weight", timeZone: HONOLULU }).bench.points.map((p) => p.day)).toEqual(["2026-03-01", "2026-03-02"]);
  });

  it("a gap of three weeks changes nothing about the record chain", () => {
    const s = [sess("a", "2026-01-05T12:00:00Z", [bench(185, 5)]), sess("b", "2026-02-02T12:00:00Z", [bench(190, 5)])];
    expect(prsOverTime(s, { metric: "weight", timeZone: UTC }).bench.records.map((p) => p.day)).toEqual(["2026-02-02"]);
  });
});
