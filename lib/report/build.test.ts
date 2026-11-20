import { describe, expect, it } from "vitest";
import type { HistorySession } from "@/lib/history/types";
import { buildReport, MAX_CHARTS } from "./build";
import { reportBlocks } from "./blocks";

const START = "2026-01-05";
const names: Record<string, string> = { sq: "Back Squat", bp: "Bench Press", pu: "Band Assisted Pull-Up", pl: "Pull-Up", curl: "Curl" };
let n = 0;
/** One finished session in week `week` of the block (day 0 of that week). */
const session = (week: number, sets: Array<[string, number | null, number]>): HistorySession => {
  const d = new Date(Date.UTC(2026, 0, 5 + (week - 1) * 7, 12));
  return { id: `s${++n}`, date: d, completedAt: d, durationMin: 50, sets: sets.map(([exerciseId, weight, reps]) => ({ exerciseId, weight, reps, completed: true })) };
};
const run = (sessions: HistorySession[], over: Partial<Parameters<typeof buildReport>[0]> = {}) =>
  buildReport({ startDay: START, block: 1, sessions, names, planned: 12, lighterLastWeek: true, timeZone: "UTC", ...over });
const chart = (r: ReturnType<typeof run>, id: string) => r.charts.find((c) => c.exerciseId === id);

describe("improvement rules", () => {
  it("heavier top set at the same reps", () => {
    const r = run([session(1, [["sq", 185, 5]]), session(3, [["sq", 215, 5]])]);
    expect(chart(r, "sq")).toMatchObject({ kind: "weight", gain: "+30 lb", from: "185 to 215" });
  });
  it("heavier at more reps counts too", () => {
    const r = run([session(1, [["sq", 185, 5]]), session(2, [["sq", 195, 6]])]);
    expect(chart(r, "sq")).toMatchObject({ kind: "weight", gain: "+10 lb" });
  });
  it("heavier but fewer reps is not an improvement", () => {
    const r = run([session(1, [["sq", 185, 8]]), session(2, [["sq", 215, 5]])]);
    expect(chart(r, "sq")).toBeUndefined();
    expect(r.eligible).toBe(1);
    expect(r.improved).toBe(0);
  });
  it("more reps at the same weight", () => {
    const r = run([session(1, [["bp", 135, 8]]), session(4, [["bp", 135, 11]])]);
    expect(chart(r, "bp")).toMatchObject({ kind: "reps", gain: "+3 reps", from: "8 to 11 reps at 135 lb" });
  });
  it("bodyweight reps", () => {
    const r = run([session(1, [["pl", null, 7]]), session(2, [["pl", null, 9]])]);
    expect(chart(r, "pl")).toMatchObject({ kind: "reps", gain: "+2 reps", from: "7 to 9 reps" });
  });
  it("the same or worse is not an improvement", () => {
    const r = run([session(1, [["bp", 135, 8]]), session(2, [["bp", 135, 8]]), session(3, [["bp", 125, 8]])]);
    expect(r.charts).toHaveLength(0);
  });
});

describe("assisted lifts (by name)", () => {
  it("less assistance is the gain, and the title says so", () => {
    const r = run([session(1, [["pu", 60, 6]]), session(2, [["pu", 50, 6]]), session(4, [["pu", 40, 6]])]);
    expect(chart(r, "pu")).toMatchObject({ kind: "assist", gain: "20 lb less assistance", from: "60 to 40 lb assist" });
  });
  it("more assistance is never shown", () => {
    const r = run([session(1, [["pu", 40, 6]]), session(2, [["pu", 60, 6]])]);
    expect(chart(r, "pu")).toBeUndefined();
  });
  it("the line rises for an assisted lift", () => {
    const r = run([session(1, [["pu", 60, 6]]), session(2, [["pu", 50, 6]]), session(4, [["pu", 40, 6]])]);
    expect(chart(r, "pu")?.series).toEqual([0, 10, 10, 20]);
  });
});

describe("data needed", () => {
  it("a lift in one week only is skipped", () => {
    const r = run([session(1, [["sq", 185, 5]]), session(1, [["sq", 195, 5]])]);
    expect(r.eligible).toBe(0);
    expect(r.charts).toHaveLength(0);
  });
  it("counts eligible lifts, improved of eligible", () => {
    const r = run([session(1, [["sq", 185, 5], ["bp", 135, 8]]), session(2, [["sq", 195, 5], ["bp", 135, 8]])]);
    expect(r.eligible).toBe(2);
    expect(r.improved).toBe(1);
  });
});

