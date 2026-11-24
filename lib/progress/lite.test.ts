import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { ExerciseProgress, ProgressData } from "@/lib/athlete/data";
import type { SessionPoint } from "@/lib/plan/overload";
import type { CalendarSession, HistoryCalendar } from "@/lib/history/calendar";
import { historyView } from "@/lib/history/view";
import { liteProgress } from "./lite";
import { overallProgress } from "./overall";
import { defaultLift } from "./default-lift";

const read = (p: string) => readFileSync(new URL(`../../${p}`, import.meta.url), "utf8");
const pt = (date: string, e1rm: number): SessionPoint => ({ date, weight: e1rm, reps: 5, e1rm, volume: e1rm * 5, sets: 3, deload: false, record: false } as SessionPoint);
const lift = (id: string, base: number, n = 12): ExerciseProgress => ({
  exerciseId: id, name: id, muscles: ["chest"], loaded: true, timed: false, target: null,
  series: Array.from({ length: n }, (_, i) => pt(`2026-0${1 + Math.floor(i / 4)}-${String(1 + (i % 4) * 7).padStart(2, "0")}`, base + i * 2)),
});
const data = (exercises: ExerciseProgress[]): ProgressData => ({ exercises, totals: { sessions: 40, volume: 1, sets: 1, prs: 1, streak: 1, since: "2026-01-01" }, recentPRs: [], stalled: [] });

describe("liteProgress", () => {
  const full = data([lift("bench", 135), lift("squat", 185), lift("row", 95, 3)]);
  const lite = liteProgress(full);
  it("the overall line the server works out is the one the browser used to", () => {
    expect(lite.overall).toEqual(overallProgress(full.exercises));
  });
  it("each lift keeps its id, name, kind and session count, and loses its history, except the one the screen opens on", () => {
    expect(lite.data.exercises.map((e) => [e.exerciseId, e.name, e.loaded, e.timed, e.count, e.series.length])).toEqual([
      ["bench", "bench", true, false, 12, 12],
      ["squat", "squat", true, false, 12, 0],
      ["row", "row", true, false, 3, 0],
    ]);
    expect(lite.data.exercises[0].series).toEqual(full.exercises[0].series);
  });
  it("the opening lift is the one ProgressView opens on, so it never fetches it", () => {
    expect(defaultLift(lite.data.exercises)).toBe("bench");
    expect(read("components/athlete/ProgressView.tsx")).toContain("defaultLift(data.exercises, THIN)");
    expect(read("components/athlete/ProgressView.tsx")).toContain("const THIN = 3;"); // the same bar as defaultLift's default
  });
  it("everything else in the data is untouched", () => {
    expect(lite.data.totals).toEqual(full.totals);
    expect(lite.data.recentPRs).toEqual(full.recentPRs);
  });
  it("is much smaller to send", () => {
    const many = data(Array.from({ length: 14 }, (_, i) => lift(`lift${i}`, 100 + i * 5, 30)));
    expect(JSON.stringify(liteProgress(many).data).length).toBeLessThan(JSON.stringify(many).length / 8);
  });
});

describe("historyView: only what the heatmap draws is sent", () => {
  const s = (id: string, sets: number): CalendarSession => ({ id, title: "Upper A", sets, minutes: 50, mode: "S" as const, record: true, href: `/workouts/${id}`, work: { sets, runMin: 0, walkMin: 0, mobMin: 0, units: sets } });
  const grid = {
    kind: "grid", sessions: 2, today: "2026-11-23", summary: "1 of the last 1 weeks active, 2 sessions",
    rows: [{ monday: "2026-11-23", month: "Nov", chapter: null, days: [] }],
    byDay: { "2026-11-20": [s("a", 10), s("b", 6)], "2026-11-21": [] },
  } as unknown as HistoryCalendar;
  const v = historyView(grid);
  it("a grid keeps the day totals and drops rows, ids, links and record flags", () => {
    expect(v).toEqual({ kind: "grid", sessions: 2, today: "2026-11-23", summary: "1 of the last 1 weeks active, 2 sessions", challenge: null, days: { "2026-11-20": { sets: 16, minutes: 100, units: 16, runMin: 0, walkMin: 0, mobMin: 0, titles: ["Upper A", "Upper A"], mode: "S", ring: null } } });
    expect(JSON.stringify(v)).not.toMatch(/rows|href|record|"id"/);
  });
  it("empty and thin pass through", () => {
    expect(historyView({ kind: "empty" })).toEqual({ kind: "empty" });
    const first = { ...s("a", 3), day: "2026-11-01" };
    expect(historyView({ kind: "thin", sessions: 1, first })).toEqual({ kind: "thin", sessions: 1, first });
  });
});

describe("the Progress screen is wired to send less", () => {
  it("the screen sends the lite data, the server's overall line and the loader", () => {
    const s = read("components/athlete/ProgressScreen.tsx");
    expect(s).toContain("liteProgress(data)");
    expect(s).toContain("overall={lite.overall}");
    expect(s).toContain("loadSeries={exerciseSeries}");
    expect(s).toContain("historyView(calendar)");
  });
  it("a picked lift's history is fetched (and only for the signed-in athlete)", () => {
    const v = read("components/athlete/ProgressView.tsx");
    expect(v).toContain("loadSeries({ exerciseIds: fresh })");
    expect(v).toContain("if (sheet) fetchSeries(");
    expect(v).toContain("useLoaded(loadProgress, sheet || exercise != null)");
    const a = read("lib/actions/athlete.ts");
    const fn = a.slice(a.indexOf("export async function exerciseSeries"), a.indexOf("export async function finishWorkout"));
    expect(fn).toContain("await requireAthlete()");
    expect(fn).toContain("getProgress()");
  });
  it("the coach's view of a client still gets full data (nothing to fetch there)", () => {
    expect(read("app/(dashboard)/clients/[id]/progress/page.tsx")).not.toContain("liteProgress");
  });
  it("the charts load on demand", () => {
    const v = read("components/athlete/ProgressView.tsx");
    expect(v).toContain('import("./OverallChart")');
    expect(v).toContain('import("./ProgressChart")');
    expect(v).not.toMatch(/^import \{ (Overall|Progress)Chart \}/m);
    expect(v).not.toContain("next/dynamic"); // Suspense holds a reveal back 300 ms even when the code is already there
  });
});
