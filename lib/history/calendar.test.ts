import { describe, expect, it } from "vitest";
import { CALENDAR_MIN_SESSIONS, chapterSpan, historyCalendar, longDay, shortDay } from "./calendar";
import { onDays, sess, set, UTC } from "./fixtures";

const meta = (ids: string[]) => Object.fromEntries(ids.map((id) => [id, { title: `T-${id}`, href: `/s/${id}` }]));
const run = (sessions: ReturnType<typeof onDays>, today: string, chapters?: Parameters<typeof historyCalendar>[1]["chapters"]) =>
  historyCalendar(sessions, { timeZone: UTC, today, meta: meta(sessions.map((s) => s.id)), chapters });

describe("history calendar", () => {
  it("shows nothing with no finished sessions, and an unfinished one doesn't count", () => {
    expect(run([], "2026-11-18")).toEqual({ kind: "empty" });
    expect(run([sess("x", "2026-11-17T12:00:00Z", [], { completedAt: null })], "2026-11-18")).toEqual({ kind: "empty" });
  });

  it("under 3 sessions: no grid, Day one and the first session (with no sets, it still counts)", () => {
    const c = run([sess("a", "2026-11-10T12:00:00Z", [], { durationMin: 40 }), sess("b", "2026-11-12T12:00:00Z")], "2026-11-18");
    expect(CALENDAR_MIN_SESSIONS).toBe(3);
    expect(c.kind).toBe("thin");
    if (c.kind !== "thin") return;
    expect(c.sessions).toBe(2);
    expect(c.first).toMatchObject({ id: "a", day: "2026-11-10", title: "T-a", sets: 0, minutes: 40, href: "/s/a" });
  });

  it("puts the newest week on top, Monday first, and names each month on its top-most row", () => {
    // Wed Oct 28, Mon Nov 2, Wed Nov 18 (today).
    const c = run(onDays(["2026-10-28", "2026-11-02", "2026-11-18"]), "2026-11-18");
    expect(c.kind).toBe("grid");
    if (c.kind !== "grid") return;
    expect(c.rows[0].monday).toBe("2026-11-16");
    expect(c.rows.at(-1)!.monday).toBe("2026-10-26");
    expect(c.rows[0].days.map((d) => d?.sessions ?? null)).toEqual([0, 0, 1, null, null, null, null]); // after today: null
    expect(c.rows.map((r) => r.month)).toEqual(["Nov", null, null, "Oct"]);
    expect(c.sessions).toBe(3);
    expect(c.summary).toBe("3 of the last 4 weeks active, 3 sessions");
  });

  it("rings only days that set a heaviest-weight record (the first time is a baseline)", () => {
    const s = [
      sess("a", "2026-11-02T12:00:00Z", [set("bench", 135, 5)]),
      sess("b", "2026-11-04T12:00:00Z", [set("bench", 135, 8)]), // same weight: not a record
      sess("c", "2026-11-06T12:00:00Z", [set("bench", 145, 3)]), // heavier: record
    ];
    const c = run(s, "2026-11-08");
    if (c.kind !== "grid") throw new Error(c.kind);
    const days = c.rows.flatMap((r) => r.days).filter((d) => d && d.sessions > 0);
    expect(days.map((d) => [d!.day, d!.record])).toEqual([
      ["2026-11-02", false],
      ["2026-11-04", false],
      ["2026-11-06", true],
    ]);
    expect(c.byDay["2026-11-06"][0]).toMatchObject({ id: "c", record: true, sets: 1 });
  });

  it("labels every day for screen readers, with no zeros", () => {
    const s = [sess("a", "2026-11-16T12:00:00Z", [set("x", 100, 5), set("x", 100, 5)]), sess("a2", "2026-11-16T15:00:00Z"), sess("b", "2026-11-18T12:00:00Z")];
    const c = run(s, "2026-11-18");
    if (c.kind !== "grid") throw new Error(c.kind);
    const [mon, tue, wed] = c.rows[0].days;
    expect(mon!.label).toBe("Monday, November 16: 2 sessions, 2 sets");
    expect(tue!.label).toBe("Tuesday, November 17: no session");
    expect(wed!.label).toBe("Wednesday, November 18: 1 session");
    expect(c.byDay["2026-11-16"].map((x) => x.id)).toEqual(["a2", "a"]); // newest first
  });

  it("tints a chapter's own days and names it once, on its top-most row", () => {
    const c = run(onDays(["2026-11-02", "2026-11-05", "2026-11-11", "2026-11-18"]), "2026-11-18", [{ name: "75 Hard", from: "2026-11-04", to: "2026-11-12" }]);
    if (c.kind !== "grid") throw new Error(c.kind);
    const byDay = new Map(c.rows.flatMap((r) => r.days).filter(Boolean).map((d) => [d!.day, d!.chapter]));
    expect(byDay.get("2026-11-03")).toBeNull();
    expect(byDay.get("2026-11-04")).toBe("75 Hard");
    expect(byDay.get("2026-11-12")).toBe("75 Hard");
    expect(byDay.get("2026-11-13")).toBeNull();
    expect(c.rows.map((r) => r.chapter)).toEqual([null, "75 Hard", null]);
  });

  it("writes days and chapter spans plainly", () => {
    expect(longDay("2026-03-03")).toBe("Tuesday, March 3");
    expect(shortDay("2026-03-03")).toBe("Tue, Mar 3");
    expect(chapterSpan({ name: "75 Hard", startDay: "2026-04-01", endedAt: new Date("2026-06-14T18:00:00Z") }, UTC, "2026-11-18")).toEqual({ name: "75 Hard", from: "2026-04-01", to: "2026-06-14" });
  });
});
