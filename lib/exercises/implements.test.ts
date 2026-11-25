import { describe, expect, it } from "vitest";
import { bellCount, defaultImplements, implementsToStore, isBellExercise, lastImplements, startImplements } from "./implements";
import { loggedVolume, setVolume, volumeOf } from "@/lib/sessions/volume";
import { sessionPoint, e1rm } from "@/lib/plan/overload";
import { groupByExercise, personalRecords, summarizeSession, volumeByWeek, type DerivedSet } from "@/lib/mcp/derive";
import { compareWithLast } from "@/lib/coach/wrap-up";

const db = (name: string) => ({ name, equipment: "dumbbell" });

describe("per hand: the default per equipment", () => {
  it("on for dumbbells and kettlebells, however the equipment was written", () => {
    for (const equipment of ["dumbbell", "Dumbbell", "dumbbells", "db", "kettlebells", "Kettlebell", "kb", " dumbbell "]) {
      expect(isBellExercise({ equipment })).toBe(true);
      expect(defaultImplements({ name: "Dumbbell Bench Press", equipment })).toBe(2);
    }
  });
  it("none for anything else", () => {
    for (const equipment of ["barbell", "cable", "body only", "other", "machine", "", null, undefined])
      expect(defaultImplements({ name: "Bench Press", equipment })).toBeNull();
  });
  it("by name too, when the equipment says other (imported library names)", () => {
    for (const name of ["1A Dumbbell Bench Press", "3A Dumbbell Bicep Curl", "Incline Dumbbells Press", "Kettlebell Deadlift", "2B. kettlebells row"]) {
      expect(isBellExercise({ name, equipment: "other" })).toBe(true);
      expect(defaultImplements({ name, equipment: "other" })).toBe(2);
    }
    expect(defaultImplements({ name: "3A Dumbbell Pullover", equipment: "other" })).toBe(1);
    expect(defaultImplements({ name: "Kettlebell Swing", equipment: null })).toBe(1);
    expect(implementsToStore({ name: "1A Dumbbell Bench Press", equipment: "other" }, undefined, true)).toBe(2);
    for (const name of ["Bench Press", "Barbell Row", "Hammer Curl", "DB-free stretch"]) expect(isBellExercise({ name, equipment: "other" })).toBe(false);
  });
  it("off for single-bell lifts", () => {
    for (const name of ["Goblet Squat", "Kettlebell Swing", "One-Arm Kettlebell Swings", "One-Arm Dumbbell Row", "Single Arm Dumbbell Press", "Single-arm row", "1-Arm DB Row", "Turkish Get-Up", "Turkish getup", "Dumbbell Pullover"])
      expect(defaultImplements(db(name))).toBe(1);
  });
  it("two-arm lifts stay per hand", () => {
    for (const name of ["Two-Arm Kettlebell Row", "Bent Over Two-Dumbbell Row", "Dumbbell Curl", "Hammer Curl", "Dumbbell Romanian Deadlift"])
      expect(defaultImplements(db(name))).toBe(2);
  });
});

describe("per hand: the last choice wins", () => {
  it("an explicit 1 or 2 wins over the default", () => {
    expect(startImplements(db("Dumbbell Curl"), 1)).toBe(1);
    expect(startImplements(db("Goblet Squat"), 2)).toBe(2);
  });
  it("nothing recorded falls back to the catalog default", () => {
    expect(startImplements(db("Dumbbell Curl"), null)).toBe(2);
    expect(startImplements(db("Goblet Squat"), undefined)).toBe(1);
    expect(startImplements(db("Dumbbell Curl"), 3)).toBe(2);
  });
  it("other equipment never gets one, whatever was stored", () => {
    expect(startImplements({ name: "Bench Press", equipment: "barbell" }, 2)).toBeNull();
  });
  it("the newest recorded set decides; older sets (null) are skipped", () => {
    expect(lastImplements([])).toBeNull();
    expect(lastImplements([{ implements: null }, { implements: null }])).toBeNull();
    expect(lastImplements([{ implements: 2 }, { implements: 1 }, { implements: null }])).toBe(1);
    expect(lastImplements([{ implements: 1 }, { implements: null }, { implements: 2 }, {}])).toBe(2);
  });
});

