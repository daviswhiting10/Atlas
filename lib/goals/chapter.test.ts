import { describe, expect, it } from "vitest";
import { dayToDate } from "@/lib/sessions/day";
import { freezeChapter, type ChapterSession } from "./chapter";
import { endOfDay } from "./days";
import { GoalRules } from "./rules";

const TZ = "America/New_York";
const noon = (day: string) => dayToDate(day, TZ);
const rules = (days: number) =>
  GoalRules.parse({
    length: { days },
    onMiss: "reset",
    rules: [
      { key: "w", label: "Workout", kind: "sessions", per: "day", min: 1, where: { minMinutes: 30 } },
      { key: "water", label: "Water", kind: "check_in", per: "day", value: "done" },
    ],
  });
const goal = (days: number, endDay: string) => ({ name: "Test goal", category: "challenge" as const, startDay: "2026-01-01", timeZone: TZ, rules: rules(days), endedAt: endOfDay(endDay, TZ) });
const sess = (day: string, durationMin: number | null = 40, sets = 10): ChapterSession => ({ id: `s-${day}`, date: noon(day), durationMin, sets });
const water = (day: string) => ({ ruleKey: "water", day, workoutLogId: null, excuse: false });
const SEALED = new Date("2026-03-01T12:00:00Z");

describe("freezeChapter", () => {
  it("writes down a goal that was completed on the first try", () => {
    const d = ["2026-01-01", "2026-01-02", "2026-01-03"];
    const c = freezeChapter(goal(3, "2026-01-03"), d.map((x) => sess(x)), d.map(water), SEALED);
    expect(c).toMatchObject({
      v: 1,
      name: "Test goal",
      outcome: "completed",
      line: "Completed. 3 days.",
      range: { startDay: "2026-01-01", endDay: "2026-01-03", days: 3 },
      numbers: { sessions: 3, sets: 30, minutes: 120, activeDays: 3, bestRun: { days: 3, from: "2026-01-01", to: "2026-01-03" } },
      attempts: [{ from: "2026-01-01", to: "2026-01-03", days: 3 }],
    });
    expect(c.strip).toEqual({ unit: "day", cells: ["met", "met", "met"] });
    expect(c.rules).toEqual([
      { key: "w", label: "Workout", met: 3, of: 3 },
      { key: "water", label: "Water", met: 3, of: 3 },
    ]);
    expect(c.sealedAt).toBe(SEALED.toISOString());
  });

  it("remembers the attempts that came first", () => {
    const d = ["2026-01-01", "2026-01-03", "2026-01-04", "2026-01-05"]; // Jan 2 skipped
    const c = freezeChapter(goal(3, "2026-01-05"), d.map((x) => sess(x)), d.map(water), SEALED);
    expect(c.line).toBe("Completed. 3 days, second attempt.");
    expect(c.attempts).toEqual([
      { from: "2026-01-01", to: "2026-01-01", days: 1 },
      { from: "2026-01-03", to: "2026-01-05", days: 3 },
    ]);
    expect(c.strip.cells).toEqual(["met", "rest", "met", "met", "met"]);
    expect(c.numbers.bestRun).toEqual({ days: 3, from: "2026-01-03", to: "2026-01-05" });
  });

  it("gives an ended goal the same record, in plain words", () => {
    const d = ["2026-01-01", "2026-01-02"];
    const c = freezeChapter(goal(75, "2026-01-03"), d.map((x) => sess(x)), d.map(water), SEALED);
    expect(c.outcome).toBe("ended");
    expect(c.line).toBe("Ended on day 2.");
    expect(c.strip.cells).toEqual(["met", "met", "rest"]); // Jan 3: nothing done before it ended
    expect(c.range).toEqual({ startDay: "2026-01-01", endDay: "2026-01-03", days: 3 });
    expect(JSON.stringify(c)).not.toMatch(/miss|fail|lost|broke/i);
  });

  it("shows a half-done day as partial", () => {
    const c = freezeChapter(goal(75, "2026-01-02"), [sess("2026-01-01"), sess("2026-01-02")], [water("2026-01-01")], SEALED);
    expect(c.strip.cells).toEqual(["met", "partial"]);
    expect(c.rules.find((r) => r.key === "water")).toMatchObject({ met: 1, of: 2 });
  });

  it("leaves minutes out when under half the sessions have a duration", () => {
    const d = ["2026-01-01", "2026-01-02", "2026-01-03"];
    const c = freezeChapter(goal(75, "2026-01-03"), [sess(d[0], null), sess(d[1], null), sess(d[2], 40)], d.map(water), SEALED);
    expect(c.numbers.minutes).toBeNull();
  });

  it("doesn't count sessions outside the goal's days", () => {
    const c = freezeChapter(goal(75, "2026-01-02"), [sess("2025-12-30"), sess("2026-01-01"), sess("2026-01-02"), sess("2026-01-09")], [water("2026-01-01"), water("2026-01-02")], SEALED);
    expect(c.numbers.sessions).toBe(2);
  });

  it("is the same every time, and ignores when it's sealed", () => {
    const d = ["2026-01-01", "2026-01-02"];
    const a = freezeChapter(goal(75, "2026-01-02"), d.map((x) => sess(x)), d.map(water), SEALED);
    const b = freezeChapter(goal(75, "2026-01-02"), d.map((x) => sess(x)), d.map(water), new Date("2026-06-01T00:00:00Z"));
    expect({ ...a, sealedAt: "" }).toEqual({ ...b, sealedAt: "" });
  });
});
