import { describe, expect, it } from "vitest";
import { EMPTY, filterPrograms, group, isFiltering, lengthOf, optionCounts, parseState, perWeekOf, toggle, type LibraryProgram } from "./filter";
import { CATEGORIES } from "./categories";

const p = (id: string, name: string, tag: string | null, weeks: number, perWeek: number, clients = 0): LibraryProgram => ({ id, name, durationWeeks: weeks, perWeek, clients, goalTags: tag ? { goals: [tag] } : null });
const ALL = [
  p("1", "Push Pull Legs 12 wk", "Hypertrophy", 12, 6, 4),
  p("2", "Upper / Lower Hypertrophy", "Hypertrophy", 8, 4, 2),
  p("3", "Full Body Builder", "Hypertrophy", 6, 3),
  p("4", "5x5 Strength", "Strength", 4, 3, 1),
  p("5", "Couch to 5k", "Endurance", 8, 3),
  p("6", "Mobility Reset", null, 2, 2),
];

describe("buckets", () => {
  it("workouts a week: 1-2, 3-4, 5+", () => {
    expect([1, 2, 3, 4, 5, 6].map(perWeekOf)).toEqual(["1-2", "1-2", "3-4", "3-4", "5+", "5+"]);
  });
  it("length: 1-4, 5-8, 9+ weeks", () => {
    expect([1, 4, 5, 8, 9, 24].map(lengthOf)).toEqual(["1-4", "1-4", "5-8", "5-8", "9+", "9+"]);
  });
});

describe("filtering", () => {
  it("nothing on: everything, and not filtering", () => {
    expect(filterPrograms(ALL, EMPTY)).toHaveLength(6);
    expect(isFiltering(EMPTY)).toBe(false);
  });
  it("search matches the name, any case", () => {
    expect(filterPrograms(ALL, { ...EMPTY, q: "PUSH" }).map((x) => x.id)).toEqual(["1"]);
  });
  it("one filter, several options: OR", () => {
    expect(filterPrograms(ALL, { ...EMPTY, goals: ["Hypertrophy", "Strength"] }).map((x) => x.id)).toEqual(["1", "2", "3", "4"]);
  });
  it("different filters: AND", () => {
    expect(filterPrograms(ALL, { ...EMPTY, goals: ["Hypertrophy"], perWeek: ["3-4"] }).map((x) => x.id)).toEqual(["2", "3"]);
    expect(filterPrograms(ALL, { ...EMPTY, goals: ["Hypertrophy"], perWeek: ["3-4"], length: ["5-8"] }).map((x) => x.id)).toEqual(["2", "3"]);
  });
  it("used by a client: at least one assignment", () => {
    expect(filterPrograms(ALL, { ...EMPTY, used: true }).map((x) => x.id)).toEqual(["1", "2", "4"]);
  });
  it("a program with no category is 'Uncategorized' to the Goal filter", () => {
    expect(filterPrograms(ALL, { ...EMPTY, goals: ["Uncategorized"] }).map((x) => x.id)).toEqual(["6"]);
  });
});

describe("option counts say what choosing would give", () => {
  it("Goal counts ignore the Goal choice itself but keep the other filters", () => {
    const c = optionCounts(ALL, { ...EMPTY, goals: ["Strength"], perWeek: ["3-4"] }, "goals");
    expect(c).toEqual({ Hypertrophy: 2, Strength: 1, Endurance: 1 });
  });
});

describe("grouping", () => {
  it("by category in the library's order, uncategorised last, empty ones left out", () => {
    const g = group(ALL, CATEGORIES.map((c) => c.tag));
    expect(g.map((x) => [x.tag, x.programs.length])).toEqual([["Hypertrophy", 3], ["Strength", 1], ["Endurance", 1], ["Uncategorized", 1]]);
  });
});

describe("what is remembered", () => {
  it("reads back what was saved", () => {
    const s = { q: "pu", goals: ["Strength"], perWeek: ["3-4" as const], length: [], used: true, open: ["Strength"] };
    expect(parseState(JSON.stringify(s))).toEqual(s);
  });
  it("garbage, or an old shape, becomes an empty state, never an error", () => {
    expect(parseState("not json")).toEqual(EMPTY);
    expect(parseState(null)).toEqual(EMPTY);
    expect(parseState(JSON.stringify({ perWeek: ["9", "3-4"], length: "x", used: "yes", goals: [3, "Strength"] }))).toEqual({ ...EMPTY, perWeek: ["3-4"], goals: ["Strength"] });
  });
  it("toggle adds and removes", () => {
    expect(toggle(["a"], "b")).toEqual(["a", "b"]);
    expect(toggle(["a", "b"], "a")).toEqual(["b"]);
  });
});
