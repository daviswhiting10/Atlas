import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { CalendarSession } from "./calendar";
import type { DayMode } from "./mode";
import { BAND_LABELS, BANDS, PHONE_WEEKS, YEAR_WEEKS, bandOf, gridDay, hasEarlier, heatDays, latestTrained, rangeLabel, rawStats, readout, yearGrid } from "./year-grid";

const read = (p: string) => readFileSync(new URL(`../../${p}`, import.meta.url), "utf8");
// A session: strength sets for "S" (and mixed), minutes of run or walk for "R" and "W", as the work units are made.
const s = (title: string, minutes: number | null, mode: DayMode | null = "S", sets = 10): CalendarSession => {
  const strength = mode === "S" || mode === "M" ? sets : 0;
  const runMin = mode === "R" || mode === "M" ? (minutes ?? 0) : 0;
  const walkMin = mode === "W" ? (minutes ?? 0) : 0;
  return { id: title + minutes, title, sets: strength, minutes, mode, record: false, href: null, work: { sets: strength, runMin, walkMin, mobMin: 0, units: strength + runMin / 3 + walkMin / 10 } };
};
// 2026-11-23 is a Monday (so 2026-11-11 is a Wednesday).
const TODAY = "2026-11-23";
const cell = (g: ReturnType<typeof yearGrid>, d: string) => g.columns.flatMap((c) => c.cells).find((c) => c.day === d)!;

