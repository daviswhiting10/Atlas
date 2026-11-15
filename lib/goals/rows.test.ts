import { describe, expect, it } from "vitest";
import { WorkoutMinutes, rowsMeetRule, settlePending, workoutRows, type PendingWorkout, type RowsInput } from "./rows";

const base: RowsInput = { need: 2, sessions: [], mark: "outdoors", pending: [], removed: [], minutesOver: {} };
const session = (id: string, minutes: number | null, tags: string[] = [], sets = 0) => ({ id, title: "Workout", minutes, tags, sets });
const pending = (over: Partial<PendingWorkout> = {}): PendingWorkout => ({ tempId: "t1", day: "2026-11-15", minutes: 45, outdoors: false, sessionId: null, undone: false, ...over });
const kinds = (rows: ReturnType<typeof workoutRows>) => rows.map((r) => r.kind);

describe("workoutRows", () => {
  it("a day with nothing logged is the needed number of empty rows", () => {
    expect(kinds(workoutRows(base))).toEqual(["empty", "empty"]);
  });

  it("each finished workout fills a row, the rest stay empty", () => {
    const rows = workoutRows({ ...base, sessions: [session("a", 50)] });
    expect(kinds(rows)).toEqual(["workout", "empty"]);
    expect(rows[0]).toMatchObject({ sessionId: "a", minutes: 50, saving: false });
  });

  it("more workouts than needed all show: nothing logged is ever hidden", () => {
    expect(kinds(workoutRows({ ...base, sessions: [session("a", 50), session("b", 60), session("c", 20)] }))).toEqual(["workout", "workout", "workout"]);
  });

  it("a workout being saved shows at once, as saving, with the minutes and the tag it was logged with", () => {
    const rows = workoutRows({ ...base, pending: [pending({ outdoors: true })] });
    expect(rows[0]).toMatchObject({ kind: "workout", key: "t1", title: "Workout", minutes: 45, tags: ["outdoors"], saving: true });
    expect(kinds(rows)).toEqual(["workout", "empty"]);
  });

  it("once the save has returned its id it is no longer 'saving', and when the server's list has it, it isn't shown twice", () => {
    expect(workoutRows({ ...base, pending: [pending({ sessionId: "s9" })] })[0]).toMatchObject({ sessionId: "s9", saving: false });
    const rows = workoutRows({ ...base, sessions: [session("s9", 45)], pending: [pending({ sessionId: "s9" })] });
    expect(rows.filter((r) => r.kind === "workout")).toHaveLength(1);
  });

  it("Undo hides the row, even before the save has returned", () => {
    expect(kinds(workoutRows({ ...base, pending: [pending({ undone: true })] }))).toEqual(["empty", "empty"]);
    expect(kinds(workoutRows({ ...base, pending: [pending({ sessionId: "s9", undone: true })] }))).toEqual(["empty", "empty"]);
  });

  it("a removed workout leaves its row empty at once", () => {
    expect(kinds(workoutRows({ ...base, sessions: [session("a", 50), session("b", 50)], removed: ["a"] }))).toEqual(["workout", "empty"]);
  });

  it("edited minutes show before the server confirms them, for a saved workout and a pending one", () => {
    expect(workoutRows({ ...base, sessions: [session("a", 50)], minutesOver: { a: 70 } })[0]).toMatchObject({ minutes: 70 });
    expect(workoutRows({ ...base, pending: [pending()], minutesOver: { t1: 30 } })[0]).toMatchObject({ minutes: 30 });
  });

  it("a workout with no time (logged elsewhere) shows with null minutes, to be filled in", () => {
    expect(workoutRows({ ...base, sessions: [session("a", null)] })[0]).toMatchObject({ kind: "workout", minutes: null });
  });

  it("only a workout with no sets can be removed from here", () => {
    const rows = workoutRows({ ...base, sessions: [session("a", 50), session("b", 50, [], 12)], pending: [pending()] });
    expect(rows.map((r) => (r.kind === "workout" ? r.timeOnly : null))).toEqual([true, false, true]);
  });

  it("a goal with no tag gives rows no tags", () => {
    expect(workoutRows({ ...base, mark: null, pending: [pending({ outdoors: true })] })[0]).toMatchObject({ tags: [] });
  });
});

describe("rowsMeetRule", () => {
  const tagged = (r: { tags: string[] }, mark: string) => r.tags.includes(mark);
  const rows = (...s: Array<[number | null, string[]?]>) => workoutRows({ ...base, need: 2, sessions: s.map(([m, t], i) => session(`s${i}`, m, t ?? [])) });

  it("two workouts of 45+ minutes meet 'two workouts, 45+ min'", () => {
    const rule = { need: 2, mark: null, minMinutes: 45 };
    expect(rowsMeetRule(rule, rows([45], [60]), tagged)).toBe(true);
    expect(rowsMeetRule(rule, rows([45], [44]), tagged)).toBe(false);
    expect(rowsMeetRule(rule, rows([45]), tagged)).toBe(false);
  });

  it("a workout with no time doesn't count yet", () => {
    expect(rowsMeetRule({ need: 1, mark: null, minMinutes: 45 }, rows([null]), tagged)).toBe(false);
    expect(rowsMeetRule({ need: 1, mark: null, minMinutes: null }, rows([null]), tagged)).toBe(false);
  });

  it("'one of them outdoors' needs a long enough workout carrying the tag", () => {
    const rule = { need: 1, mark: "outdoors", minMinutes: 45 };
    expect(rowsMeetRule(rule, rows([45], [50, ["outdoors"]]), tagged)).toBe(true);
    expect(rowsMeetRule(rule, rows([45], [30, ["outdoors"]]), tagged)).toBe(false);
    expect(rowsMeetRule(rule, rows([45], [50]), tagged)).toBe(false);
  });

  it("a rule with no minimum counts any timed workout", () => {
    expect(rowsMeetRule({ need: 1, mark: null, minMinutes: null }, rows([5]), tagged)).toBe(true);
  });
});

describe("settlePending", () => {
  it("forgets a pending workout the server's list now has, keeps the rest", () => {
    const list = [pending({ tempId: "a", sessionId: "s1" }), pending({ tempId: "b", sessionId: null }), pending({ tempId: "c", sessionId: "s2" })];
    expect(settlePending(list, ["s1"]).map((p) => p.tempId)).toEqual(["b", "c"]);
  });
});

describe("WorkoutMinutes", () => {
  it("is a whole number of minutes from 1 to 600", () => {
    expect(WorkoutMinutes.safeParse(45).success).toBe(true);
    expect(WorkoutMinutes.safeParse(600).success).toBe(true);
    expect(WorkoutMinutes.safeParse(0).success).toBe(false);
    expect(WorkoutMinutes.safeParse(601).success).toBe(false);
    expect(WorkoutMinutes.safeParse(45.5).success).toBe(false);
    expect(WorkoutMinutes.safeParse("45").success).toBe(false);
  });
});
