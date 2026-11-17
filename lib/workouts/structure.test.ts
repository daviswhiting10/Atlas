import { describe, expect, it } from "vitest";
import { canonicalSections, parts, readSection, sectionsFromSheet, structure } from "./structure";

const labels = <T,>(s: ReturnType<typeof structure<T>>) => ({
  warmup: s.warmup.map((i) => i.index),
  blocks: s.blocks.map((b) => b.items.map((i) => i.label)),
  cooldown: s.cooldown.map((i) => i.index),
});

describe("readSection", () => {
  it("reads canonical, older stored and sheet forms", () => {
    expect(readSection("warmup")).toEqual({ kind: "warmup" });
    expect(readSection("Warm-up")).toEqual({ kind: "warmup" });
    expect(readSection("Warm up:")).toEqual({ kind: "warmup" });
    expect(readSection("cooldown")).toEqual({ kind: "cooldown" });
    expect(readSection("Cool-down")).toEqual({ kind: "cooldown" });
    expect(readSection("Stretching")).toEqual({ kind: "cooldown" });
    expect(readSection("block:3")).toEqual({ kind: "group", group: "3" });
    expect(readSection("block_a")).toEqual({ kind: "group", group: "A" });
    expect(readSection("Block B")).toEqual({ kind: "group", group: "B" });
    expect(readSection("Main A")).toEqual({ kind: "group", group: "A" });
    expect(readSection("Superset 2")).toEqual({ kind: "group", group: "2" });
    expect(readSection("1A")).toEqual({ kind: "group", group: "1" });
    expect(readSection("2b")).toEqual({ kind: "group", group: "2" });
    expect(readSection("A")).toEqual({ kind: "group", group: "A" });
    expect(readSection("B2")).toEqual({ kind: "group", group: "B" });
  });

  it("treats generator roles, 'Main' and blanks as an exercise on its own", () => {
    for (const s of ["squat", "accessory", "finisher", "Main", "", null, undefined, "Day 1 stuff"]) {
      expect(readSection(s), String(s)).toEqual({ kind: "single" });
    }
  });
});

describe("structure", () => {
  it("numbers blocks in order and letters supersets", () => {
    const s = structure(["warmup", "1A", "1B", "2A", "2B", "2C", "3", "cooldown"], (x) => x);
    expect(labels(s)).toEqual({ warmup: [0], blocks: [["1A", "1B"], ["2A", "2B", "2C"], ["3"]], cooldown: [7] });
  });

  it("maps a sheet's lettered groups and older block_a values to Block 1, 2…", () => {
    expect(labels(structure(["A", "A", "B", "B", "C"], (x) => x)).blocks).toEqual([["1A", "1B"], ["2A", "2B"], ["3"]]);
    expect(labels(structure(["warmup", "block_a", "block_a", "block_b", "finisher"], (x) => x)).blocks).toEqual([["1A", "1B"], ["2"], ["3"]]);
  });

  it("gives every exercise without a group its own block", () => {
    expect(labels(structure([null, null, "squat", "core"], (x) => x)).blocks).toEqual([["1"], ["2"], ["3"], ["4"]]);
  });

  it("keeps warm-up and cool-down items out of the blocks wherever they sit", () => {
    const s = structure(["1A", "warmup", "1B"], (x) => x);
    expect(labels(s)).toEqual({ warmup: [1], blocks: [["1A", "1B"]], cooldown: [] });
  });

  it("starts a new block when the same group comes back after another", () => {
    expect(labels(structure(["A", "B", "A"], (x) => x)).blocks).toEqual([["1"], ["2"], ["3"]]);
  });

  it("always lists Warm-up and Cool-down, even empty", () => {
    expect(parts(structure(["1A", "1B"], (x) => x)).map((p) => [p.title, p.items.length])).toEqual([
      ["Warm-up", 0],
      ["Block 1", 2],
      ["Cool-down", 0],
    ]);
  });
});

describe("canonicalSections", () => {
  it("writes warmup / block:n / cooldown", () => {
    expect(canonicalSections(["Warm-up", "A", "A", "B", null, "Stretch"], (x) => x)).toEqual(["warmup", "block:1", "block:1", "block:2", "block:3", "cooldown"]);
  });

  it("reads back to the same structure", () => {
    const once = canonicalSections(["warmup", "1A", "1B", "2", "cooldown"], (x) => x);
    expect(canonicalSections(once, (x) => x)).toEqual(once);
  });
});

describe("sectionsFromSheet", () => {
  it("maps a coach's A/B/C groups to blocks, with a warm-up noted on the first row", () => {
    // From a real plan: group A opens with "Ski erg: Warm-up. Easy pace".
    const rows = [
      { label: "A", notes: "Warm-up. Easy pace, forward + backward" },
      { label: "A", notes: "Squeeze shoulder blades" },
      { label: "A" },
      { label: "B" },
      { label: "B" },
      { label: "C" },
    ];
    expect(sectionsFromSheet(rows)).toEqual(["warmup", "block:1", "block:1", "block:2", "block:2", "block:3"]);
  });

  it("maps 1A/1B/2A labels and explicit Warm-up / Cool-down labels", () => {
    expect(sectionsFromSheet([{ label: "Warm-up" }, { label: "1A" }, { label: "1B" }, { label: "2A" }, { label: "Cool-down" }])).toEqual([
      "warmup",
      "block:1",
      "block:1",
      "block:2",
      "cooldown",
    ]);
  });

  it("uses notes for warm-up and cool-down when there are no labels", () => {
    expect(sectionsFromSheet([{ notes: "Warm up 5 min" }, {}, {}, { notes: "Stretch hips" }])).toEqual(["warmup", "block:1", "block:2", "cooldown"]);
  });

  it("doesn't treat a mid-workout warm-up note as the warm-up", () => {
    expect(sectionsFromSheet([{ label: "1A" }, { label: "1B", notes: "Warm-up set first" }])).toEqual(["block:1", "block:1"]);
  });
});