describe("work-unit bands: fixed, one colour", () => {
  it("1-5, 6-10, 11-20, 21-35 and 36+ are five steps; none is empty", () => {
    expect(BANDS).toEqual([1, 6, 11, 21, 36]);
    expect(BAND_LABELS).toEqual(["1-5", "6-10", "11-20", "21-35", "36+"]);
    expect([1, 5, 6, 10, 11, 20, 21, 35, 36, 90].map((u) => bandOf(u, true))).toEqual([1, 1, 2, 2, 3, 3, 4, 4, 5, 5]);
    expect(bandOf(0, false)).toBe(0);
  });
  it("units are rounded to whole units before they are banded", () => {
    expect(bandOf(5.4, true)).toBe(1);
    expect(bandOf(5.5, true)).toBe(2);
  });
  it("a session with no work worked out still makes it a training day, at the lightest band", () => {
    expect(bandOf(0, true)).toBe(1);
    const g = yearGrid(heatDays({ "2026-11-17": [s("Walk", null, "W")] }), { today: TODAY, weeks: 2 });
    expect(cell(g, "2026-11-17").level).toBe(1);
  });
  it("a day's work is all its sessions added: 10 sets + a 45 min run (15) = 25 units", () => {
    const g = yearGrid(heatDays({ "2026-11-17": [s("Upper", 50), s("Run", 45, "R")] }), { today: TODAY, weeks: 2 });
    expect(cell(g, "2026-11-17")).toMatchObject({ units: 25, sets: 10, runMin: 45, level: 4 });
  });
  it("kinds weigh the same scale: 30 sets, a 90 min run, and a 3 hour walk are all 30 units", () => {
    const g = yearGrid(heatDays({ "2026-11-16": [s("Heavy", 60, "S", 30)], "2026-11-17": [s("Long run", 90, "R")], "2026-11-18": [s("Hike", 300, "W")] }), { today: TODAY, weeks: 2 });
    expect(["2026-11-16", "2026-11-17", "2026-11-18"].map((d) => [cell(g, d).units, cell(g, d).level])).toEqual([[30, 4], [30, 4], [30, 4]]);
  });
  it("the bands do not depend on how the athlete usually trains (a light month stays light)", () => {
    const a = yearGrid(heatDays({ "2026-11-17": [s("Short", 20, "S", 4)] }), { today: TODAY, weeks: 2 });
    const b = yearGrid(heatDays({ "2026-11-17": [s("Short", 20, "S", 4)], "2026-11-18": [s("Long", 150, "S", 40)] }), { today: TODAY, weeks: 2 });
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
    expect(cell(g, "2026-11-16")).toMatchObject({ ring: "met", level: 2 });
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
  it("53 columns (a year) on a desktop, ending on the week of today; 13 on a phone, right-aligned to the same week", () => {
    expect(YEAR_WEEKS).toBe(53);
    expect(PHONE_WEEKS).toBe(13);
    expect(g.columns).toHaveLength(53);
    expect(g.columns.every((c) => c.cells.length === 7)).toBe(true);
    expect(g.columns.at(-1)!.monday).toBe("2026-11-23");
    const phone = yearGrid({}, { today: TODAY, weeks: PHONE_WEEKS });
    expect(phone.columns).toHaveLength(13);
    expect(phone.columns[0].monday).toBe(g.columns[YEAR_WEEKS - PHONE_WEEKS].monday);
  });
  it("names a month above the column that holds its 1st", () => {
    expect(g.columns.filter((c) => c.month).map((c) => c.month).slice(-3)).toEqual(["Sep", "Oct", "Nov"]);
  });
  it("names a day", () => expect(gridDay("2026-11-11")).toBe("Wed Nov 11"));
});

describe("raw stats in the readout, not the units", () => {
  it('"22 sets · 45 min run"', () => {
    const d = heatDays({ "2026-11-17": [s("Upper", 50, "S", 22), s("Run", 45, "R")] });
    const g = yearGrid(d, { today: TODAY, weeks: 2 });
    expect(rawStats(cell(g, "2026-11-17"))).toBe("22 sets · 45 min run");
    expect(readout(cell(g, "2026-11-17"))).toBe("Tue Nov 17 · Upper, Run · 22 sets · 45 min run");
  });
  it("a walk and mobility say their minutes", () => {
    expect(rawStats({ sets: 0, runMin: 0, walkMin: 30, mobMin: 15, minutes: 45 })).toBe("30 min walk · 15 min mobility");
  });
  it("a session with only a time keeps showing it", () => {
    expect(rawStats({ sets: 0, runMin: 0, walkMin: 0, mobMin: 0, minutes: 40 })).toBe("40 min");
    expect(rawStats({ sets: 0, runMin: 0, walkMin: 0, mobMin: 0, minutes: 0 })).toBeNull();
  });
});

describe("the one-line readout", () => {
  const challenge = { name: "75 Hard", today: TODAY };
  const d = heatDays({ "2026-11-14": [s("Long run", 52, "R")], "2026-11-11": [s("Lower A", 64)], "2026-11-12": [s("Imported", null, null, 0)] }, { name: "75 Hard", days: { "2026-11-14": "open", "2026-11-11": "met", "2026-11-23": "open" } });
  const g = yearGrid(d, { today: TODAY });
  it("day, workout, raw stats (never the units), and the challenge", () => {
    expect(readout(cell(g, "2026-11-14"), challenge)).toBe("Sat Nov 14 · Long run · 52 min run · 75 Hard: not met");
    expect(readout(cell(g, "2026-11-11"), challenge)).toBe("Wed Nov 11 · Lower A · 10 sets · 75 Hard: met");
  });
  it("today's open ring says it is still going", () => {
    expect(readout(cell(g, "2026-11-23"), challenge)).toBe("Mon Nov 23 · no session · 75 Hard: still open");
  });
  it("without a challenge, no challenge text; with no minutes, nothing is invented", () => {
    expect(readout(cell(g, "2026-11-14"))).toBe("Sat Nov 14 · Long run · 52 min run");
    expect(readout(cell(g, "2026-11-12"))).toBe("Thu Nov 12 · Imported");
  });
  it("a day to come, and before anything is touched the latest training day", () => {
    expect(readout(cell(g, "2026-11-24"))).toBe("Tue Nov 24 · not yet");
    expect(latestTrained(g)?.day).toBe("2026-11-14");
  });
});

describe("the heatmap component", () => {
  const c = read("components/athlete/YearHeatmap.tsx");
  it("cells are display-only (the arrows are the only buttons); a tap opens a small tooltip, not a line of text under the grid", () => {
    expect(c.match(/<button/g)?.length).toBe(2);
    expect(c).toContain('role="tooltip"');
    expect(c).not.toMatch(/tnum mt-3 min-h-\[22px\]/);
  });
  it("one accent (not the purple of the reference); the ring is a closed circle or one with a gap", () => {
    expect(c).toContain("var(--dusk-teal)");
    expect(c).not.toMatch(/purple|violet/i);
    expect(c).toContain("strokeDasharray");
  });
  it("shows the last 13 weeks on a phone and the year from md up, with no sideways scroll", () => {
    expect(c).toContain("max-md:hidden");
    expect(c).toContain("YEAR_WEEKS - PHONE_WEEKS");
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

describe("moving the window back", () => {
  it("back N weeks ends N weeks earlier, with no future days", () => {
    const now = yearGrid({}, { today: TODAY, weeks: PHONE_WEEKS });
    const earlier = yearGrid({}, { today: TODAY, weeks: PHONE_WEEKS, back: PHONE_WEEKS });
    expect(earlier.columns.at(-1)!.monday).toBe(now.columns[0].monday.replace(now.columns[0].monday, new Date(Date.parse(`${now.columns[0].monday}T00:00:00Z`) - 7 * 86400000).toISOString().slice(0, 10)));
    expect(earlier.columns.flatMap((c) => c.cells).some((c) => c.future)).toBe(false);
  });
  it("the back arrow has somewhere to go only while there is training before the window", () => {
    const byDay = heatDays({ "2026-03-02": [s("Upper", null)] });
    expect(hasEarlier(byDay, "2026-08-24")).toBe(true);
    expect(hasEarlier(byDay, "2026-03-02")).toBe(false);
    expect(hasEarlier({}, "2026-08-24")).toBe(false);
  });
  it("the period reads as months, with the year only when it crosses one", () => {
    expect(rangeLabel("2026-08-24", "2026-11-16")).toBe("Aug – Nov 2026");
    expect(rangeLabel("2025-12-01", "2026-11-23")).toBe("Dec 2025 – Nov 2026");
  });
});
