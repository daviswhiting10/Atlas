import { describe, expect, it } from "vitest";
import { timedFirstReason, timedHasLoad, timedKind } from "./timed";
import { nextTarget } from "./overload";

describe("timedKind: what a timed exercise is", () => {
  it("steady cardio: the bike, row, ski erg, walk, run", () => {
    expect(timedKind("3C: Bike — Zone 2", "Conversational pace, nasal (15 min)")).toBe("steady");
    expect(timedKind("Recumbent bike")).toBe("steady");
    expect(timedKind("Ski erg", "Easy")).toBe("steady");
    expect(timedKind("Incline Treadmill Walk")).toBe("steady");
    expect(timedKind("Row cardio")).toBe("steady");
  });
  it("intervals and sprints are work, even on a bike", () => {
    expect(timedKind("Assault Bike — sprint intervals (seated, high seat)")).toBe("work");
    expect(timedKind("Row or Bike Intervals")).toBe("work");
    expect(timedKind("Battle Ropes", "Hard")).toBe("work");
    expect(timedKind("Assault Bike", "HIIT finisher. 5 × 20s on / 15s off.")).toBe("work");
  });
  it("holds: planks, sits, isometrics, balance, carries", () => {
    for (const n of ["Plank", "Side Plank", "Wall Sit — partial (45–70° knee angle only)", "Hollow Body Hold", "Copenhagen Iso", "glute bridge iso", "Single-Leg Balance (progress to reach)", "Farmer's Carry"]) expect(timedKind(n)).toBe("hold");
  });
  it("a barbell row is not a rower", () => {
    expect(timedKind("Seated Cable Row")).toBe("hold"); // "row" alone is not cardio; only timed exercises ask
  });
});

describe("timedHasLoad: when a timed exercise shows a weight field", () => {
  const base = { equipment: "other", tool: null, prescribedWeight: false, everLoaded: false };
  it("not for a bike, a rower or a plank", () => {
    expect(timedHasLoad({ ...base, name: "Recumbent bike" })).toBe(false);
    expect(timedHasLoad({ ...base, name: "Ski erg" })).toBe(false);
    expect(timedHasLoad({ ...base, name: "Plank", equipment: "body only" })).toBe(false);
  });
  it("yes for a loaded carry or hold", () => {
    expect(timedHasLoad({ ...base, name: "Farmer's Carry", tool: "dumbbell" })).toBe(true);
    expect(timedHasLoad({ ...base, name: "Suitcase hold" })).toBe(true);
    expect(timedHasLoad({ ...base, name: "Dissociated Front Plank (WTD)" })).toBe(true);
    expect(timedHasLoad({ ...base, name: "Heel Elevated Goblet Squat ISO" })).toBe(true);
  });
  it("yes once a weight is prescribed or has been logged", () => {
    expect(timedHasLoad({ ...base, name: "Plank", prescribedWeight: true })).toBe(true);
    expect(timedHasLoad({ ...base, name: "Plank", everLoaded: true })).toBe(true);
  });
});

describe("the first-time wording fits the exercise", () => {
  const first = (timed: "hold" | "steady" | "work") => nextTarget({ last: [], repMin: 900, repMax: 900, increment: 0, unit: "secs", timed });
  it("a hold is told to hold as long as it can", () => {
    expect(first("hold").reason).toBe("Hold as long as you can with good form. Today sets your baseline.");
    expect(timedFirstReason("hold")).toMatch(/Hold as long as you can/);
  });
  it("steady cardio is not", () => {
    expect(first("steady").reason).toBe("Keep a steady pace for the time shown. Today sets your baseline.");
    expect(first("steady").reason).not.toMatch(/as long as you can/);
  });
  it("intervals work hard for the time shown", () => {
    expect(first("work").reason).toMatch(/Work hard for the time shown/);
  });
  it("no kind given still reads as a hold, as before", () => {
    expect(nextTarget({ last: [], repMin: 30, repMax: 60, increment: 0, unit: "secs" }).reason).toMatch(/Hold as long as you can/);
  });
  it("reps are unchanged", () => {
    expect(nextTarget({ last: [], repMin: 8, repMax: 12, increment: 5 }).reason).toMatch(/Pick a weight/);
  });
});
