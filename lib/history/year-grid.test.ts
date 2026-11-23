import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { CalendarSession } from "./calendar";
import type { DayMode } from "./mode";
import { BAND_LABELS, BANDS, DESKTOP_WEEKS, PHONE_WEEKS, bandOf, gridDay, heatDays, latestTrained, readout, yearGrid } from "./year-grid";

const read = (p: string) => readFileSync(new URL(`../../${p}`, import.meta.url), "utf8");
const s = (title: string, minutes: number | null, mode: DayMode | null = "S", sets = 10): CalendarSession => ({ id: title + minutes, title, sets, minutes, mode, record: false, href: null });
// 2026-11-23 is a Monday (so 2026-11-11 is a Wednesday).
const TODAY = "2026-11-23";
const cell = (g: ReturnType<typeof yearGrid>, d: string) => g.columns.flatMap((c) => c.cells).find((c) => c.day === d)!;

describe("minute bands: fixed, one colour", () => {
  it("1-29, 30-59, 60-89, 90-119 and 120+ are five steps; none is empty", () => {
    expect(BANDS).toEqual([1, 30, 60, 90, 120]);
    expect(BAND_LABELS).toEqual(["1-29", "30-59", "60-89", "90-119", "120+"]);
    expect([1, 29, 30, 59, 60, 89, 90, 119, 120, 300].map((m) => bandOf(m, true))).toEqual([1, 1, 2, 2, 3, 3, 4, 4, 5, 5]);
    expect(bandOf(0, false)).toBe(0);
  });
  it("a session with no minutes written down still makes it a training day, at the lightest band", () => {
    expect(bandOf(0, true)).toBe(1);
    const g = yearGrid(heatDays({ "2026-11-17": [s("Walk", null, "W")] }), { today: TODAY, weeks: 2 });
    expect(cell(g, "2026-11-17").level).toBe(1);
  });
  it("a day's minutes are all its sessions added", () => {
    const g = yearGrid(heatDays({ "2026-11-17": [s("Upper", 50), s("Run", 45, "R")] }), { today: TODAY, weeks: 2 });
    expect(cell(g, "2026-11-17")).toMatchObject({ minutes: 95, level: 4 });
  });
  it("the bands do not depend on how the athlete usually trains (a light month stays light)", () => {
    const a = yearGrid(heatDays({ "2026-11-17": [s("Short", 20)] }), { today: TODAY, weeks: 2 });
    const b = yearGrid(heatDays({ "2026-11-17": [s("Short", 20)], "2026-11-18": [s("Long", 150)] }), { today: TODAY, weeks: 2 });
    expect(cell(a, "2026-11-17").level).toBe(cell(b, "2026-11-17").level);
  });
  it("days with nothing are unshaded; the days after today are future", () => {
    const g = yearGrid(heatDays({ "2026-11-24": [s("Oops", 90)] }), { today: TODAY, weeks: 2 });
    expect(cell(g, "2026-11-20").level).toBe(0);
    expect(cell(g, "2026-11-24")).toMatchObject({ future: true, level: 0, mode: null, ring: null });
  });
});

describe("the corner icon: a day's mode", () => {
  it("is carried from the sessions: strength, run, walk, or mixed", () => {
    const d = heatDays({ "2026-11-17": [s("Upper", 60, "S")], "2026-11-18": [s("Run", 40, "R")], "2026-11-19": [s("Walk", 30, "W")], "2026-11-20": [s("Upper", 50, "S"), s("Run", 30, "R")] });
    const g = yearGrid(d, { today: TODAY, weeks: 2 });
    expect(["2026-11-17", "2026-11-18", "2026-11-19", "2026-11-20"].map((x) => cell(g, x).mode)).toEqual(["S", "R", "W", "M"]);
  });
  it("a day with no recorded mode has no icon", () => {
    expect(cell(yearGrid(heatDays({ "2026-11-17": [s("Imported", 45, null)] }), { today: TODAY, weeks: 2 }), "2026-11-17").mode).toBeNull();
  });
});

