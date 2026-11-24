import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { summarizePlan } from "./summary";

vi.mock("@/lib/db/client", () => ({ prisma: {} }));

const d = (s: string) => new Date(`${s}T12:00:00Z`);
const row = (over: Partial<Parameters<typeof summarizePlan>[0]> = {}) => ({
  name: "Plan",
  startDate: d("2026-11-02"),
  goalText: null,
  sourceProgram: { goalTags: null, isTemplate: true },
  assignedWorkouts: [
    { id: "a", order: 1, scheduledDate: d("2026-11-02"), status: "PLANNED", workoutLog: { completedAt: d("2026-11-02") } },
    { id: "b", order: 2, scheduledDate: d("2026-11-04"), status: "PLANNED", workoutLog: null },
    { id: "c", order: 1, scheduledDate: d("2026-11-09"), status: "SKIPPED", workoutLog: null },
    { id: "d", order: 2, scheduledDate: d("2026-11-11"), status: "PLANNED", workoutLog: null },
  ],
  ...over,
});

describe("summarizePlan", () => {
  it("counts done and total (skipped leave the total), and the week is the next workout's", () => {
    const s = summarizePlan(row(), null);
    expect(s).toMatchObject({ name: "Plan", done: 1, total: 3, week: 1, totalWeeks: 2 });
  });
  it("with everything done the week is the last one", () => {
    const s = summarizePlan(row({ assignedWorkouts: row().assignedWorkouts.map((w) => ({ ...w, status: "PLANNED", workoutLog: { completedAt: d("2026-11-12") } })) }), null);
    expect(s.week).toBe(s.totalWeeks);
    expect(s.done).toBe(4);
  });
  it("the goal is the plan's own text, trimmed; blank is none", () => {
    expect(summarizePlan(row({ goalText: "  get strong " }), null).goalText).toBe("get strong");
    expect(summarizePlan(row({ goalText: "   " }), null).goalText).toBeNull();
  });
});

describe("the You page", () => {
  it("reads the light plan summary, not the whole plan with every exercise", () => {
    const s = readFileSync(new URL("../../app/(client)/you/page.tsx", import.meta.url), "utf8");
    expect(s).toContain("loadPlanSummary(");
    expect(s).not.toContain("getPlanOverview");
  });
});
