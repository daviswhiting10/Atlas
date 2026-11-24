import { describe, expect, it } from "vitest";
import type { CalendarSession } from "@/lib/history/calendar";
import { glanceStats, lastDays } from "./glance";

const s = (sets: number) => ({ sets }) as CalendarSession;

describe("the last 30 days", () => {
  it("is 30 days ending today, oldest first", () => {
    const d = lastDays({}, "2026-11-23");
    expect(d).toHaveLength(30);
    expect(d[0].day).toBe("2026-10-25");
    expect(d[29].day).toBe("2026-11-23");
  });
  it("a day's bar is its sets, summed over its sessions", () => {
    const d = lastDays({ "2026-11-23": [s(10), s(6)], "2026-11-20": [s(12)] }, "2026-11-23");
    expect([d[29].sets, d[26].sets, d[28].sets]).toEqual([16, 12, 0]);
  });
  it("a session with no sets still shows as one", () => {
    expect(lastDays({ "2026-11-22": [s(0)] }, "2026-11-23")[28].sets).toBe(1);
  });
  it("sessions outside the window are not drawn", () => {
    expect(lastDays({ "2026-09-01": [s(20)] }, "2026-11-23").every((d) => d.sets === 0)).toBe(true);
  });
});

describe("the stats row", () => {
  it("this week, sessions, strength", () => {
    expect(glanceStats({ week: { done: 2, planned: 4 }, sessions: 19, change: 37 })).toEqual([
      { value: "2/4", label: "this week" }, { value: "19", label: "sessions" }, { value: "+37%", label: "strength" },
    ]);
  });
  it("no plan this week and no change: only what is true", () => {
    expect(glanceStats({ week: null, sessions: 1, change: null })).toEqual([{ value: "1", label: "session" }]);
  });
  it("a drop shows its sign", () => {
    expect(glanceStats({ week: null, sessions: 5, change: -4 })[1]).toEqual({ value: "-4%", label: "strength" });
  });
});
