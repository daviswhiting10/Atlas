import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const s = readFileSync(new URL("../app/(dashboard)/intake/IntakeForm.tsx", import.meta.url), "utf8");

describe("Intake: four goal chips and More goals", () => {
  it("shows the four common goals, then the rest behind a button", () => {
    expect(s).toContain('const COMMON_GOALS = ["Weight Loss", "Hypertrophy", "Strength", "General Fitness"];');
    expect(s).toContain("moreGoals || COMMON_GOALS.includes(c.tag) || c.tag === tag");
    expect(s).toContain("More goals");
  });
  it("a goal that is already picked always shows (Pain management stays visible once chosen)", () => {
    expect(s).toContain("|| c.tag === tag");
  });
  it("every goal is still reachable: the full list is the same `categories` prop", () => {
    expect(s).toContain("categories.filter(");
  });
});
