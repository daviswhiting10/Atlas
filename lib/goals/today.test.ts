import { describe, expect, it } from "vitest";
import type { LoadedGoal, GoalRow, GoalSession } from "./data";
import { evaluateGoal, type CheckInInput } from "./evaluate";
import { GoalRules } from "./rules";
import { SEVENTY_FIVE_HARD } from "./templates";
import { todayView } from "./today";

const NOW = new Date("2026-11-15T12:00:00Z");

/** A running goal as the card sees it, judged by the real evaluator. */
function loaded(rules: GoalRules, startDay: string, sessions: GoalSession[] = [], checkIns: CheckInInput[] = []): LoadedGoal {
  const goal: GoalRow = { id: "g1", clientId: "c1", name: "75 Hard", category: "challenge", templateKey: "builtin:75hard", timeZone: "UTC", startDay, status: "ACTIVE", endedAt: null, rules };
  const result = evaluateGoal({ startDay, timeZone: "UTC", rules }, sessions.map(({ id, date, durationMin }) => ({ id, date, durationMin })), checkIns, NOW);
  return { goal, result, sessions, checkIns: checkIns.map((c, i) => ({ ...c, id: "c" + i })), chapter: null, sealed: false, sealsAt: null };
}

/** A finished one-tap workout (no sets) at noon UTC on `day`. */
const workout = (id: string, day: string, minutes: number | null): GoalSession => ({ id, date: new Date(day + "T12:00:00Z"), day, title: null, durationMin: minutes, sets: 0 });

const withRules = (change: (r: GoalRules["rules"][number]) => GoalRules["rules"][number], extra: Record<string, unknown> = {}) =>
  GoalRules.parse({ ...SEVENTY_FIVE_HARD.rules, ...extra, rules: SEVENTY_FIVE_HARD.rules.rules.map(change) });

describe("todayView: the rules in the collapsed area", () => {
  it("lists every rule, in order, and each running one can be stopped", () => {
    const v = todayView(loaded(SEVENTY_FIVE_HARD.rules, "2026-11-15"), NOW);
    expect(v.manage.rules.map((r) => r.label)).toEqual(["Two workouts, 45+ min", "One of them outdoors", "Water", "Reading", "Diet", "Progress photo"]);
    expect(v.manage.rules.every((r) => r.removable)).toBe(true);
  });

  it("a rule already set to stop (after today) is shown but can't be stopped again", () => {
    const rules = withRules((r) => (r.key === "water" ? { ...r, toDay: "2026-11-15" } : r));
    const water = todayView(loaded(rules, "2026-11-15"), NOW).manage.rules.find((r) => r.key === "water");
    expect(water).toEqual({ key: "water", label: "Water", removable: false });
  });

  it("a rule that stopped before today is not shown", () => {
    const rules = withRules((r) => (r.key === "water" ? { ...r, toDay: "2026-11-14" } : r));
    expect(todayView(loaded(rules, "2026-11-10"), NOW).manage.rules.map((r) => r.key)).not.toContain("water");
  });
});

describe("todayView: days from before Atlas", () => {
  it("a back-dated start says how many days count as done, and which", () => {
    const rules = withRules((r) => r, { carriedThrough: "2026-11-14" });
    expect(todayView(loaded(rules, "2026-11-08"), NOW).manage.carried).toEqual({ days: 7, from: "2026-11-08", to: "2026-11-14" });
  });

  it("a goal started today has none", () => {
    expect(todayView(loaded(SEVENTY_FIVE_HARD.rules, "2026-11-15"), NOW).manage.carried).toBeNull();
  });
});

describe("todayView: the workout slots", () => {
  it("75 Hard: two workouts a day, 45 minutes by default, with the outdoors tag", () => {
    const v = todayView(loaded(SEVENTY_FIVE_HARD.rules, "2026-11-15"), NOW);
    expect(v.workout).toEqual({ ruleKey: "workouts", need: 2, defaultMinutes: 45, mark: "outdoors" });
    expect(v.rules.find((r) => r.key === "workouts")?.minMinutes).toBe(45);
    expect(v.rules.find((r) => r.key === "water")?.minMinutes).toBeNull();
  });

  it("a goal with no plain per-day sessions rule has no workout rows", () => {
    const rules = GoalRules.parse({ length: { days: 30 }, onMiss: "reset", rules: [{ key: "water", label: "Water", kind: "check_in", per: "day", value: "done" }] });
    expect(todayView(loaded(rules, "2026-11-15"), NOW).workout).toBeNull();
  });

  it("without a minimum, the default is still 45 minutes", () => {
    const rules = GoalRules.parse({ length: { days: 30 }, onMiss: "reset", rules: [{ key: "move", label: "One workout", kind: "sessions", per: "day", min: 1 }] });
    expect(todayView(loaded(rules, "2026-11-15"), NOW).workout).toEqual({ ruleKey: "move", need: 1, defaultMinutes: 45, mark: null });
  });
});

describe("todayView: yesterday's workouts (the 'Yesterday is still open' rows)", () => {
  const tagged = (session: string, day: string): CheckInInput => ({ ruleKey: "outdoors", day, workoutLogId: session, excuse: false });

  it("lists yesterday's finished workouts, with their tags, for yesterday's rows; today's workouts aren't in it", () => {
    const v = todayView(loaded(SEVENTY_FIVE_HARD.rules, "2026-11-13", [workout("y1", "2026-11-14", 45), workout("t1", "2026-11-15", 50)], [tagged("y1", "2026-11-14")]), NOW);
    expect(v.behind?.day).toBe("2026-11-14");
    expect(v.behind?.workout?.sessions).toEqual([{ id: "y1", title: "Workout", minutes: 45, tags: ["outdoors"], sets: 0 }]);
    expect(v.sessions.map((s) => s.id)).toEqual(["t1"]);
  });

  it("what is still open is still listed: one of two workouts leaves 'workouts' open and 'outdoors' met", () => {
    const v = todayView(loaded(SEVENTY_FIVE_HARD.rules, "2026-11-13", [workout("y1", "2026-11-14", 45)], [tagged("y1", "2026-11-14")]), NOW);
    const keys = v.behind?.items.map((i) => i.key) ?? [];
    expect(keys).toContain("workouts");
    expect(keys).not.toContain("outdoors");
  });

  it("yesterday with no workouts has empty workout rows, not none", () => {
    expect(todayView(loaded(SEVENTY_FIVE_HARD.rules, "2026-11-13"), NOW).behind?.workout).toEqual({ sessions: [] });
  });

  it("a goal with no workout slots has no workout rows for yesterday", () => {
    const rules = GoalRules.parse({ length: { days: 30 }, onMiss: "reset", rules: [{ key: "water", label: "Water", kind: "check_in", per: "day", value: "done" }] });
    const v = todayView(loaded(rules, "2026-11-13"), NOW);
    expect(v.behind?.items.map((i) => i.key)).toEqual(["water"]);
    expect(v.behind?.workout).toBeNull();
  });

  it("nothing is open for yesterday on a goal that started today", () => {
    expect(todayView(loaded(SEVENTY_FIVE_HARD.rules, "2026-11-15"), NOW).behind).toBeNull();
  });
});
