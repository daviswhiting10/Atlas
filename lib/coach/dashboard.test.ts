import { describe, expect, it } from "vitest";
import { applyFilter, glimpse, isoWeekday, lastLabel, sortRows, standing, stepOf, type DashRow } from "./dashboard";

// 2026-11-23 is a Monday; 2026-11-26 a Thursday.
describe("overdue: nothing logged for 5 or more days", () => {
  const plan = { done: 2, planned: 4 };
  it("4 days is fine, 5 is overdue", () => {
    expect(standing({ today: "2026-11-23", lastDay: "2026-11-19", thisWeek: plan, hasPlan: true })).toBe("on-track");
    expect(standing({ today: "2026-11-23", lastDay: "2026-11-18", thisWeek: plan, hasPlan: true })).toBe("overdue");
  });
  it("a plan and no session ever is overdue; no plan and no session is 'no plan', not overdue", () => {
    expect(standing({ today: "2026-11-23", lastDay: null, thisWeek: null, hasPlan: true })).toBe("overdue");
    expect(standing({ today: "2026-11-23", lastDay: null, thisWeek: null, hasPlan: false })).toBe("no-plan");
  });
  it("no plan but they log on their own, recently: on track", () => {
    expect(standing({ today: "2026-11-23", lastDay: "2026-11-22", thisWeek: null, hasPlan: false })).toBe("on-track");
  });
});

describe("overdue: behind the week once it is past midweek", () => {
  it("early in the week nobody is behind the week", () => {
    expect(standing({ today: "2026-11-25", lastDay: "2026-11-24", thisWeek: { done: 0, planned: 4 }, hasPlan: true })).toBe("on-track");
  });
  it("Thursday with 4 planned, 2 are expected: 1 done is behind, 2 is fine", () => {
    expect(standing({ today: "2026-11-26", lastDay: "2026-11-25", thisWeek: { done: 1, planned: 4 }, hasPlan: true })).toBe("overdue");
    expect(standing({ today: "2026-11-26", lastDay: "2026-11-25", thisWeek: { done: 2, planned: 4 }, hasPlan: true })).toBe("on-track");
  });
  it("Sunday: all but one of 4 is not enough", () => {
    expect(standing({ today: "2026-11-29", lastDay: "2026-11-28", thisWeek: { done: 2, planned: 4 }, hasPlan: true })).toBe("overdue");
    expect(standing({ today: "2026-11-29", lastDay: "2026-11-28", thisWeek: { done: 4, planned: 4 }, hasPlan: true })).toBe("on-track");
  });
  it("weekdays", () => {
    expect([isoWeekday("2026-11-23"), isoWeekday("2026-11-26"), isoWeekday("2026-11-29")]).toEqual([1, 4, 7]);
  });
});

describe("the last-session label", () => {
  it("today, yesterday, a weekday, days ago, never", () => {
    expect(lastLabel("2026-11-23", "2026-11-23")).toBe("Today");
    expect(lastLabel("2026-11-22", "2026-11-23")).toBe("Yesterday");
    expect(lastLabel("2026-11-20", "2026-11-23")).toBe("Fri");
    expect(lastLabel("2026-11-12", "2026-11-23")).toBe("11 days ago");
    expect(lastLabel(null, "2026-11-23")).toBe("No sessions yet");
  });
});

describe("the four-week glimpse", () => {
  it("28 days, Monday first, the last row this week; days to come are -1", () => {
    const g = glimpse({ "2026-11-23": 12, "2026-11-20": 25 }, "2026-11-25");
    expect(g).toHaveLength(28);
    expect(g.slice(21, 24)).toEqual([2, 0, 0]); // Mon 23 (12 sets), Tue, Wed
    expect(g.slice(24)).toEqual([-1, -1, -1, -1]);
    expect(g[18]).toBe(3); // Fri Nov 20, last week's row: 25 sets
  });
  it("steps from sets: 1-9, 10-19, 20-29, 30+; a session with no sets still shows", () => {
    expect([stepOf(0, true), stepOf(9, true), stepOf(10, true), stepOf(20, true), stepOf(30, true), stepOf(0, false)]).toEqual([1, 1, 2, 3, 4, 0]);
  });
});

describe("sorting and filters", () => {
  const row = (id: string, s: DashRow["standing"], lastDay: string | null, today = false) => ({ id, name: id, standing: s, lastDay, trainedToday: today }) as DashRow & { lastDay: string | null };
  const rows = [row("b", "on-track", "2026-11-22"), row("a", "overdue", "2026-11-10"), row("c", "on-track", "2026-11-23", true), row("d", "no-plan", null), row("e", "overdue", "2026-11-12")];
  it("overdue first, then who trained most recently, then no plan last", () => {
    expect(sortRows(rows).map((r) => r.id)).toEqual(["e", "a", "c", "b", "d"]);
  });
  it("filters: overdue, trained today", () => {
    expect(applyFilter(rows, "overdue").map((r) => r.id)).toEqual(["a", "e"]);
    expect(applyFilter(rows, "today").map((r) => r.id)).toEqual(["c"]);
    expect(applyFilter(rows, "all")).toHaveLength(5);
  });
});
