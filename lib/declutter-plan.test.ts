import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const src = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

describe("Plan: fewer things to tap on the first screen", () => {
  it("Edit plan and Change goals are two quiet buttons at the bottom, not in the header ⋯ and not a row under the week", () => {
    expect(src("components/athlete/PlanWeek.tsx")).not.toContain("Edit plan");
    const h = src("components/nav/HeaderActions.tsx");
    expect(h).not.toContain("Edit plan");
    expect(h).not.toContain("Change goals");
    const p = src("app/(client)/plan/page.tsx");
    expect(p).toContain('href="/plan?view=edit"');
    expect(p).toContain('href="/you?goals=1"');
    // After everything else on the page.
    expect(p.indexOf("{newestReport}\n      {/* Changing the plan")).toBeGreaterThan(-1);
  });
  it("the Plan tab shows only the newest progress report; the older ones are on All weeks", () => {
    const p = src("app/(client)/plan/page.tsx");
    expect(p).toContain("reports.slice(0, 1)");
    expect(p).toContain('view === "all" && rowsOf(reports.slice(1))');
  });
});
