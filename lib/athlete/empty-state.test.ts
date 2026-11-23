import { describe, expect, it } from "vitest";
import { IMPORTS_PER_DAY, canImportPlan, todayEmptyState } from "./empty-state";

const self = { selfServe: true, isCoach: false, isGuest: false };
const coached = { selfServe: false, isCoach: false, isGuest: false };

describe("todayEmptyState", () => {
  it("shows the No plan yet card to a self-serve athlete with no plan", () => {
    expect(todayEmptyState({ ...self, hasPlan: false })).toBe("card");
  });
  it("shows it to a coach on their own training with no plan", () => {
    expect(todayEmptyState({ selfServe: true, isCoach: true, isGuest: false, hasPlan: false })).toBe("card");
    expect(todayEmptyState({ selfServe: false, isCoach: true, isGuest: false, hasPlan: false })).toBe("card");
  });
  it("never shows it to a coached client", () => {
    expect(todayEmptyState({ ...coached, hasPlan: false })).toBe("coached");
    expect(todayEmptyState({ ...coached, isGuest: true, hasPlan: false })).toBe("coached");
  });
  it("keeps guests out of the doors", () => {
    expect(todayEmptyState({ ...self, isGuest: true, hasPlan: false })).toBe("guest");
  });
  it("shows no card when there is a plan, whoever they are", () => {
    for (const who of [self, coached, { ...self, isGuest: true }, { selfServe: false, isCoach: true, isGuest: false }]) {
      expect(todayEmptyState({ ...who, hasPlan: true })).toBe("plan");
    }
  });
});

describe("canImportPlan", () => {
  it("is for self-serve athletes and coaches on their own training, not coached clients or guests", () => {
    expect(canImportPlan(self)).toBe(true);
    expect(canImportPlan({ selfServe: false, isCoach: true, isGuest: false })).toBe(true);
    expect(canImportPlan(coached)).toBe(false);
    expect(canImportPlan({ ...self, isGuest: true })).toBe(false);
  });
  it("has a daily limit on reads", () => {
    expect(IMPORTS_PER_DAY).toBeGreaterThan(0);
    expect(IMPORTS_PER_DAY).toBeLessThanOrEqual(10);
  });
});
