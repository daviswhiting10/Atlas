import { describe, expect, it } from "vitest";
import { GOALS } from "./generator";
import { GOAL_PICKS, applyPick, isPicked } from "./goal-picks";

const pick = (k: string) => GOAL_PICKS.find((p) => p.key === k)!;

describe("the four goals", () => {
  it("Build muscle, Lose fat, Maintenance, Pain-free, in that order; Get stronger and Stay fit are gone", () => {
    expect(GOAL_PICKS.map((p) => p.label)).toEqual(["Build muscle", "Lose fat", "Maintenance", "Pain-free"]);
    expect(GOAL_PICKS.map((p) => p.label)).not.toContain("Get stronger");
    expect(GOAL_PICKS.map((p) => p.label)).not.toContain("Stay fit");
  });
  it("what the generator calls the general goal is Maintenance", () => {
    expect(GOALS.general.label).toBe("Maintenance");
  });
});

describe("choosing one", () => {
  it("Pain-free is the general goal with the post-rehab condition; Maintenance is the general goal without it", () => {
    expect(applyPick({ goal: "muscle" as const, conditions: [] as never[] }, pick("pain_free"))).toEqual({ goal: "general", conditions: ["post_rehab"] });
    expect(applyPick({ goal: "general" as const, conditions: ["post_rehab"] as never[] }, pick("maintenance"))).toEqual({ goal: "general", conditions: [] });
  });
  it("other conditions (a bad shoulder) are kept either way", () => {
    expect(applyPick({ goal: "muscle" as const, conditions: ["shoulder"] as never[] }, pick("pain_free")).conditions).toEqual(["shoulder", "post_rehab"]);
    expect(applyPick({ goal: "general" as const, conditions: ["shoulder", "post_rehab"] as never[] }, pick("fat_loss")).conditions).toEqual(["shoulder"]);
  });
  it("exactly one of the four is picked for any prefs", () => {
    for (const prefs of [{ goal: "muscle", conditions: [] }, { goal: "fat_loss", conditions: [] }, { goal: "general", conditions: [] }, { goal: "general", conditions: ["post_rehab"] }] as const) {
      expect(GOAL_PICKS.filter((p) => isPicked(p, prefs as never)).length).toBe(1);
    }
  });
  it("an older plan made for 'Get stronger' has none of the four picked (and still works)", () => {
    expect(GOAL_PICKS.filter((p) => isPicked(p, { goal: "strength", conditions: [] }))).toHaveLength(0);
  });
});

import { readFileSync } from "node:fs";
describe("New plan's goals", () => {
  const read = (p: string) => readFileSync(new URL(`../../${p}`, import.meta.url), "utf8");
  it("one input and the four goals as a compact row: no explanation, no 'Or pick one'", () => {
    const w = read("components/athlete/PlanWizard.tsx");
    expect(w).toContain("What are you training for?");
    expect(w).not.toContain("Say it in your own words");
    expect(w).not.toContain("Or pick one");
    expect(w).toContain("GOAL_PICKS.map");
    expect(w).toContain("grid-cols-4");
  });
  it("the live plan preview is for signing up only", () => {
    expect(read("components/athlete/PlanWizard.tsx")).toContain('mode === "signup" && <PlanPreview');
  });
  it("a coach's own-programs picker is on New plan, not the You tab", () => {
    expect(read("components/athlete/YouScreen.tsx")).not.toContain("OwnProgramPicker");
    expect(read("app/(client)/plan/new/page.tsx")).toContain("<OwnProgramPicker programs={programs}");
  });
});