describe("per hand: what a save stores", () => {
  it("the value sent, for a dumbbell or kettlebell", () => {
    expect(implementsToStore(db("Dumbbell Curl"), 1, true)).toBe(1);
    expect(implementsToStore(db("Dumbbell Curl"), 2, false)).toBe(2);
  });
  it("a new set from an older page gets the default (1 stored explicitly); an edit leaves it", () => {
    expect(implementsToStore(db("Dumbbell Curl"), undefined, true)).toBe(2);
    expect(implementsToStore(db("Goblet Squat"), null, true)).toBe(1);
    expect(implementsToStore(db("Dumbbell Curl"), undefined, false)).toBeUndefined();
    expect(implementsToStore(db("Dumbbell Curl"), 5, false)).toBeUndefined();
  });
  it("never for other equipment", () => {
    expect(implementsToStore({ name: "Bench Press", equipment: "barbell" }, 2, true)).toBeUndefined();
  });
});

describe("per hand: load moved doubles, records don't", () => {
  it("bellCount: 2 is two; 1, null and missing are one", () => {
    expect([bellCount(2), bellCount(1), bellCount(null), bellCount(undefined), bellCount(0)]).toEqual([2, 1, 1, 1, 1]);
  });
  it("weight lifted: 15 lb × 12 per hand is 360; one bell or not recorded is 180", () => {
    expect(setVolume({ weight: 15, reps: 12, implements: 2 })).toBe(360);
    expect(setVolume({ weight: 15, reps: 12, implements: 1 })).toBe(180);
    expect(setVolume({ weight: 15, reps: 12, implements: null })).toBe(180);
    expect(setVolume({ weight: 15, reps: 12 })).toBe(180);
    // The spec's example: hammer curls 15 × 12 × 3 sets, per hand.
    expect(volumeOf([1, 2, 3].map(() => ({ weight: 15, reps: 12, implements: 2 })))).toBe(1080);
    expect(setVolume({ weight: 15, reps: 45, implements: 2, timed: true })).toBe(0);
  });
  it("the athlete done screen counts both bells", () => {
    expect(loggedVolume([{ unit: "reps", sets: [{ weight: 15, reps: 12, done: true, implements: 2 }, { weight: 15, reps: 12, done: true, implements: null }] }])).toBe(540);
  });
  it("the coach's wrap-up compares doubled volume", () => {
    const prev = [{ exerciseId: "c", name: "Curl", weight: 15, reps: 12, implements: null }];
    const cur = [{ exerciseId: "c", name: "Curl", weight: 15, reps: 12, implements: 2 }];
    expect(compareWithLast(cur, prev, null)).toMatchObject({ kind: "full", volumePct: 100 });
  });
  it("MCP: weekly tonnage and session volume double; records and e1RM stay per bell", () => {
    const row = (bells: number | null): DerivedSet => ({
      exerciseId: "c", exerciseName: "Curl", movementPattern: "PULL", primaryMuscles: ["biceps"], secondaryMuscles: [], setNumber: 1,
      weight: 15, bandColor: null, reps: 12, rpe: null, completed: true, workoutLogId: "w1", date: new Date("2026-11-24T12:00:00Z"), deload: false, implements: bells,
    });
    const [week] = volumeByWeek([row(2)], "UTC");
    expect(week.tonnageLb).toBe(360);
    const one = groupByExercise([row(1)], "UTC");
    const two = groupByExercise([row(2)], "UTC");
    expect(summarizeSession(two[0].sessions[0]).volumeLb).toBe(360);
    expect(summarizeSession(two[0].sessions[0]).bestE1RM).toBe(summarizeSession(one[0].sessions[0]).bestE1RM);
    expect(summarizeSession(two[0].sessions[0]).topWeight).toBe(15);
    expect(personalRecords(two)).toEqual(personalRecords(one));
  });
  it("the chart point (weight, e1RM, volume bars) stays per bell", () => {
    const sets = [{ weight: 15, reps: 12, completed: true, implements: 2 }];
    const p = sessionPoint("2026-11-24", sets);
    expect(p).toMatchObject({ weight: 15, volume: 180 });
    expect(p?.e1rm).toBe(Math.round(e1rm(15, 12) * 10) / 10);
  });
});
