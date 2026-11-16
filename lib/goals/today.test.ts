import { describe, expect, it } from "vitest";
import type { LoadedGoal, GoalRow, GoalSession } from "./data";
import { evaluateGoal, type CheckInInput } from "./evaluate";
import { GoalRules } from "./rules";
import { DEFAULT_DIET, SEVENTY_FIVE_HARD } from "./templates";
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

describe("todayView: the diet, the one thing a person writes", () => {
  it("a goal without its own words shows the default diet, on the diet row and in the collapsed area", () => {
    const v = todayView(loaded(withRules((r) => (r.key === "diet" && r.kind === "check_in" ? { ...r, detail: undefined } : r)), "2026-11-15"), NOW);
    expect(v.manage.diet).toBe(DEFAULT_DIET);
    expect(v.rules.find((r) => r.key === "diet")?.detail).toBe(DEFAULT_DIET);
  });

  it("shows the person's own words, and no other rule carries a line", () => {
    const v = todayView(loaded(withRules((r) => (r.key === "diet" && r.kind === "check_in" ? { ...r, detail: "Keto, no sugar" } : r)), "2026-11-15"), NOW);
    expect(v.manage.diet).toBe("Keto, no sugar");
    expect(v.rules.filter((r) => r.detail).map((r) => r.key)).toEqual(["diet"]);
  });

  it("a goal with no diet rule has none to edit", () => {
    const rules = GoalRules.parse({ ...SEVENTY_FIVE_HARD.rules, rules: SEVENTY_FIVE_HARD.rules.rules.filter((r) => r.key !== "diet") });
    expect(todayView(loaded(rules, "2026-11-15"), NOW).manage.diet).toBeNull();
  });

  it("credits the challenge", () => {
    expect(todayView(loaded(SEVENTY_FIVE_HARD.rules, "2026-11-15"), NOW).manage.credit).toBe("75 Hard by Andy Frisella");
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
