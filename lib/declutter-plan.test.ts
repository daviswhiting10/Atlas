import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const src = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

describe("Plan: fewer things to tap on the first screen", () => {
  it("New plan and Edit plan are the two buttons at the bottom, not in the header ⋯ and not a row under the week", () => {
    expect(src("components/athlete/PlanWeek.tsx")).not.toContain("Edit plan");
    const h = src("components/nav/HeaderActions.tsx");
    expect(h).not.toContain("Edit plan");
    expect(h).not.toContain("Change goals");
    const p = src("app/(client)/plan/page.tsx");
    expect(p).toContain('href="/plan?view=edit"');
    expect(p).toContain('href="/plan/new"');
    expect(p).not.toContain("Change goals");
    // After everything else on the page; New plan above Edit plan.
    expect(p.indexOf("{newestReport}\n      {/* Making a new plan")).toBeGreaterThan(-1);
    expect(p.indexOf("New plan\n")).toBeLessThan(p.indexOf("Edit plan\n"));
  });
  it("the Plan tab shows only the newest progress report; the older ones are on All weeks", () => {
    const p = src("app/(client)/plan/page.tsx");
    expect(p).toContain("reports.slice(0, 1)");
    expect(p).toContain('view === "all" && rowsOf(reports.slice(1))');
  });
});

describe("the Plan ⋯ menu: Restart plan only", () => {
  it("no Edit plan and no Change goals; Restart plan (W1's) stays, on the Plan tab", () => {
    const h = src("components/nav/HeaderActions.tsx");
    expect(h).not.toContain("Edit plan");
    expect(h).not.toContain("Change goals");
    expect(h).toContain('restartPlan && pathname.startsWith("/plan")');
    expect(h).toContain("Restart plan");
  });
});
