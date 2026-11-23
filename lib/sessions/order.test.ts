import { describe, expect, it } from "vitest";
import { canMerge, dropAt, labelsOf, mergeWith, sessionOrder, stepOrder, type PlanEntry } from "./order";

// Warm-up, a superset (1A Bench / 1B Row), Squat on its own, Curl on its own, Stretch to cool down.
const plan: PlanEntry[] = [
  { aweId: "warm", section: "warmup" },
  { aweId: "bench", section: "block:1" },
  { aweId: "row", section: "block:1" },
  { aweId: "squat", section: "block:2" },
  { aweId: "curl", section: "block:3" },
  { aweId: "stretch", section: "cooldown" },
];
const o = sessionOrder(plan, null);
const ids = (x: { aweId: string }[]) => x.map((e) => e.aweId);

describe("session order", () => {
  it("is the plan's order until something moves", () => {
    expect(ids(o)).toEqual(["warm", "bench", "row", "squat", "curl", "stretch"]);
    expect(labelsOf(o)).toEqual({ warm: "W", bench: "1A", row: "1B", squat: "2", curl: "3", stretch: "C" });
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
    expect(labelsOf(sessionOrder(plan, saved))).toEqual({ warm: "W", squat: "1", bench: "2A", row: "2B", curl: "3", stretch: "C" });
  });
});

describe("dropping between rows (never merges)", () => {
  // Gaps count the other exercises above the drop: others of squat are warm, bench, row, curl, stretch.
  it("its own place changes nothing", () => {
    expect(dropAt(o, "squat", 3)).toEqual(o);
    expect(dropAt(o, "row", 2)).toEqual(o); // Row's own place, at the edge of its superset: still 1B
  });

  it("moves a single ahead of the superset (machine taken) and renumbers", () => {
    const m = dropAt(o, "squat", 1);
    expect(ids(m)).toEqual(["warm", "squat", "bench", "row", "curl", "stretch"]);
    expect(labelsOf(m)).toMatchObject({ squat: "1", bench: "2A", row: "2B", curl: "3" });
  });

  it("a drop inside another block's run lands below that block, on its own", () => {
    const m = dropAt(o, "curl", 2); // between Bench and Row
    expect(ids(m)).toEqual(["warm", "bench", "row", "curl", "squat", "stretch"]);
    expect(labelsOf(m)).toMatchObject({ bench: "1A", row: "1B", curl: "2", squat: "3" });
  });

  it("dragging a member out of its superset splits it; the emptied block closes up", () => {
    const m = dropAt(o, "row", 4); // below Curl
    expect(labelsOf(m)).toMatchObject({ bench: "1", squat: "2", curl: "3", row: "4" });
    // Bench out above Row: the superset is gone, both are blocks of their own.
    expect(labelsOf(dropAt(o, "bench", 0 + 1 + 1))).toMatchObject({ row: "1", bench: "2", squat: "3" });
  });

  it("an emptied single block disappears into the cool-down", () => {
    const m = dropAt(o, "squat", 5); // after Stretch
    expect(labelsOf(m)).toEqual({ warm: "W", bench: "1A", row: "1B", curl: "2", squat: "C", stretch: "C" });
  });

  it("a block exercise at a part boundary stays a block; nothing goes above the warm-up's part", () => {
    expect(labelsOf(dropAt(o, "curl", 1))).toMatchObject({ warm: "W", curl: "1", bench: "2A" }); // between Warm-up and Bench
    expect(labelsOf(dropAt(o, "curl", 0))).toMatchObject({ curl: "W" }); // above the warm-up: joins it
    expect(labelsOf(dropAt(o, "warm", 2))).toMatchObject({ bench: "1A", row: "1B", warm: "2", squat: "3" }); // a warm-up into the main work
  });

  it("a warm-up moved to the boundary keeps its part", () => {
    expect(dropAt(o, "warm", 0)).toEqual(o);
  });
});

