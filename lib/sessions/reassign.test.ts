import { describe, expect, it } from "vitest";
import { canMoveTo, remapSets, slotsByWeek } from "./reassign";

describe("a moved session's sets are re-pointed by lift", () => {
  const target = [{ id: "t1", exerciseId: "bench" }, { id: "t2", exerciseId: "row" }];
  it("a set goes to the same lift's row in the new workout", () => {
    expect(remapSets([{ id: "s1", exerciseId: "bench" }, { id: "s2", exerciseId: "row" }], target)).toEqual([{ setId: "s1", assignedWorkoutExerciseId: "t1" }, { setId: "s2", assignedWorkoutExerciseId: "t2" }]);
  });
  it("every set stays: one with no match in the new workout keeps its lift and just isn't tied to a row", () => {
    const r = remapSets([{ id: "s1", exerciseId: "bench" }, { id: "s2", exerciseId: "curl" }, { id: "s3", exerciseId: null }], target);
    expect(r).toHaveLength(3);
    expect(r.map((x) => x.assignedWorkoutExerciseId)).toEqual(["t1", null, null]);
  });
  it("a lift twice in the new workout uses its first row", () => {
    expect(remapSets([{ id: "s", exerciseId: "bench" }], [{ id: "a", exerciseId: "bench" }, { id: "b", exerciseId: "bench" }])[0].assignedWorkoutExerciseId).toBe("a");
  });
});

describe("the slots to choose from", () => {
  const plan = [
    { id: "w2", name: "Lower A", week: 1, date: "2026-11-25", status: "PLANNED" },
    { id: "w1", name: "Upper A", week: 1, date: "2026-11-23", status: "LOGGED", logId: "L1" },
    { id: "w3", name: "Upper B", week: 2, date: "2026-12-01", status: "PLANNED" },
    { id: "w4", name: "Lower B", week: 2, date: "2026-12-03", status: "SKIPPED" },
  ];
  it("by week, in date order, skipped days left out", () => {
    const g = slotsByWeek(plan, "w1");
    expect(g.map((w) => [w.week, w.slots.map((s) => s.id)])).toEqual([[1, ["w1", "w2"]], [2, ["w3"]]]);
  });
  it("logged days are marked, and the session's own day is 'current'", () => {
    const [w1] = slotsByWeek(plan, "w1");
    expect(w1.slots[0]).toMatchObject({ logged: true, current: true });
    expect(w1.slots[1]).toMatchObject({ logged: false, current: false });
  });
  it("only a free day that isn't its own can be picked", () => {
    expect(canMoveTo({ logged: false, current: false })).toBe(true);
    expect(canMoveTo({ logged: true, current: false })).toBe(false);
    expect(canMoveTo({ logged: false, current: true })).toBe(false);
  });
});

import { readFileSync } from "node:fs";
describe("the session mini-summary", () => {
  const read = (p: string) => readFileSync(new URL(`../../${p}`, import.meta.url), "utf8");
  const mini = read("components/athlete/SessionMini.tsx");
  it("View, Reassign to… and a Delete that is red and unmissable", () => {
    expect(mini).toContain("Reassign to…");
    expect(mini).toContain("border-destructive/60 bg-destructive/10 text-[16px] font-semibold text-destructive");
  });
  it("the picker is the plan's weeks and days: logged ones ticked and not pickable, opening near where the session is", () => {
    expect(mini).toContain("✓ Logged");
    expect(mini).toContain("canMoveTo(s)");
    expect(mini).toContain("scrollIntoView");
  });
  it("moving is only for your own sessions, in one transaction, and checks that no set went missing", () => {
    const a = read("lib/actions/athlete.ts");
    const fn = a.slice(a.indexOf("export async function reassignMySession"));
    expect(fn).toContain("where: { id: workoutLogId, clientId }");
    expect(fn).toContain("programAssignment: { clientId }");
    expect(fn).toContain("workoutLog: { is: null }");
    expect(fn).toContain("A set went missing; nothing was moved.");
  });
  it("the plan page offers it; the demo does not", () => {
    expect(read("app/(client)/plan/page.tsx")).toContain("reassign={reassignMySession}");
    expect(read("components/demo/DemoPlanHome.tsx")).not.toContain("reassign");
  });
});
