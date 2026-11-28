import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { DEMO_PLAN } from "@/lib/demo/sample";
import { youLine, youPlan } from "@/lib/athlete/you-summary";

describe("the demo's You shows the plan link", () => {
  it("the sample plan makes a plan card and a line", () => {
    const p = youPlan(DEMO_PLAN)!;
    expect(p.name).toBe("Upper / Lower");
    expect(p.total).toBeGreaterThan(0);
    expect(youLine(p)).toMatch(/^Week \d+ of 24 · \d+ of \d+ workouts done$/);
  });
  it("it counts this tab's finished workouts, like Today and Plan, and links into the demo", () => {
    const s = readFileSync(new URL("../components/demo/DemoYou.tsx", import.meta.url), "utf8");
    expect(s).toContain("useDemoPlan(DEMO_PLAN)");
    expect(s).toContain('base="/demo"');
    expect(readFileSync(new URL("../app/demo/you/page.tsx", import.meta.url), "utf8")).toContain("<DemoYou />");
  });
});
