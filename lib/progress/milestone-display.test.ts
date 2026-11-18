import { describe, expect, it } from "vitest";
import { shownValue } from "./format";

describe("shownValue", () => {
  it("rounds an estimated max to whole pounds", () => {
    expect(shownValue(186.66666666666666, "lb e1RM")).toBe(187);
    expect(shownValue(160, "lb e1RM")).toBe(160);
  });
  it("keeps other values to one decimal", () => {
    expect(shownValue(135, "lb")).toBe(135);
    expect(shownValue(12.3456, "lb")).toBe(12.3);
    expect(shownValue(7, null)).toBe(7);
  });
});
