import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";

// The name rules are pure; their module also holds the one library read, which isn't used here.
vi.mock("@/lib/db/client", () => ({ prisma: {} }));
import { applyMatch } from "./dedupe";
import { splitCue, suggestMatches, wordsKey } from "./dedupe-server";
import { extractionToGrid, parseExtraction } from "./extract";

const LIB = [
  { id: "ht", name: "Hip Thrust" },
  { id: "bht", name: "Barbell Hip Thrust" },
  { id: "lp", name: "Leg Press" },
  { id: "sp", name: "Side Plank" },
  { id: "gbs", name: "Goblet Box Squat" },
  { id: "mcp", name: "Machine Chest Press" },
  { id: "rdl", name: "Dumbbell Romanian Deadlift" },
  { id: "be", name: "45° Back Extension — to neutral (BW → plate to chest)" },
  { id: "row1", name: "Cable Row" },
  { id: "row2", name: "Row (cable)" },
];
const none = new Set<string>();

describe("a cue in an exercise name", () => {
  it("brackets, a dash, an 'or' choice", () => {
    expect(splitCue("Hip thrust (lighter, 2 sec pause at top)")).toEqual({ core: "Hip thrust", cue: "lighter, 2 sec pause at top" });
    expect(splitCue("Machine chest press or incline push-up")).toEqual({ core: "Machine chest press", cue: "or incline push-up" });
    expect(splitCue("45° Back Extension — to neutral")).toEqual({ core: "45° Back Extension", cue: "to neutral" });
    expect(splitCue("Barbell hip thrust")).toEqual({ core: "Barbell hip thrust", cue: null });
  });
  it("the same words in any order, shorthand spelled out", () => {
    expect(wordsKey("Goblet squat to box")).toBe(wordsKey("Goblet Box Squat"));
    expect(wordsKey("DB RDL")).toBe(wordsKey("Dumbbell Romanian Deadlift"));
    expect(wordsKey("Banded seated abduction")).not.toBe(wordsKey("Banded hip abduction"));
  });
});

describe("suggestions", () => {
  it("Chloe's names: the library exercise each one is, with its cue", () => {
    const out = suggestMatches(
      ["Hip thrust (lighter, 2 sec pause at top)", "Leg press (feet high and wide)", "Side plank (knees OK)", "Goblet squat to box", "Machine chest press or incline push-up", "45° Back Extension (Glute Bias)"],
      LIB,
      none
    );
    expect(out.map((m) => [m.name, m.match, m.cue])).toEqual([
      ["Hip thrust (lighter, 2 sec pause at top)", "Hip Thrust", "lighter, 2 sec pause at top"],
      ["Leg press (feet high and wide)", "Leg Press", "feet high and wide"],
      ["Side plank (knees OK)", "Side Plank", "knees OK"],
      ["Goblet squat to box", "Goblet Box Squat", null],
      ["Machine chest press or incline push-up", "Machine Chest Press", "or incline push-up"],
      ["45° Back Extension (Glute Bias)", "45° Back Extension — to neutral (BW → plate to chest)", "Glute Bias"],
    ]);
  });
  it("nothing for a name the resolver already matches, a new exercise, or an ambiguous match", () => {
    expect(suggestMatches(["Barbell hip thrust"], LIB, new Set(["Barbell hip thrust"]))).toEqual([]);
    expect(suggestMatches(["Cat-cow", "Side-lying clamshell", "Banded seated abduction"], LIB, none)).toEqual([]);
    // "Cable row (slow)": two library rows have those words. No guess.
    expect(suggestMatches(["Cable row (slow)"], LIB, none)).toEqual([]);
  });
});

describe("using a suggestion, and taking it back", () => {
  const grid = () => extractionToGrid(parseExtraction(readFileSync(join(__dirname, "fixtures", "chloe-4wk-glute.reply.json"), "utf8"))!);
  const m = { name: "Hip thrust (lighter, 2 sec pause at top)", match: "Hip Thrust", matchId: "ht", cue: "lighter, 2 sec pause at top" };
  const find = (g: ReturnType<typeof grid>, n: string) => g.days.flatMap((d) => d.exercises).find((e) => e.name === n);

  it("renames the exercise, adds the cue to its note; off puts both back", () => {
    const before = grid();
    const original = find(before, m.name)!;
    expect(original).toBeTruthy();
    const on = applyMatch(before, m, true);
    expect(find(on, m.name)).toBeUndefined();
    expect(find(on, "Hip Thrust")!.notes).toMatch(/\(lighter, 2 sec pause at top\)$/);
    const off = applyMatch(on, m, false);
    expect(find(off, m.name)).toEqual(original);
    // Day 1's Barbell hip thrust is a different exercise and is never touched.
    expect(find(on, "Barbell hip thrust")).toEqual(find(before, "Barbell hip thrust"));
  });
});
