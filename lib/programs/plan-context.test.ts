import { describe, expect, it } from "vitest";
import { contextFromModel, contextFromText, contextWarnings, describeReadAs, mergeContext, modelContextFromReply, NO_CONTEXT } from "./plan-context";
import { shapePlan, type PlanWeek } from "./sheet-plan";

describe("contextFromText", () => {
  it("reads the coach's note from the screenshot", () => {
    expect(
      contextFromText("This a 4 week block.  2 days legs, 2 days upper body. On this one I want to start fresh so we can just pick up on week 1.")
    ).toEqual({ durationWeeks: 4, trainingDays: 4, startAtWeek: 1 });
  });

  it.each([
    ["6-week hypertrophy block", { durationWeeks: 6 }],
    ["six weeks, 3 days a week", { durationWeeks: 6, trainingDays: 3 }],
    ["8 wks", { durationWeeks: 8 }],
    ["4x a week", { trainingDays: 4 }],
    ["5 times per week", { trainingDays: 5 }],
    ["3 sessions a week, 2 days off", { trainingDays: 3 }],
    ["they're on week 3", { startAtWeek: 3 }],
    ["we're currently in the 2nd week", { startAtWeek: 2 }],
    ["pick it up at week 2", { startAtWeek: 2 }],
    ["start from scratch", { startAtWeek: 1 }],
    ["Start over, ignore the old loads", { startAtWeek: 1 }],
    ["starting the 4 week block today", { durationWeeks: 4, startAtWeek: null }],
    ["athlete has a knee restriction", {}],
  ])("%s", (text, expected) => {
    expect(contextFromText(text)).toEqual({ ...NO_CONTEXT, ...expected });
  });

  it("ignores impossible values", () => {
    expect(contextFromText("90 week block, 9 days a week")).toEqual(NO_CONTEXT);
    expect(contextFromText("")).toEqual(NO_CONTEXT);
  });
});

describe("the model's reading", () => {
  it("fills in only what the rules missed", () => {
    const rules = contextFromText("4 week block");
    const model = contextFromModel({ durationWeeks: 6, trainingDays: 4, startAtWeek: "x" });
    expect(mergeContext(rules, model)).toEqual({ durationWeeks: 4, trainingDays: 4, startAtWeek: null });
  });

  it("is read from the reply JSON, fenced or not", () => {
    expect(modelContextFromReply('```json\n{"days":[],"context":{"durationWeeks":4,"trainingDays":null,"startAtWeek":1}}\n```')).toEqual({
      durationWeeks: 4,
      trainingDays: null,
      startAtWeek: 1,
    });
    expect(modelContextFromReply("not json")).toEqual(NO_CONTEXT);
  });
});

describe("what the coach sees", () => {
  it("says what was read", () => {
    expect(describeReadAs({ weeks: 4, days: 4, startAtWeek: 1 })).toBe("4 weeks · 4 days a week · starting at week 1");
    expect(describeReadAs({ weeks: 1, days: 1 })).toBe("1 week · 1 day a week");
  });

  it("warns when the note and the file disagree on days", () => {
    expect(contextWarnings({ ...NO_CONTEXT, trainingDays: 4 }, { days: 1 }, "screenshot")[0]).toMatch(/4 days a week, but the screenshot shows 1/);
    expect(contextWarnings({ ...NO_CONTEXT, trainingDays: 4 }, { days: 4 }, "sheet")).toEqual([]);
  });
});

describe("shapePlan", () => {
  const rx = { sets: 2, repMin: 12, repMax: 12, unit: "reps" as const, note: null };
  const week = (n: number, logged: boolean): PlanWeek => ({
    week: n,
    days: [{ name: "Day 1", dayOfWeek: 1, logged, entries: [{ exercise: "Goblet Squat", notes: null, rx, load: logged ? { weight: 20, band: null, note: null } : null }] }],
  });
  const sheet = { weeks: [week(1, true), week(2, true), week(3, false), week(4, false)], lastLoggedWeek: 2 };

  it("leaves the sheet alone without a note", () => {
    expect(shapePlan(sheet, NO_CONTEXT)).toEqual(sheet);
  });

  it("start fresh: nothing is logged, week 1 is now", () => {
    const out = shapePlan(sheet, { durationWeeks: null, startAtWeek: 1 });
    expect(out.lastLoggedWeek).toBe(0);
    expect(out.weeks.every((w) => w.days.every((d) => !d.logged))).toBe(true);
  });

  it("on week 2: only week 1 stays logged", () => {
    const out = shapePlan(sheet, { durationWeeks: null, startAtWeek: 2 });
    expect(out.lastLoggedWeek).toBe(1);
    expect(out.weeks.map((w) => w.days[0].logged)).toEqual([true, false, false, false]);
  });

  it("a longer block repeats the last week, unlogged", () => {
    const out = shapePlan({ weeks: [week(1, true)], lastLoggedWeek: 1 }, { durationWeeks: 4, startAtWeek: null });
    expect(out.weeks.map((w) => w.week)).toEqual([1, 2, 3, 4]);
    expect(out.weeks[3].days[0].logged).toBe(false);
    expect(out.weeks[3].days[0].entries[0].load).toBeNull();
    expect(out.weeks[3].days[0].entries[0].rx).toEqual(rx);
  });

  it("a shorter block drops the extra weeks", () => {
    const out = shapePlan(sheet, { durationWeeks: 1, startAtWeek: null });
    expect(out.weeks).toHaveLength(1);
    expect(out.lastLoggedWeek).toBe(1);
  });
});
