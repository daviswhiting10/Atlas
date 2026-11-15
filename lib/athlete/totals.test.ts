import { describe, expect, it } from "vitest";
import { finishedTotals } from "./totals";

const at = (iso: string) => new Date(iso);
const done = (id: string, iso: string) => ({ id, date: at(iso), completedAt: at(iso) });

describe("finishedTotals", () => {
  it("counts every finished session, including one with no sets (a one-tap workout)", () => {
    const t = finishedTotals([done("a", "2026-11-09T12:00:00Z"), done("b", "2026-11-10T12:00:00Z")], "UTC", "2026-11-12");
    expect(t).toEqual({ sessions: 2, streak: 1, since: "2026-11-09" });
  });

  it("ignores a session that isn't finished", () => {
    const t = finishedTotals([done("a", "2026-11-09T12:00:00Z"), { id: "b", date: at("2026-11-10T12:00:00Z"), completedAt: null }], "UTC", "2026-11-12");
    expect(t.sessions).toBe(1);
  });

  it("the streak is consecutive weeks with a session, and this week doesn't break it before it has one", () => {
    const rows = [done("a", "2026-10-26T12:00:00Z"), done("b", "2026-11-02T12:00:00Z")]; // weeks of Oct 26 and Nov 2
    expect(finishedTotals(rows, "UTC", "2026-11-10").streak).toBe(2); // Tue Nov 10: the week of Nov 9 has none yet
    expect(finishedTotals(rows, "UTC", "2026-11-23").streak).toBe(0); // two quiet weeks since
  });

  it("a session logged late counts on the day it was done", () => {
    const late = { id: "late", date: at("2026-11-03T12:00:00Z"), completedAt: at("2026-11-12T09:00:00Z") };
    expect(finishedTotals([late], "UTC", "2026-11-12").since).toBe("2026-11-03");
  });

  it("reads days in the athlete's timezone", () => {
    // Sun Nov 8 at 23:30 UTC is already Monday Nov 9 in UTC+13.
    const rows = [done("a", "2026-11-08T23:30:00Z")];
    expect(finishedTotals(rows, "Pacific/Tongatapu", "2026-11-12").since).toBe("2026-11-09");
    expect(finishedTotals(rows, "UTC", "2026-11-12").since).toBe("2026-11-08");
  });

  it("nothing logged is zeros", () => {
    expect(finishedTotals([], "UTC", "2026-11-12")).toEqual({ sessions: 0, streak: 0, since: null });
  });
});
