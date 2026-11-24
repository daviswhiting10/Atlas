import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { summaryView } from "./summary-copy";

describe("the finish screen's framing", () => {
  it("a real session is one sentence", () => {
    const v = summaryView({ sets: 20, volume: 8810, minutes: 42 });
    expect(v.kind).toBe("sentence");
    expect(v.kind === "sentence" && v.text).toBe("You did 20 sets and lifted 8,810 lb in 42 min.");
  });
  it("the numbers stand out of the sentence", () => {
    const v = summaryView({ sets: 20, volume: 8810, minutes: 42 });
    expect(v.kind === "sentence" && v.parts.filter((p) => p.strong).map((p) => p.text)).toEqual(["20 sets", "8,810 lb", "42 min"]);
  });
  it("an hour or more reads as hours", () => {
    expect(summaryView({ sets: 24, volume: 12000, minutes: 75 })).toMatchObject({ text: "You did 24 sets and lifted 12,000 lb in 1 h 15 min." });
    expect(summaryView({ sets: 24, volume: 12000, minutes: 60 })).toMatchObject({ text: "You did 24 sets and lifted 12,000 lb in 1 h." });
  });
  it("bodyweight work has no weight lifted: no zero, no 'lifted'", () => {
    expect(summaryView({ sets: 12, volume: 0, minutes: 30 })).toMatchObject({ text: "You did 12 sets in 30 min." });
  });
  it("one set is '1 set'", () => {
    expect(summaryView({ sets: 1, volume: 135, minutes: 5 })).toMatchObject({ text: "You did 1 set and lifted 135 lb in 5 min." });
  });
  it("under two minutes the minutes are hidden and the two real numbers are labelled", () => {
    expect(summaryView({ sets: 20, volume: 8810, minutes: 1 })).toEqual({ kind: "tiles", tiles: [{ value: "20", label: "Sets" }, { value: "8,810", unit: "lb", label: "Weight lifted" }] });
    expect(summaryView({ sets: 20, volume: 8810, minutes: 0 }).kind).toBe("tiles");
  });
  it("two minutes is the first that counts as a session length", () => {
    expect(summaryView({ sets: 3, volume: 300, minutes: 2 }).kind).toBe("sentence");
  });
  it("a short bodyweight session shows only the sets", () => {
    expect(summaryView({ sets: 8, volume: 0, minutes: 1 })).toEqual({ kind: "tiles", tiles: [{ value: "8", label: "Sets" }] });
  });
});

describe("the coach's screen names the athlete", () => {
  it("'Alex did 20 sets and lifted 8,810 lb in 42 min.'", () => {
    expect(summaryView({ sets: 20, volume: 8810, minutes: 42, who: "Alex" })).toMatchObject({ text: "Alex did 20 sets and lifted 8,810 lb in 42 min." });
  });
});

describe("the athlete's finish screen uses it, and keeps the medals", () => {
  const src = readFileSync(new URL("../../components/athlete/WorkoutLogger.tsx", import.meta.url), "utf8");
  it("framed by summaryView; the three raw tiles are gone", () => {
    expect(src).toContain("summaryView({ sets: doneCount, volume, minutes: summary.minutes })");
    expect(src).not.toContain('[String(summary.minutes), "min"]');
  });
  it("the records list is still there", () => {
    expect(src).toContain("recordList.length > 0");
    expect(src).toContain("<Medal");
  });
});
