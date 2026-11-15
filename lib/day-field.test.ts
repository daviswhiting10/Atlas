import { describe, expect, it } from "vitest";
import { dayFrom, pickDay } from "./day-field";

describe("pickDay", () => {
  it("sends what the field shows, even when the form's state is behind (the iPhone wheel case)", () => {
    // The wheel committed Nov 4, but the button's handler still holds the render's Nov 15.
    expect(pickDay("2026-11-04", "2026-11-15")).toBe("2026-11-04");
  });
  it("uses the state when there's no field to read (not rendered yet)", () => {
    expect(pickDay(undefined, "2026-11-15")).toBe("2026-11-15");
    expect(pickDay(null, "2026-11-15")).toBe("2026-11-15");
  });
  it("keeps the state when the field holds nothing usable", () => {
    expect(pickDay("", "2026-11-15")).toBe("2026-11-15"); // a required day was cleared
    expect(pickDay("11/04/2026", "2026-11-15")).toBe("2026-11-15");
  });
  it("lets an optional date be emptied", () => {
    expect(pickDay("", "2026-11-15", { allowEmpty: true })).toBe("");
    expect(pickDay("", "", { allowEmpty: true })).toBe("");
    expect(pickDay("2026-11-04", "", { allowEmpty: true })).toBe("2026-11-04");
  });
});

describe("dayFrom", () => {
  it("reads the field through its ref", () => {
    expect(dayFrom({ current: { value: "2026-11-04" } }, "2026-11-15")).toBe("2026-11-04");
    expect(dayFrom({ current: null }, "2026-11-15")).toBe("2026-11-15");
  });
});