describe("holding over a row (merge)", () => {
  it("supersets two singles: 1A/1B, the rest renumber", () => {
    const m = mergeWith(o, "curl", "squat");
    expect(ids(m)).toEqual(["warm", "bench", "row", "squat", "curl", "stretch"]);
    expect(labelsOf(m)).toMatchObject({ squat: "2A", curl: "2B" });
  });

  it("joins an existing superset right after the one held over", () => {
    const m = mergeWith(o, "curl", "bench");
    expect(labelsOf(m)).toMatchObject({ bench: "1A", curl: "1B", row: "1C", squat: "2" });
  });

  it("within the same superset it swaps sides", () => {
    expect(labelsOf(mergeWith(o, "row", "bench"))).toMatchObject({ row: "1A", bench: "1B" });
    expect(labelsOf(mergeWith(o, "bench", "row"))).toMatchObject({ row: "1A", bench: "1B" });
  });

  it("only onto a block's exercise, never itself", () => {
    expect(canMerge(o, "curl", "stretch")).toBe(false);
    expect(canMerge(o, "curl", "warm")).toBe(false);
    expect(canMerge(o, "curl", "curl")).toBe(false);
    expect(mergeWith(o, "curl", "stretch")).toEqual(o);
  });
});

describe("Up and Down (screen readers)", () => {
  it("steps past a whole superset, not into it", () => {
    expect(labelsOf(stepOrder(o, "squat", -1))).toMatchObject({ squat: "1", bench: "2A", row: "2B" });
  });

  it("a member at the edge of its superset steps out where it stands, then on", () => {
    const once = stepOrder(o, "row", 1);
    expect(labelsOf(once)).toMatchObject({ bench: "1", row: "2", squat: "3" });
    expect(labelsOf(stepOrder(once, "row", 1))).toMatchObject({ bench: "1", squat: "2", row: "3" });
    expect(labelsOf(stepOrder(o, "bench", -1))).toMatchObject({ bench: "1", row: "2" });
  });

  it("stops at the ends", () => {
    expect(stepOrder(o, "stretch", 1)).toEqual(o);
    expect(stepOrder(o, "warm", -1)).toEqual(o);
  });
});

import { dropWithin, groupOf, ungroupAt } from "./order";
describe("ungrouping a superset by dragging out of its outline", () => {
  const two = [{ aweId: "a", section: "block:1" }, { aweId: "b", section: "block:2" }, { aweId: "c", section: "block:2" }, { aweId: "d", section: "block:3" }];
  const three = [{ aweId: "a", section: "block:1" }, { aweId: "b", section: "block:2" }, { aweId: "c", section: "block:2" }, { aweId: "e", section: "block:2" }, { aweId: "d", section: "block:3" }];
  it("groupOf lists the members of a superset, and nothing for a single", () => {
    expect(groupOf(two, "b")).toEqual(["b", "c"]);
    expect(groupOf(three, "e")).toEqual(["b", "c", "e"]);
    expect(groupOf(two, "a")).toEqual([]);
  });
  it("2-member: dropped outside, below it, the member leaves and the other stays alone", () => {
    const r = ungroupAt(two, "b", 3);
    expect(r.map((e) => e.aweId)).toEqual(["a", "c", "d", "b"]);
    expect(groupOf(r, "c")).toEqual([]);
    expect(groupOf(r, "b")).toEqual([]);
  });
  it("2-member: dropped outside, above it", () => {
    const r = ungroupAt(two, "c", 0);
    expect(r.map((e) => e.aweId)).toEqual(["c", "a", "b", "d"]);
    expect(groupOf(r, "b")).toEqual([]);
  });
  it("2-member: dropped outside at its own gap, it simply comes out in place", () => {
    const r = ungroupAt(two, "c", 2);
    expect(r.map((e) => e.aweId)).toEqual(["a", "b", "c", "d"]);
    expect(groupOf(r, "c")).toEqual([]);
  });
  it("3-member: one leaves, the other two stay grouped", () => {
    const r = ungroupAt(three, "c", 0);
    expect(r.map((e) => e.aweId)).toEqual(["c", "a", "b", "e", "d"]);
    expect(groupOf(r, "b")).toEqual(["b", "e"]);
    expect(groupOf(r, "c")).toEqual([]);
  });
  it("inside the outline the member stays: it only moves among the members", () => {
    const r = dropWithin(three, "e", 1);
    expect(r.map((e) => e.aweId)).toEqual(["a", "e", "b", "c", "d"]);
    expect(groupOf(r, "e")).toEqual(["e", "b", "c"]);
  });
  it("inside, the gap is held to the group (never carried out of it)", () => {
    expect(dropWithin(two, "b", 0).map((e) => e.aweId)).toEqual(["a", "b", "c", "d"]);
    expect(groupOf(dropWithin(two, "b", 3), "b")).toEqual(["c", "b"]);
  });
});
