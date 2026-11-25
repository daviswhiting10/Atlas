import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { sinceLabel } from "@/components/athlete/ProgressView";

describe("the chart headline names its baseline", () => {
  it("reps and est. 1RM say since when", () => {
    expect(sinceLabel("Reps", "2026-11-21")).toBe("reps since Nov 21");
    expect(sinceLabel("Est. 1RM", "2026-11-21")).toBe("est. 1RM since Nov 21");
  });
});
describe("an unscheduled day is open, not a rest day", () => {
  const s = readFileSync(new URL("../components/athlete/PlanWeek.tsx", import.meta.url), "utf8");
  it("no Rest label; a neutral Log a workout invitation", () => {
    expect(s).not.toContain("Rest day");
    expect(s).not.toContain("Nothing planned.");
    expect(s).not.toContain('eyebrow("Rest")');
    expect(s).toContain("Log a workout\n");
  });
});
describe("the calendar key matches the day card", () => {
  const s = readFileSync(new URL("../components/athlete/PlanWeek.tsx", import.meta.url), "utf8");
  it("an empty day is Open in the key and to a screen reader", () => {
    expect(s).toContain('<DayIcon kind={null} className="h-3.5 w-3.5" /> Open</span>');
    expect(s).not.toContain('/> Rest</span>');
    expect(s).toContain(': ", open"}');
  });
});