describe("the ring: the running challenge", () => {
  const challenge = { name: "75 Hard", days: { "2026-11-16": "met" as const, "2026-11-17": "open" as const, "2026-11-23": "open" as const } };
  const g = yearGrid(heatDays({ "2026-11-16": [s("Upper", 70)] }, challenge), { today: TODAY, weeks: 2 });
  it("closed when met, open when not; a challenge day with nothing logged is an empty cell with an open ring", () => {
    expect(cell(g, "2026-11-16")).toMatchObject({ ring: "met", level: 3 });
    expect(cell(g, "2026-11-17")).toMatchObject({ ring: "open", level: 0 });
  });
  it("days outside the challenge have no ring", () => {
    expect(cell(g, "2026-11-18").ring).toBeNull();
  });
  it("without a running challenge there are no rings at all", () => {
    const none = yearGrid(heatDays({ "2026-11-16": [s("Upper", 70)] }), { today: TODAY, weeks: 2 });
    expect(none.columns.flatMap((c) => c.cells).every((c) => c.ring === null)).toBe(true);
  });
});

describe("the window: weeks as columns, seven rows, Monday first", () => {
  const g = yearGrid({}, { today: TODAY });
  it("26 columns on a desktop, ending on the week of today; 13 on a phone, right-aligned to the same week", () => {
    expect(DESKTOP_WEEKS).toBe(26);
    expect(PHONE_WEEKS).toBe(13);
    expect(g.columns).toHaveLength(26);
    expect(g.columns.every((c) => c.cells.length === 7)).toBe(true);
    expect(g.columns.at(-1)!.monday).toBe("2026-11-23");
    const phone = yearGrid({}, { today: TODAY, weeks: PHONE_WEEKS });
    expect(phone.columns).toHaveLength(13);
    expect(phone.columns[0].monday).toBe(g.columns[26 - 13].monday);
  });
  it("names a month above the column that holds its 1st", () => {
    expect(g.columns.filter((c) => c.month).map((c) => c.month).slice(-3)).toEqual(["Sep", "Oct", "Nov"]);
  });
  it("names a day", () => expect(gridDay("2026-11-11")).toBe("Wed Nov 11"));
});

describe("the one-line readout", () => {
  const challenge = { name: "75 Hard", today: TODAY };
  const d = heatDays({ "2026-11-14": [s("Long run", 52, "R")], "2026-11-11": [s("Lower A", 64)], "2026-11-12": [s("Imported", null, null, 0)] }, { name: "75 Hard", days: { "2026-11-14": "open", "2026-11-11": "met", "2026-11-23": "open" } });
  const g = yearGrid(d, { today: TODAY });
  it("day, workout, minutes, and the challenge", () => {
    expect(readout(cell(g, "2026-11-14"), challenge)).toBe("Sat Nov 14 · Long run · 52 min · 75 Hard: not met");
    expect(readout(cell(g, "2026-11-11"), challenge)).toBe("Wed Nov 11 · Lower A · 64 min · 75 Hard: met");
  });
  it("today's open ring says it is still going", () => {
    expect(readout(cell(g, "2026-11-23"), challenge)).toBe("Mon Nov 23 · no session · 75 Hard: still open");
  });
  it("without a challenge, no challenge text; with no minutes, nothing is invented", () => {
    expect(readout(cell(g, "2026-11-14"))).toBe("Sat Nov 14 · Long run · 52 min");
    expect(readout(cell(g, "2026-11-12"))).toBe("Thu Nov 12 · Imported");
  });
  it("a day to come, and before anything is touched the latest training day", () => {
    expect(readout(cell(g, "2026-11-24"))).toBe("Tue Nov 24 · not yet");
    expect(latestTrained(g)?.day).toBe("2026-11-14");
  });
});

describe("the heatmap component", () => {
  const c = read("components/athlete/YearHeatmap.tsx");
  it("cells are display-only: no buttons, no 44 px targets, nothing floats", () => {
    expect(c).not.toContain("<button");
    expect(c).not.toMatch(/h-11|min-h-11|w-11/);
    expect(c).not.toMatch(/popover|Popover|Tooltip/);
  });
  it("one accent (not the purple of the reference); the ring is a closed circle or one with a gap", () => {
    expect(c).toContain("var(--dusk-teal)");
    expect(c).not.toMatch(/purple|violet/i);
    expect(c).toContain("strokeDasharray");
  });
  it("shows 13 weeks on a phone and 26 from md up, with no sideways scroll", () => {
    expect(c).toContain("max-md:hidden");
    expect(c).toContain("DESKTOP_WEEKS - PHONE_WEEKS");
    expect(c).not.toMatch(/overflow-x-(auto|scroll)/);
  });
  it("a short fade-in and nothing else moves", () => {
    expect(c).toContain("fade-in");
    expect(c).not.toMatch(/transition|animate-/);
  });
  it("has a legend for the bands, the icons and the ring", () => {
    expect(c).toContain("function Legend");
    expect(c).toContain("BAND_LABELS");
    expect(c).toContain("MODE_LABEL");
  });
});
