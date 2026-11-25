import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { barTip, lastDays } from "./coach/glance";

const sess = (id: string, title: string, sets: number) => ({ id, title, sets, minutes: null, work: {} as never, mode: null, record: false, href: `/s/${id}` });
describe("the Last 30 days bars carry their sessions", () => {
  const d = lastDays({ "2026-11-21": [sess("a", "Upper A", 14)], "2026-11-23": [sess("b", "Lower", 6), sess("c", "Lower", 4)] }, "2026-11-23");
  it("tooltip: date · workout · sets", () => {
    expect(barTip(d[1])).toContain("no session");
    const nov21 = d.find((x) => x.day === "2026-11-21")!;
    expect(barTip(nov21)).toBe("Nov 21 · Upper A · 14 sets");
  });
  it("two sessions in a day: names deduped, sets added", () => {
    expect(barTip(d[29])).toBe("Nov 23 · Lower · 10 sets");
  });
});
describe("wiring", () => {
  const r = (p: string) => readFileSync(new URL(p, import.meta.url), "utf8");
  it("coach chart: hover tip for a mouse, tap opens the session sheet", () => {
    const s = r("../components/coach/ClientGlance.tsx");
    expect(s).toContain('e.pointerType === "mouse"');
    expect(s).toContain("SessionSheet");
    expect(s).toContain("clientSessionSummary");
  });
  it("athlete chart: a bar tap opens the same sheet; the tooltip names the workout and sets", () => {
    expect(r("../components/athlete/ProgressChart.tsx")).toContain("onPick");
    expect(r("../components/athlete/ProgressView.tsx")).toContain("SessionSheet");
    expect(r("../components/athlete/ProgressScreen.tsx")).toContain('by: "workoutId"');
  });
  it("the coach's summary is workspace-scoped", () => {
    expect(r("./actions/workout-logger.ts")).toContain("client: { workspaceId }");
  });
});
