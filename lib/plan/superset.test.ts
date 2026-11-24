import { describe, expect, it } from "vitest";
import { groupIn, keptMessage, splitIn, supersetChange, type PlanRow, type RowChange } from "./superset";
import { mergeWith, sessionOrder, ungroupAt } from "@/lib/sessions/order";
import { canonicalSections } from "@/lib/workouts/structure";

/** A workout's rows: ids are `<prefix><exercise>`, so two instances of one workout share exercise ids but not row ids. */
const rows = (prefix: string, spec: Array<[string, string | null]>): PlanRow[] => spec.map(([ex, section], i) => ({ aweId: `${prefix}${ex}`, exerciseId: ex, order: i + 1, section }));
/** The workout after the changes, as the logger would read it: exercise and section, in order. */
const after = (rs: PlanRow[], changes: RowChange[]) => {
  const next = rs.map((r) => ({ ...r, ...(changes.find((c) => c.aweId === r.aweId) ?? {}) })).sort((a, b) => a.order - b.order);
  const sections = canonicalSections(next, (r) => r.section);
  return next.map((r, i) => `${r.exerciseId}:${sections[i]}`);
};

describe("groupIn: a superset kept in one workout", () => {
  it("puts the second right after the first, in its block, and renumbers the blocks", () => {
    const w = rows("w1-", [["squat", "block:1"], ["bench", "block:2"], ["row", "block:3"], ["curl", "block:4"]]);
    const c = groupIn(w, ["bench", "curl"])!;
    expect(after(w, c)).toEqual(["squat:block:1", "bench:block:2", "curl:block:2", "row:block:3"]);
  });

  it("matches by exercise, not by row: a later instance's own rows are changed", () => {
    const week2 = rows("w2-", [["squat", "block:1"], ["bench", "block:2"], ["row", "block:3"], ["curl", "block:4"]]);
    const c = groupIn(week2, ["bench", "curl"])!;
    expect(c.every((x) => x.aweId.startsWith("w2-"))).toBe(true);
    expect(after(week2, c)).toContain("curl:block:2");
  });

  it("picks a block that doesn't collide: an existing superset elsewhere keeps its own number", () => {
    const w = rows("w-", [["squat", "block:1"], ["dip", "block:2"], ["pullup", "block:2"], ["bench", "block:3"], ["curl", "block:4"]]);
    const c = groupIn(w, ["bench", "curl"])!;
    expect(after(w, c)).toEqual(["squat:block:1", "dip:block:2", "pullup:block:2", "bench:block:3", "curl:block:3"]);
  });

  it("reads older section names (block_a, accessory) the same way", () => {
    const w = rows("w-", [["squat", "block_a"], ["bench", "accessory"], ["curl", "accessory"]]);
    expect(after(w, groupIn(w, ["squat", "curl"])!)).toEqual(["squat:block:1", "curl:block:1", "bench:block:2"]);
  });

  it("moves an exercise from above to below the first", () => {
    const w = rows("w-", [["curl", "block:1"], ["squat", "block:2"], ["bench", "block:3"]]);
    expect(after(w, groupIn(w, ["bench", "curl"])!)).toEqual(["squat:block:1", "bench:block:2", "curl:block:2"]);
  });

  it("skips (null) a workout that lacks one of the exercises", () => {
    const w = rows("w-", [["squat", "block:1"], ["bench", "block:2"]]);
    expect(groupIn(w, ["bench", "curl"])).toBeNull();
  });

  it("changes nothing when they already are a superset, in that order", () => {
    const w = rows("w-", [["squat", "block:1"], ["bench", "block:2"], ["curl", "block:2"]]);
    expect(groupIn(w, ["bench", "curl"])).toEqual([]);
  });

  it("puts them in the session's order when they are in one block the other way round", () => {
    const w = rows("w-", [["curl", "block:1"], ["bench", "block:1"]]);
    expect(after(w, groupIn(w, ["bench", "curl"])!)).toEqual(["bench:block:1", "curl:block:1"]);
  });

  it("keeps a three-exercise superset together", () => {
    const w = rows("w-", [["a", "block:1"], ["b", "block:2"], ["c", "block:3"], ["d", "block:4"]]);
    expect(after(w, groupIn(w, ["a", "c", "d"])!)).toEqual(["a:block:1", "c:block:1", "d:block:1", "b:block:2"]);
  });

  it("never makes a block of a warm-up", () => {
    const w = rows("w-", [["bike", "warmup"], ["squat", "block:1"]]);
    expect(groupIn(w, ["bike", "squat"])).toEqual([]);
  });

  it("matches what the session shows after the same merge", () => {
    const spec: Array<[string, string | null]> = [["squat", "block:1"], ["bench", "block:2"], ["row", "block:3"], ["curl", "block:4"]];
    const w = rows("w-", spec);
    const session = mergeWith(sessionOrder(w, null), "w-curl", "w-bench");
    expect(after(w, groupIn(w, ["bench", "curl"])!)).toEqual(session.map((e) => `${e.aweId.slice(2)}:${e.section}`));
  });
});

