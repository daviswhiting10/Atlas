import { describe, expect, it } from "vitest";
import { dayMode, modesOf, sessionMode } from "./mode";
import type { HistorySession, HistorySet } from "./types";

const set = (o: Partial<HistorySet> = {}): HistorySet => ({ exerciseId: "x", weight: 100, reps: 8, completed: true, ...o });
const sess = (o: Partial<HistorySession>): HistorySession => ({ id: "s", date: new Date(), completedAt: new Date(), durationMin: 45, sets: [], ...o });

describe("a session's mode", () => {
  it("strength: logged sets on non-cardio exercises", () => {
    expect(sessionMode(sess({ sets: [set(), set()] }))).toBe("S");
  });
  it("cardio-mode sets are not strength: a run, a walk, other cardio is a shoe", () => {
    expect(sessionMode(sess({ sets: [set({ weight: null, reps: 2520, cardio: "RUN" })] }))).toBe("R");
    expect(sessionMode(sess({ sets: [set({ weight: null, reps: 1800, cardio: "WALK" })] }))).toBe("W");
    expect(sessionMode(sess({ sets: [set({ weight: null, reps: 1200, cardio: "OTHER" })] }))).toBe("R");
  });
  it("a quick log carries its own activity", () => {
    expect(sessionMode(sess({ activity: "WALK" }))).toBe("W");
    expect(sessionMode(sess({ activity: "RUN" }))).toBe("R");
  });
  it("strength and cardio in one session is mixed", () => {
    expect(sessionMode(sess({ sets: [set(), set({ weight: null, reps: 900, cardio: "RUN" })] }))).toBe("M");
  });
  it("a session with nothing to say (a name and a time) has no mode; unlogged sets do not count", () => {
    expect(sessionMode(sess({}))).toBeNull();
    expect(modesOf(sess({ sets: [set({ completed: false })] })).size).toBe(0);
  });
});

describe("a day's mode", () => {
  it("one kind of session: that kind", () => {
    expect(dayMode([{ mode: "S", minutes: 60 }])).toBe("S");
    expect(dayMode([{ mode: "W", minutes: 30 }, { mode: "W", minutes: 20 }])).toBe("W");
  });
  it("strength and cardio on the same day: mixed", () => {
    expect(dayMode([{ mode: "S", minutes: 60 }, { mode: "R", minutes: 30 }])).toBe("M");
    expect(dayMode([{ mode: "M", minutes: 90 }])).toBe("M");
  });
  it("a run beside a walk shows whichever took longer; a tie shows the run", () => {
    expect(dayMode([{ mode: "R", minutes: 20 }, { mode: "W", minutes: 50 }])).toBe("W");
    expect(dayMode([{ mode: "R", minutes: 40 }, { mode: "W", minutes: 40 }])).toBe("R");
  });
  it("sessions with no mode are ignored; all of them: no icon", () => {
    expect(dayMode([{ mode: null, minutes: 30 }, { mode: "S", minutes: 40 }])).toBe("S");
    expect(dayMode([{ mode: null, minutes: 30 }])).toBeNull();
  });
});
