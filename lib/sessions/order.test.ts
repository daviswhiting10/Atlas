import { describe, expect, it } from "vitest";
import { fromRows, labelsOf, move, sessionOrder, stepRow, toRows, type PlanEntry } from "./order";

// Warm-up, a superset (1A Bench / 1B Row), Squat on its own, Stretch to cool down.
const plan: PlanEntry[] = [
  { aweId: "warm", section: "warmup" },
  { aweId: "bench", section: "block:1" },
  { aweId: "row", section: "block:1" },
  { aweId: "squat", section: "block:2" },
  { aweId: "stretch", section: "cooldown" },
];
const ids = (o: { aweId: string }[]) => o.map((e) => e.aweId);
const rowIndex = (rows: ReturnType<typeof toRows>, title: string) => rows.findIndex((r) => r.kind === "heading" && r.title === title);

describe("session order", () => {
  it("is the plan's order until something moves", () => {
    const o = sessionOrder(plan, null);
    expect(ids(o)).toEqual(["warm", "bench", "row", "squat", "stretch"]);
    expect(labelsOf(o)).toEqual({ warm: "W", bench: "1A", row: "1B", squat: "2", stretch: "C" });
  });

  it("goes through rows and back unchanged", () => {
    const o = sessionOrder(plan, null);
    expect(fromRows(toRows(o))).toEqual(o);
  });

  it("moves Squat ahead of the superset (machine taken) and renumbers", () => {
    const o = sessionOrder(plan, null);
    const rows = toRows(o);
    // Into the new-block slot above Block 1 isn't a thing; put Squat under the Block 1 heading, before Bench.
    const moved = move(o, "squat", rowIndex(rows, "Block 1") + 1);
    expect(ids(moved)).toEqual(["warm", "squat", "bench", "row", "stretch"]);
    // Squat joined Block 1: a three-way group, lettered in order.
    expect(labelsOf(moved)).toMatchObject({ squat: "1A", bench: "1B", row: "1C" });
  });

  it("moves one half of a superset into the next block: labels renumber", () => {
    const o = sessionOrder(plan, null);
    const rows = toRows(o);
    const moved = move(o, "row", rowIndex(rows, "Block 2"));
    expect(labelsOf(moved)).toMatchObject({ bench: "1", row: "2A", squat: "2B" });
  });

  it("an emptied block disappears and the rest close up", () => {
    const o = sessionOrder(plan, null);
    const rows = toRows(o);
    // Squat (Block 2's only exercise) into the cool-down.
    const moved = move(o, "squat", rows.length);
    expect(labelsOf(moved)).toEqual({ warm: "W", bench: "1A", row: "1B", squat: "C", stretch: "C" });
    expect(toRows(moved).filter((r) => r.kind === "heading").map((r) => (r.kind === "heading" ? r.title : ""))).toEqual([
      "Warm-up",
      "Block 1",
      "Cool-down",
    ]);
  });

  it("Up and Down step one row, across a heading into the next part", () => {
    const o = sessionOrder(plan, null);
    // Bench is right under the Block 1 heading: Up takes it into the warm-up.
    const up = fromRows(stepRow(toRows(o), "bench", -1));
    expect(labelsOf(up)).toMatchObject({ warm: "W", bench: "W", row: "1", squat: "2" });
    // Row down: past the Block 2 heading, so it's grouped with Squat.
    const down = fromRows(stepRow(toRows(o), "row", 1));
    expect(labelsOf(down)).toMatchObject({ bench: "1", row: "2A", squat: "2B" });
  });

  it("never lets an exercise above the Warm-up heading", () => {
    const o = sessionOrder(plan, null);
    expect(labelsOf(move(o, "squat", 0))).toMatchObject({ squat: "W" });
  });

  it("keeps a saved order, drops exercises gone from the plan, adds new ones at the end", () => {
    const saved = [
      { aweId: "warm", section: "warmup" },
      { aweId: "squat", section: "block:1" },
      { aweId: "bench", section: "block:2" },
      { aweId: "row", section: "block:2" },
      { aweId: "gone", section: "block:3" },
      { aweId: "stretch", section: "cooldown" },
    ];
    const withCurl = [...plan.slice(0, 4), { aweId: "curl", section: "block:3" }, plan[4]];
    const o = sessionOrder(withCurl, saved);
    expect(labelsOf(o)).toEqual({ warm: "W", squat: "1", bench: "2A", row: "2B", curl: "3", stretch: "C" });
  });

  it("swaps the halves of a superset without splitting it", () => {
    const o = sessionOrder(plan, null);
    const swapped = move(o, "row", rowIndex(toRows(o), "Block 1") + 1); // Row before Bench
    expect(labelsOf(swapped)).toMatchObject({ row: "1A", bench: "1B" });
  });
});
