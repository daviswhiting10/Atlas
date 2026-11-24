import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { bestSplit, clock, fromMetres, METRES_PER_MILE, paceSecPerMile, parseClock, readSplits, toMetres } from "./cardio";

const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

describe("distance", () => {
  it("is stored in metres from miles or kilometres", () => {
    expect(toMetres(1, "mi")).toBe(1609);
    expect(toMetres(4, "mi")).toBe(6437);
    expect(toMetres(5, "km")).toBe(5000);
    expect(fromMetres(METRES_PER_MILE * 4, "mi")).toBeCloseTo(4, 6);
  });
});

describe("pace is per mile, and never made up", () => {
  it("4 miles in 42 minutes is 10:30", () => {
    expect(clock(paceSecPerMile(toMetres(4, "mi"), 42 * 60)!)).toBe("10:30");
  });
  it("no distance or no time: no pace", () => {
    expect(paceSecPerMile(null, 600)).toBeNull();
    expect(paceSecPerMile(0, 600)).toBeNull();
    expect(paceSecPerMile(1609, 0)).toBeNull();
    expect(paceSecPerMile(1609, null)).toBeNull();
  });
});

describe("clock and typed times", () => {
  it("formats minutes and seconds, and hours when there are some", () => {
    expect(clock(630)).toBe("10:30");
    expect(clock(59)).toBe("0:59");
    expect(clock(3900)).toBe("1:05:00");
  });
  it("reads m:ss, or a bare number as minutes; anything else is not a time", () => {
    expect(parseClock("10:42")).toBe(642);
    expect(parseClock("42")).toBe(2520);
    expect(parseClock(" 9:05 ")).toBe(545);
    for (const bad of ["", "abc", "10:75", "-5", "1:2:3", "10.5"]) expect(parseClock(bad)).toBeNull();
  });
});

describe("splits", () => {
  it("the fastest split, by place", () => {
    expect(bestSplit([642, 635, 631, 622])).toEqual({ index: 4, seconds: 622 });
    expect(bestSplit([])).toBeNull();
  });
  it("read back from storage: only positive numbers", () => {
    expect(readSplits([642, 635, "x", -3, 0, null, 631.4])).toEqual([642, 635, 631]);
    expect(readSplits(null)).toEqual([]);
    expect(readSplits({})).toEqual([]);
  });
});

describe("the quick-log action", () => {
  const a = read("lib/actions/athlete.ts");
  const fn = a.slice(a.indexOf("export async function logCardio"), a.indexOf("export async function exerciseSeries"));
  it("makes a finished off-plan session with the type, minutes and optional distance, for the signed-in athlete", () => {
    expect(fn).toContain("await requireAthlete()");
    expect(fn).toContain('source: "OFF_PLAN"');
    expect(fn).toContain("completedAt: now");
    expect(fn).toContain("durationMin: minutes");
    expect(fn).toContain("activity,");
    expect(fn).toContain("distanceM: distance ?");
  });
  it("minutes are a whole number 1 to 600, the type one of three", () => {
    expect(a).toContain("minutes: z.number().int().min(1).max(600)");
    expect(a).toContain('activity: z.enum(["RUN", "WALK", "OTHER"])');
  });
});

describe("the quick-log sheet", () => {
  const sheet = read("components/athlete/QuickCardioSheet.tsx");
  it("is two taps: a minutes chip, then Save; the type starts as the last used", () => {
    expect(sheet).toContain("const CHIPS = [20, 30, 45];");
    expect(sheet).toContain('const KEY = "atlas.quickcardio.type";');
    expect((sheet.match(/<button/g) ?? []).length).toBe(1 + 1 + 1 + 1); // Close, one per type (mapped), one per chip (mapped), Save
  });
  it("Save waits for valid minutes and a valid distance", () => {
    expect(sheet).toContain("disabled={pending || !minutesOk || !distanceOk}");
  });
  it("is on the athlete's Progress, in both the sparse and the full history", () => {
    expect(read("components/athlete/ProgressScreen.tsx")).toContain("quickLog />");
    const h = read("components/athlete/HistoryCalendar.tsx");
    expect(h).toContain("{quickLog && (");
    expect(h.indexOf("{quickLog && (")).toBeGreaterThan(h.indexOf("calendar.kind === \"thin\""));
  });
});