describe("splitIn: a superset split, kept", () => {
  it("takes it out on its own, after the rest of its block", () => {
    const w = rows("w-", [["squat", "block:1"], ["bench", "block:2"], ["curl", "block:2"], ["row", "block:3"]]);
    expect(after(w, splitIn(w, "bench")!)).toEqual(["squat:block:1", "curl:block:2", "bench:block:3", "row:block:4"]);
    expect(after(w, splitIn(w, "curl")!)).toEqual(["squat:block:1", "bench:block:2", "curl:block:3", "row:block:4"]);
  });

  it("leaves the rest of a three-exercise superset together", () => {
    const w = rows("w-", [["a", "block:1"], ["b", "block:1"], ["c", "block:1"]]);
    expect(after(w, splitIn(w, "b")!)).toEqual(["a:block:1", "c:block:1", "b:block:2"]);
  });

  it("skips a workout without it, and changes nothing where it isn't in a superset", () => {
    const w = rows("w-", [["squat", "block:1"], ["bench", "block:2"]]);
    expect(splitIn(w, "curl")).toBeNull();
    expect(splitIn(w, "bench")).toEqual([]);
  });
});

describe("supersetChange: what a move in the session did", () => {
  const plan = sessionOrder(rows("w-", [["squat", "block:1"], ["bench", "block:2"], ["curl", "block:3"], ["row", "block:4"]]), null);

  it("a merge is a new superset, its members in order", () => {
    const next = mergeWith(plan, "w-row", "w-bench");
    expect(supersetChange(plan, next, plan)).toEqual({ kind: "group", aweIds: ["w-bench", "w-row"] });
  });

  it("joining a superset gives the whole superset", () => {
    const one = mergeWith(plan, "w-curl", "w-bench");
    const two = mergeWith(one, "w-row", "w-curl");
    expect(supersetChange(one, two, plan)).toEqual({ kind: "group", aweIds: ["w-bench", "w-curl", "w-row"] });
  });

  it("a reorder that changes no superset asks nothing", () => {
    expect(supersetChange(plan, [plan[1], plan[0], plan[2], plan[3]], plan)).toBeNull();
  });

  it("splitting a superset the plan has is a split; one made just today is not", () => {
    const grouped = mergeWith(plan, "w-curl", "w-bench");
    // The plan already has bench + curl.
    expect(supersetChange(grouped, ungroupAt(grouped, "w-curl", 3), grouped)).toEqual({ kind: "split", aweId: "w-curl" });
    // Just today: nothing to keep.
    expect(supersetChange(grouped, ungroupAt(grouped, "w-curl", 3), plan)).toBeNull();
  });

  it("putting back the plan's superset asks nothing", () => {
    const grouped = mergeWith(plan, "w-curl", "w-bench");
    const split = ungroupAt(grouped, "w-curl", 3);
    expect(supersetChange(split, mergeWith(split, "w-curl", "w-bench"), grouped)).toBeNull();
  });
});

describe("keptMessage", () => {
  it("says how many later workouts changed and how many were skipped", () => {
    expect(keptMessage(0, 0)).toBe("Kept for this workout");
    expect(keptMessage(1, 0)).toBe("Kept here and in 1 later workout");
    expect(keptMessage(5, 2)).toBe("Kept here and in 5 later workouts. 2 skipped: missing an exercise.");
    expect(keptMessage(3, 1)).toBe("Kept here and in 3 later workouts. 1 skipped: missing an exercise.");
  });
});
