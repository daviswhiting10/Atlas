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

describe("a tap on a heatmap day opens its sessions", () => {
  const y = r("../components/athlete/YearHeatmap.tsx");
  it("the tooltip comes first; the same day again (a mouse has hovered it already) opens it", () => {
    expect(y).toContain("tip?.day === day && c && !c.future && c.titles.length > 0");
    expect(y).toContain("onOpenDay(day)");
    expect(y).toContain("Tap again to open");
  });
  it("the sessions are fetched when asked (the page carries no ids), own data only", () => {
    expect(r("../app/(client)/progress/page.tsx")).toContain("loadDay={historyDaySessions}");
    expect(r("./actions/athlete.ts")).toContain("export async function historyDaySessions");
  });
  it("the demo opens its own sample day, read-only", () => {
    expect(r("../app/demo/progress/page.tsx")).toContain("loadDay={demoHistoryDay}");
  });
});
