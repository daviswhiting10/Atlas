import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { PlanOverview, WorkoutSummary } from "./overview";
import { upNextView } from "./up-next";

const ex = (name: string, weight: number | null = null) =>
  ({ aweId: name, exerciseId: name, slug: name, name, sets: 3, reps: "6–10", repMin: 6, repMax: 10, unit: "reps", weight, picture: null, section: null }) as WorkoutSummary["exercises"][number];
const wo = (id: string, week: number, status: WorkoutSummary["status"], n = 6, date = "2026-11-16"): WorkoutSummary => ({
  id, name: id, week, date, status, note: null, history: [], deload: false, estMinutes: 50,
  exercises: Array.from({ length: n }, (_, i) => ex(`Ex ${i + 1}`, i === 0 ? 135 : null)),
});
const plan = (workouts: WorkoutSummary[]): PlanOverview => {
  const nextUp = workouts.find((w) => w.status === "PLANNED") ?? null;
  return {
    id: "p", name: "Build muscle", status: "ACTIVE", startDate: "2026-11-16", totalWeeks: 12, currentWeek: nextUp?.week ?? 12,
    generated: true, lighterWeeks: true, prefs: null, goalText: null, note: null,
    blocks: [{ name: "Foundation", weeks: 4, focus: "" }, { name: "Build", weeks: 4, focus: "" }, { name: "Peak", weeks: 4, focus: "" }],
    rationale: [], workouts, nextUp, done: workouts.filter((w) => w.status === "LOGGED").length, rx: {},
  };
};

describe("Plan tab, up next first", () => {
  it("shows up next with three exercises and '+ N more', then the rest of the week", () => {
    const v = upNextView(plan([wo("Upper A", 1, "LOGGED", 6, "2026-11-16"), wo("Lower A", 1, "PLANNED"), wo("Upper B", 1, "PLANNED"), wo("Lower B", 1, "PLANNED"), wo("Next wk", 2, "PLANNED")]));
    expect(v.eyebrow).toBe("Week 1 of 12 · Foundation");
    expect(v.next).toMatchObject({ id: "Lower A", meta: "6 exercises · ~50 min", more: 3 });
    expect(v.next!.lines).toEqual([{ name: "Ex 1", rx: "3 × 6–10 at 135" }, { name: "Ex 2", rx: "3 × 6–10" }, { name: "Ex 3", rx: "3 × 6–10" }]);
    expect(v.weekLabel).toBe("This week · 1 of 4 done");
    expect(v.rows.map((r) => [r.name, r.dot, r.meta])).toEqual([
      ["Upper A", "✓", "Done · Mon"],
      ["Upper B", "3", "6 exercises · ~50 min"],
      ["Lower B", "4", "6 exercises · ~50 min"],
    ]);
  });

  it("a finished plan has no up next", () => {
    const v = upNextView(plan([wo("A", 12, "LOGGED"), wo("B", 12, "SKIPPED")]));
    expect(v.next).toBeNull();
    expect(v.rows.map((r) => r.meta)).toEqual(["Done · Mon", "Skipped"]);
    expect(v.eyebrow).toBe("Week 12 of 12 · Peak");
  });

  it("the page: Change goals under ⋯, no Delete plan until deleteMyPlan exists, edit hidden from coached athletes", () => {
    const page = readFileSync(new URL("../../app/(client)/plan/page.tsx", import.meta.url), "utf8");
    expect(page).toContain("<PlanMenu changeGoals={athlete.selfServe} />");
    expect(page).not.toMatch(/onDelete|deleteMyPlan/);
    expect(page).toMatch(/searchParams\?\.view === "edit" && !locked/);
    const menu = readFileSync(new URL("../../components/athlete/PlanMenu.tsx", import.meta.url), "utf8");
    expect(menu).toContain("if (!changeGoals && !onDelete) return null;");
  });
});
