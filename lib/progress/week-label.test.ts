import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { weekOf } from "./week-label";

describe("weekly labels", () => {
  it("a week's point says it is the week, not the Monday's day", () => {
    expect(weekOf("2026-11-23")).toBe("Week of Nov 23");
  });
  it("the all-lifts chart labels its axis and tooltip by week; the single-lift chart keeps session dates", () => {
    const overall = readFileSync(new URL("../../components/athlete/OverallChart.tsx", import.meta.url), "utf8");
    expect(overall).toContain("tickFormatter={weekOf}");
    expect(overall).toContain("{weekOf(row.week)}");
    const lift = readFileSync(new URL("../../components/athlete/ProgressChart.tsx", import.meta.url), "utf8");
    expect(lift).toContain('format(parseISO(row.date), "EEE, MMM d")');
  });
});
