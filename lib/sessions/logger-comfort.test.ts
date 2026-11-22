import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (p: string) => readFileSync(new URL(`../../${p}`, import.meta.url), "utf8");
const athlete = read("components/athlete/WorkoutLogger.tsx");
const coach = read("app/(dashboard)/clients/[id]/log/WorkoutLogger.tsx");

describe("the rest pill never sits on the set being logged", () => {
  it.each([["athlete", athlete], ["coach", coach]])("%s: when a rest starts, the next set to log is moved above the pill", (_, src) => {
    expect(src).toContain("pillRef");
    expect(src).toMatch(/window\.scrollBy\(\{ top: over, behavior: "instant" \}\)/);
    // it looks in the exercise being logged first
    expect(src).toMatch(/section\[data-exercise="\$\{(restFor|lastAwe)\.current\}"\]/);
  });
  it("the athlete page keeps room under the last card for the pill", () => {
    expect(athlete).toContain('aria-hidden className="h-20"');
  });
});

describe("fill-down of the weight", () => {
  it("a weight typed on a set carries to later unticked sets that have none, muted until ticked or edited", () => {
    expect(athlete).toContain("muted={!s.done && filled.has(");
    expect(athlete).toMatch(/before\.weight == null && patch\.weight != null/);
    // a tick (the only thing that logs it) clears the muted state
    expect(athlete).toMatch(/if \(filled\.has\([^)]*\)\) setFilled/);
  });
  it("is not a different value from what is shown: Check all saves the weights on screen", () => {
    const fn = athlete.slice(athlete.indexOf("function applyBulk"), athlete.indexOf("function bulkOne"));
    expect(fn).toMatch(/weight: s\.weight, reps: s\.reps/);
  });
  it("the coach logger already carries weight and reps down to unticked sets", () => {
    expect(coach).toContain("Auto-carry forward load changes to uncompleted subsequent sets");
  });
});
