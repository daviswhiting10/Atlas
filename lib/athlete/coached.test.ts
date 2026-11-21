import { describe, expect, it } from "vitest";
import { isCoached } from "./coached";

describe("isCoached", () => {
  it("is a client whose coach writes the plan: no self-made plan, not a coach", () => {
    expect(isCoached({ selfServe: false, isCoach: false })).toBe(true);
  });
  it("is not someone who makes their own plan", () => {
    expect(isCoached({ selfServe: true, isCoach: false })).toBe(false);
  });
  it("is not a coach on their own training", () => {
    expect(isCoached({ selfServe: false, isCoach: true })).toBe(false);
    expect(isCoached({ selfServe: true, isCoach: true })).toBe(false);
  });
});
