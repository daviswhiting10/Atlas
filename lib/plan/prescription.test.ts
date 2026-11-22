import { describe, expect, it } from "vitest";
import { clock, prescriptionLabels, setPlan } from "./prescription";

describe("prescriptionLabels", () => {
  it("shows one weight, or the range across the sets", () => {
    expect(prescriptionLabels([{ weight: 95 }, { weight: 95 }]).weight).toBe("95 lb");
    expect(prescriptionLabels([{ weight: 95 }, { weight: 105 }, { weight: 115 }]).weight).toBe("95–115 lb");
    expect(prescriptionLabels([{ weight: 52.5 }, { weight: 55 }]).weight).toBe("52.5–55 lb");
  });
  it("shows nothing for a missing or zero weight (bodyweight)", () => {
    expect(prescriptionLabels([{ weight: null }, { weight: 0 }, {}]).weight).toBeNull();
  });
  it("shows the RPE across the sets", () => {
    expect(prescriptionLabels([{ rpe: 7 }, { rpe: 8 }, { rpe: 9 }]).rpe).toBe("7–9");
    expect(prescriptionLabels([{ rpe: 8 }, { rpe: 8 }]).rpe).toBe("8");
    expect(prescriptionLabels([{ rpe: null }]).rpe).toBeNull();
  });
  it("shows the rest as minutes and seconds", () => {
    expect(prescriptionLabels([{ restSeconds: 120 }, { restSeconds: 120 }]).rest).toBe("2:00");
    expect(prescriptionLabels([{ restSeconds: 60 }, { restSeconds: 90 }]).rest).toBe("1:00–1:30");
  });
  it("an exercise with nothing prescribed has no labels", () => {
    expect(prescriptionLabels([{}, {}])).toEqual({ weight: null, rpe: null, rest: null });
  });
});

describe("setPlan", () => {
  it("is what a set carries beyond weight and reps", () => {
    expect(setPlan({ rpe: 8, restSeconds: 120, notes: " Slow on the way down " })).toEqual({ rpe: 8, rest: 120, note: "Slow on the way down" });
    expect(setPlan({ rpe: 8 })).toEqual({ rpe: 8, rest: null, note: null });
  });
  it("is nothing when the set has none of it", () => {
    expect(setPlan({ weight: 95, repMin: 6, repMax: 10, notes: "" })).toBeNull();
    expect(setPlan(undefined)).toBeNull();
  });
});

describe("clock", () => {
  it("is m:ss", () => {
    expect(clock(75)).toBe("1:15");
    expect(clock(120)).toBe("2:00");
  });
});
