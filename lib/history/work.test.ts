import { describe, expect, it } from "vitest";
import { addWork, workOf } from "./work";
import type { HistorySession, HistorySet } from "./types";

const set = (o: Partial<HistorySet> = {}): HistorySet => ({ exerciseId: "e", weight: 100, reps: 8, completed: true, ...o });
const ses = (o: Partial<HistorySession>): HistorySession => ({ id: "s", date: new Date("2026-11-17T12:00:00Z"), completedAt: new Date("2026-11-17T13:00:00Z"), durationMin: null, sets: [], ...o });

describe("work units: sets + cardio min ÷ 3 + walk min ÷ 10 + mobility min ÷ 5", () => {
  it("strength is one unit a set", () => {
    expect(workOf(ses({ durationMin: 60, sets: Array.from({ length: 22 }, () => set()) }))).toMatchObject({ sets: 22, units: 22 });
  });
  it("a quick-logged run is its minutes ÷ 3, a walk its minutes ÷ 10", () => {
    expect(workOf(ses({ activity: "RUN", durationMin: 45 }))).toMatchObject({ runMin: 45, units: 15 });
    expect(workOf(ses({ activity: "OTHER", durationMin: 30 }))).toMatchObject({ runMin: 30, units: 10 });
    expect(workOf(ses({ activity: "WALK", durationMin: 60 }))).toMatchObject({ walkMin: 60, units: 6 });
  });
  it("mobility sets share the session's time, ÷ 5", () => {
    expect(workOf(ses({ durationMin: 20, sets: Array.from({ length: 4 }, () => set({ mobility: true, weight: null })) }))).toMatchObject({ mobMin: 20, sets: 0, units: 4 });
  });
  it("a mixed session shares its time by logged sets: 10 lifting sets and 10 cardio sets in 60 min", () => {
    const sets = [...Array.from({ length: 10 }, () => set()), ...Array.from({ length: 10 }, () => set({ cardio: "RUN", weight: null, reps: 60 }))];
    const w = workOf(ses({ durationMin: 60, sets }));
    expect(w).toMatchObject({ sets: 10, runMin: 30 });
    expect(Math.round(w.units)).toBe(20);
  });
  it("no duration: strength sets only, nothing invented", () => {
    expect(workOf(ses({ sets: [set(), set({ cardio: "RUN", weight: null, reps: 30 })] }))).toMatchObject({ sets: 1, runMin: 0, units: 1 });
  });
  it("sets not completed do not count", () => {
    expect(workOf(ses({ durationMin: 30, sets: [set({ completed: false })] })).units).toBe(0);
  });
  it("a day adds its sessions", () => {
    expect(addWork([workOf(ses({ sets: [set(), set()] })), workOf(ses({ activity: "RUN", durationMin: 30 }))]).units).toBe(12);
  });
});

describe("work units: timed sets count by their time only", () => {
  it("a plank or a carry is its seconds as minutes ÷ 3, never a set", () => {
    // Three 45 s planks and three 60 lb carries of 60 s: 5.25 min ÷ 3 = 1.75 units, where they used to be 6 sets.
    const holds = [...Array.from({ length: 3 }, () => set({ timed: true, weight: null, reps: 45 })), ...Array.from({ length: 3 }, () => set({ timed: true, weight: 60, reps: 60 }))];
    const w = workOf(ses({ durationMin: 30, sets: holds }));
    expect(w).toMatchObject({ sets: 0, holdMin: 5 });
    expect(w.units).toBeCloseTo(5.25 / 3, 5);
  });
  it("next to lifting, the lifting still counts a unit a set", () => {
    const w = workOf(ses({ durationMin: 60, sets: [...Array.from({ length: 10 }, () => set()), set({ timed: true, weight: null, reps: 60 })] }));
    expect(w.sets).toBe(10);
    expect(w.units).toBeCloseTo(10 + 1 / 3, 5);
  });
  it("a timed stretch stays mobility, and cardio stays cardio", () => {
    expect(workOf(ses({ durationMin: 10, sets: [set({ timed: true, mobility: true, weight: null, reps: 60 })] }))).toMatchObject({ mobMin: 10, holdMin: 0, units: 2 });
    expect(workOf(ses({ durationMin: 30, sets: [set({ timed: true, cardio: "RUN", weight: null, reps: 1800 })] }))).toMatchObject({ runMin: 30, holdMin: 0, units: 10 });
  });
  it("a day adds its timed minutes", () => {
    const one = workOf(ses({ sets: [set({ timed: true, weight: null, reps: 90 })] }));
    expect(addWork([one, one])).toMatchObject({ holdMin: 4 });
  });
});

describe("work units: added sets and exercises added mid-session count", () => {
  it("a set past the prescription, and sets of an exercise not in the plan, count like any other", () => {
    // Nothing about a set's place in the plan is read: a completed set with reps is work (days.ts isLoggedSet).
    const planned = Array.from({ length: 3 }, () => set({ exerciseId: "squat" }));
    const extraSet = set({ exerciseId: "squat" });
    const added = Array.from({ length: 2 }, () => set({ exerciseId: "added-curl", weight: 30, reps: 12 }));
    expect(workOf(ses({ sets: [...planned, extraSet, ...added] }))).toMatchObject({ sets: 6, units: 6 });
  });
});
