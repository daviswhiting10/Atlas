import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

/** The logger's − and + show on the active set only (declutter audit). They keep their room, so nothing moves. */
describe("active-set steppers", () => {
  const logger = read("components/athlete/WorkoutLogger.tsx");
  it("the active set is the first one not done, or the one whose number was tapped", () => {
    expect(logger).toContain("const showButtons = i === list.findIndex((x) => !x.done) || armed === key;");
  });
  it("all three steppers (weight, reps, time) take the same switch", () => {
    expect((logger.match(/showButtons=\{showButtons\}/g) ?? []).length).toBe(3);
  });
  it("hidden buttons keep their room (invisible, not removed), so a tap never lands on a moved field", () => {
    for (const f of ["components/athlete/WorkoutLogger.tsx", "components/athlete/DurationStepper.tsx"]) {
      expect((read(f).match(/!showButtons && "invisible"/g) ?? []).length).toBeGreaterThanOrEqual(2);
    }
  });
});
