import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const s = readFileSync(new URL("../components/athlete/WorkoutLogger.tsx", import.meta.url), "utf8");
describe("athlete logger: post-workout feedback", () => {
  it("the superset rest waits for the pair", () => {
    expect(s).toContain("restDue(group, ex.aweId, setNumber, logged, numbers)");
  });
  it("reps carry forward to unlogged sets, like weight", () => {
    expect(s).toContain("patch.reps !== undefined && s.reps === before.reps");
  });
  it("bodyweight is a toggle on the weight stepper, not in the menu", () => {
    expect(s).toContain("bodyweight={{ on: s.weight === 0");
    expect(s).not.toMatch(/DropdownMenuItem[^\n]*[Bb]odyweight/);
  });
  it("a big Finish workout button sits at the bottom, and the header Finish stays", () => {
    expect(s).toContain("Finish workout");
    expect(s).toContain("onClick={tapFinish}");
    expect((s.match(/onClick=\{tapFinish\}/g) ?? []).length).toBe(2);
  });
});
