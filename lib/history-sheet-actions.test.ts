import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const r = (p: string) => readFileSync(new URL(p, import.meta.url), "utf8");
describe("History day sheet: Reassign + Delete", () => {
  const h = r("../components/athlete/HistoryCalendar.tsx");
  it("uses the Plan calendar's SessionMini, buttons only", () => {
    expect(h).toContain("<SessionMini actionsOnly");
  });
  it("Reassign only for a session on the plan; a quick run or walk gets Delete only", () => {
    expect(h).toContain("move={s.planned ? actions.reassign : undefined}");
    expect(h).toContain("loadWeeks={s.planned ? actions.loadWeeks : undefined}");
  });
  it("the sheet closes after a delete or a move", () => {
    expect(h).toContain("onChanged={onClose}");
    expect(r("../components/athlete/SessionMini.tsx")).toContain("onChanged?.()");
  });
  it("the plan's days are read when Reassign is tapped, not on every Progress load", () => {
    expect(r("../components/athlete/SessionMini.tsx")).toContain("loadWeeks?.(logId)");
    expect(r("../app/(client)/progress/page.tsx")).toContain("loadWeeks={reassignSlots}");
  });
  it("the demo and the coach's view stay read-only", () => {
    expect(r("../app/demo/progress/page.tsx")).not.toContain("deleteSession");
    expect(r("../app/(dashboard)/clients/[id]/(overview)/page.tsx")).not.toContain("deleteSession");
  });
  it("a session knows if it is on the plan", () => {
    expect(r("./history/load.ts")).toContain("planned: r.assignedWorkoutId != null");
  });
});
