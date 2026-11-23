import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { CalendarSession } from "./calendar";
import { gridDay, heatDays, latestTrained, levelOf, PHONE_WEEKS, quartileSteps, readout, YEAR_WEEKS, yearGrid } from "./year-grid";

const s = (title: string, sets: number, minutes: number | null = null): CalendarSession => ({ id: title + sets, title, sets, minutes, record: false, href: null });
const read = (p: string) => readFileSync(new URL(`../../${p}`, import.meta.url), "utf8");
// 2026-11-21 is a Saturday (so 2026-11-11 is a Wednesday).
const TODAY = "2026-11-21";

describe("quartileSteps: the athlete's own steps, from sets in a day", () => {
  it("is the 25th, 50th and 75th percentile (nearest rank) of every training day", () => {
    const byDay = Object.fromEntries([4, 8, 12, 16, 20, 24, 28, 32].map((n, i) => [`2026-10-0${i + 1}`, [s("A", n)]]));
    expect(quartileSteps(heatDays(byDay))).toEqual([8, 16, 24]);
  });
  it("adds a day's sessions together", () => {
    expect(quartileSteps(heatDays({ "2026-10-01": [s("A", 10), s("B", 6)] }))).toEqual([16, 16, 16]);
  });
  it("has nothing without training days", () => expect(quartileSteps(heatDays({}))).toBeNull());
  it("steps are 1 to 4, split at the quartiles", () => {
    const t: [number, number, number] = [8, 16, 24];
    expect([4, 8, 9, 16, 17, 24, 25].map((n) => levelOf(n, t))).toEqual([1, 1, 2, 2, 3, 3, 4]);
  });
  it("a light month still shows contrast: the steps come from the person's own spread, not a fixed number of sets", () => {
    const light = Object.fromEntries([3, 4, 5, 6].map((n, i) => [`2026-11-0${i + 1}`, [s("A", n)]]));
    const levels = Object.values(light).map((d) => levelOf(d[0].sets, quartileSteps(heatDays(light))));
    expect(new Set(levels).size).toBe(4);
  });
  it("a session with no sets logged is a training day at the lowest step", () => {
    const g = yearGrid(heatDays({ "2026-11-17": [s("Walk", 0, 30)], "2026-11-18": [s("Upper", 20)] }), { today: TODAY, weeks: 2 });
    const cell = (d: string) => g.columns.flatMap((c) => c.cells).find((c) => c.day === d)!;
    expect(cell("2026-11-17").level).toBe(1);
    expect(cell("2026-11-18").level).toBeGreaterThan(1);
  });
});

describe("yearGrid: weeks as columns, seven rows, Monday first", () => {
  const g = yearGrid(heatDays({}), { today: TODAY });
  it("has a year of columns of seven days, oldest first, ending on the week of today", () => {
    expect(g.columns).toHaveLength(YEAR_WEEKS);
    expect(g.columns.every((c) => c.cells.length === 7)).toBe(true);
    expect(g.columns.at(-1)!.monday).toBe("2026-11-16");
    expect(g.columns.at(-1)!.cells[0].day).toBe("2026-11-16");
    expect(g.columns[0].monday < g.columns[1].monday).toBe(true);
  });
  it("marks the days after today as future, and never colours them", () => {
    const withFuture = yearGrid(heatDays({ "2026-11-22": [s("Oops", 9)] }), { today: TODAY });
    const sun = withFuture.columns.at(-1)!.cells[6];
    expect(sun).toMatchObject({ day: "2026-11-22", future: true, level: 0 });
    expect(withFuture.columns.at(-1)!.cells[5].future).toBe(false);
  });
  it("names a month above the column that holds its 1st, and only there", () => {
    const names = g.columns.filter((c) => c.month).map((c) => c.month);
    expect(names.slice(-3)).toEqual(["Sep", "Oct", "Nov"]);
    expect(new Set(names).size).toBeGreaterThanOrEqual(12);
    const nov = g.columns.find((c) => c.month === "Nov" && c.cells.some((x) => x.day === "2026-11-01"));
    expect(nov?.cells.map((x) => x.day)).toContain("2026-11-01");
  });
  it("a phone shows the last 26 of the columns, right-aligned to today", () => {
    const phone = yearGrid(heatDays({}), { today: TODAY, weeks: PHONE_WEEKS });
    expect(phone.columns).toHaveLength(26);
    expect(phone.columns.at(-1)!.monday).toBe(g.columns.at(-1)!.monday);
    expect(phone.columns[0].monday).toBe(g.columns[YEAR_WEEKS - PHONE_WEEKS].monday);
  });
});

describe("the one-line readout", () => {
  const byDay = { "2026-11-11": [s("Lower A", 14, 50)], "2026-11-12": [s("Walk", 0, 30)], "2026-11-13": [s("Upper", 10), s("Core", 4)] };
  const g = yearGrid(heatDays(byDay), { today: TODAY });
  const cell = (d: string) => g.columns.flatMap((c) => c.cells).find((c) => c.day === d)!;
  it("day, workout, sets", () => expect(readout(cell("2026-11-11"))).toBe("Wed Nov 11 · Lower A · 14 sets"));
  it("minutes when no sets were logged", () => expect(readout(cell("2026-11-12"))).toBe("Thu Nov 12 · Walk · 30 min"));
  it("two sessions: both names, sets added", () => expect(readout(cell("2026-11-13"))).toBe("Fri Nov 13 · Upper, Core · 14 sets"));
  it("a day with nothing, and a day to come", () => {
    expect(readout(cell("2026-11-15"))).toBe("Sun Nov 15 · no session");
    expect(readout(cell("2026-11-22"))).toBe("Sun Nov 22 · not yet");
  });
  it("one set is '1 set'", () => expect(readout({ ...cell("2026-11-11"), sets: 1 })).toContain("1 set"));
  it("before anything is touched it shows the latest training day", () => expect(latestTrained(g)?.day).toBe("2026-11-13"));
  it("names a day", () => expect(gridDay("2026-11-11")).toBe("Wed Nov 11"));
});

describe("the heatmap component", () => {
  const c = read("components/athlete/YearHeatmap.tsx");
  it("cells are display-only: no buttons, no fixed 44 px targets, no popover", () => {
    expect(c).not.toContain("<button");
    expect(c).not.toMatch(/h-11|min-h-11|w-11/);
    expect(c).not.toMatch(/popover|Popover|Tooltip/);
  });
  it("one accent in four steps, not the purple of the reference", () => {
    expect(c).toContain("var(--dusk-teal)");
    expect(c).not.toMatch(/purple|violet/i);
  });
  it("shows the last 26 weeks on a phone and the year from md up, with no sideways scroll", () => {
    expect(c).toContain("max-md:hidden");
    expect(c).not.toMatch(/overflow-x-(auto|scroll)/);
    expect(c).toContain("auto-cols-fr");
  });
  it("a short fade-in and nothing else moves (the global rule drops it for reduced motion)", () => {
    expect(c).toContain("fade-in");
    expect(c).not.toMatch(/transition|animate-/);
    expect(read("app/globals.css")).toContain("prefers-reduced-motion: reduce");
  });
  it("the History section uses it", () => expect(read("components/athlete/HistoryCalendar.tsx")).toContain("<YearHeatmap"));
});
