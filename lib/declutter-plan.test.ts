import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const src = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

describe("Plan: fewer things to tap on the first screen", () => {
  it("Edit plan is in the header ⋯ (with Change goals), not a row under the week", () => {
    expect(src("components/athlete/PlanWeek.tsx")).not.toContain("Edit plan");
    const h = src("components/nav/HeaderActions.tsx");
    expect(h).toContain("Edit plan");
    expect(h).toContain("/plan?view=edit");
  });
  it("the Plan tab shows only the newest progress report; the older ones are on All weeks", () => {
    const p = src("app/(client)/plan/page.tsx");
    expect(p).toContain("reports.slice(0, 1)");
    expect(p).toContain('view === "all" && rowsOf(reports.slice(1))');
  });
});