describe("the line", () => {
  it("never dips: a lighter last week keeps the best so far", () => {
    const r = run([session(1, [["sq", 185, 5]]), session(2, [["sq", 205, 5]]), session(3, [["sq", 215, 5]]), session(4, [["sq", 165, 5]])]);
    const s = chart(r, "sq")!.series as number[];
    expect(s).toEqual([185, 205, 215, 215]);
    for (let i = 1; i < s.length; i++) expect(s[i]).toBeGreaterThanOrEqual(s[i - 1]);
  });
  it("carries over a week with no session, and starts where the lift starts", () => {
    const r = run([session(2, [["bp", 135, 8]]), session(4, [["bp", 135, 10]])]);
    expect(chart(r, "bp")!.series).toEqual([null, 8, 8, 10]);
  });
});

describe("the stats", () => {
  it("volume up shows volume", () => {
    const r = run([session(1, [["sq", 100, 10]]), session(2, [["sq", 120, 10]])]);
    expect(r.third).toEqual({ kind: "volume", value: 20 });
  });
  it("a lighter last week is not the comparison", () => {
    const r = run([session(1, [["sq", 100, 10]]), session(2, [["sq", 100, 10]]), session(4, [["sq", 50, 10]])]);
    expect(r.third?.kind).not.toBe("volume");
  });
  it("volume down falls back to PRs set, never a minus", () => {
    // week 1 is the big week; a heavier set later is a PR on a smaller total
    const r = run([session(1, [["sq", 185, 5], ["sq", 100, 20]]), session(2, [["sq", 190, 5]])]);
    expect(r.third).toEqual({ kind: "prs", value: 1 });
  });
  it("no volume rise and no PR shows no third stat", () => {
    const r = run([session(1, [["curl", 30, 10]]), session(2, [["curl", 30, 8]])]);
    expect(r.third).toBeNull();
  });
  it("nothing improved is consistency only", () => {
    const r = run([session(1, [["bp", 135, 8]]), session(2, [["bp", 125, 8]])]);
    expect(r.consistencyOnly).toBe(true);
    expect(r.charts).toHaveLength(0);
    expect(r.sessions).toBe(2);
  });
  it("sessions completed never exceeds those planned", () => {
    const r = run([session(1, [["bp", 135, 8]]), session(2, [["bp", 135, 9]]), session(3, [["bp", 135, 10]])], { planned: 2 });
    expect(r.sessions).toBe(2);
  });
});

describe("the charts", () => {
  it("shows at most eight, biggest relative gain first", () => {
    const ids = Array.from({ length: 11 }, (_, i) => `e${i}`);
    const nm = Object.fromEntries(ids.map((id, i) => [id, `Lift ${i}`]));
    // lift i gains (i + 1) lb on 100 lb: relative gain rises with i
    const r = buildReport({
      startDay: START, block: 1, names: nm, planned: 12, lighterLastWeek: true, timeZone: "UTC",
      sessions: [session(1, ids.map((id) => [id, 100, 5])), session(2, ids.map((id, i) => [id, 101 + i, 5]))],
    });
    expect(r.improved).toBe(11);
    expect(r.charts).toHaveLength(MAX_CHARTS);
    expect(r.charts[0].exerciseId).toBe("e10");
    for (let i = 1; i < r.charts.length; i++) expect(r.charts[i - 1].relative).toBeGreaterThanOrEqual(r.charts[i].relative);
  });
});

describe("which blocks have a report", () => {
  const plan = { id: "a", status: "COMPLETED" as const, startDay: START, lastDay: "2026-03-29", sessionDays: ["2026-01-06", "2026-01-14", "2026-02-02", "2026-03-10", "2026-03-17"] };
  it("a finished block with two weeks of sessions", () => {
    const r = reportBlocks([plan], "2026-03-30");
    expect(r.map((x) => x.block)).toEqual([3, 1]);
  });
  it("not before the block's last day has passed", () => {
    expect(reportBlocks([plan], "2026-02-01").map((x) => x.block)).toEqual([]);
    expect(reportBlocks([plan], "2026-02-02").map((x) => x.block)).toEqual([1]);
  });
  it("a block with one week of sessions has none, and a canceled plan has none", () => {
    expect(reportBlocks([plan], "2026-03-30").some((x) => x.block === 2)).toBe(false);
    expect(reportBlocks([{ ...plan, status: "CANCELED" }], "2026-03-30")).toEqual([]);
  });
});
