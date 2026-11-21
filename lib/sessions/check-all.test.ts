import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { bulkConfirmText, bulkIndices, checkAllText, exerciseBulk, queueBulk, workoutBulk } from "./check-all";
import { pendingKey, readPending } from "./pending";

const mem = () => {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) } as unknown as Storage;
};

describe("exercise Check all", () => {
  it("all unticked: ticks every set, in order", () => {
    expect(exerciseBulk([false, false, false])).toBe("check");
    expect(bulkIndices([false, false, false], "check")).toEqual([0, 1, 2]);
  });
  it("some ticked: ticks only the unticked ones", () => {
    expect(exerciseBulk([true, false, true, false])).toBe("check");
    expect(bulkIndices([true, false, true, false], "check")).toEqual([1, 3]);
  });
  it("skips a set that can't be logged yet (no reps)", () => {
    expect(bulkIndices([false, false, false], "check", [true, false, true])).toEqual([0, 2]);
  });
  it("all ticked: the button flips to Uncheck all and un-ticks every set", () => {
    expect(exerciseBulk([true, true])).toBe("uncheck");
    expect(bulkIndices([true, true], "uncheck")).toEqual([0, 1]);
  });
  it("no sets: no button", () => expect(exerciseBulk([])).toBeNull());
});

describe("workout Check all", () => {
  it("counts the unticked sets for the confirm", () => {
    expect(workoutBulk([[false, false, false], [true, false], [false]])).toEqual({ mode: "check", count: 5 });
    expect(checkAllText(14)).toBe("Check all 14 sets?");
    expect(checkAllText(1)).toBe("Check all 1 set?");
    expect(bulkConfirmText("uncheck", 14)).toBe("Uncheck all 14 sets?");
    expect(bulkConfirmText("uncheck", 1)).toBe("Uncheck all 1 set?");
    expect(bulkConfirmText("check", 3)).toBe("Check all 3 sets?");
  });
  it("mixed: only the unticked are counted", () => {
    expect(workoutBulk([[true, true], [true, false]])).toEqual({ mode: "check", count: 1 });
  });
  it("everything ticked: Uncheck all", () => {
    expect(workoutBulk([[true], [true, true]])).toEqual({ mode: "uncheck", count: 3 });
  });
  it("nothing to check", () => expect(workoutBulk([[], []])).toBeNull());
});

describe("offline: the bulk tick is kept on the phone in set order, and Uncheck all replaces it", () => {
  it("queues every set, then un-ticks them", () => {
    const st = mem();
    const sets = [1, 2, 3].map((n) => ({ aweId: "a1", setNumber: n, done: true, weight: 100, reps: 8 }));
    queueBulk(st, "w1", sets, 1_000);
    const p = readPending(st, "w1", 2_000);
    expect(Object.keys(p)).toEqual(["a1:1", "a1:2", "a1:3"]);
    expect(Object.values(p).every((t) => t.done && t.weight === 100 && t.reps === 8)).toBe(true);
    expect(p[pendingKey("a1", 1)].at).toBeLessThan(p[pendingKey("a1", 3)].at);
    queueBulk(st, "w1", sets.map((x) => ({ ...x, done: false })), 3_000);
    const q = readPending(st, "w1", 4_000);
    expect(Object.values(q).every((t) => t.done === false)).toBe(true);
  });
});

describe("both loggers", () => {
  const athlete = readFileSync(new URL("../../components/athlete/WorkoutLogger.tsx", import.meta.url), "utf8");
  const coach = readFileSync(new URL("../../app/(dashboard)/clients/[id]/log/WorkoutLogger.tsx", import.meta.url), "utf8");
  const ui = readFileSync(new URL("../../components/logger/check-all.tsx", import.meta.url), "utf8");
  it.each([["athlete", athlete], ["coach", coach]])("%s: guarded by the settle window, quiet, one rest start", (_, src) => {
    expect(src).toMatch(/function bulkOne[\s\S]{0,80}if \(!settled\(\)\) return/);
    expect(src).toMatch(/function bulkAll[\s\S]{0,80}if \(!settled\(\)\) return/);
    expect(src).toContain("queueBulk(");
    const fn = src.slice(src.indexOf("function applyBulk"), src.indexOf("function bulkOne"));
    expect(fn).not.toMatch(/toast/);
    expect((fn.match(/afterChange\(|setLastSetAt\(Date\.now\(\)\)/g) ?? []).length).toBe(1);
  });
  it("the confirm sheet ignores a tap in its first 400 ms", () => {
    expect(ui).toMatch(/performance\.now\(\) - openedAt\.current > 400/);
    expect(ui).toContain("ready() && onConfirm()");
  });
  it("the button is 44 px, has an instant pressed state and no animation", () => {
    expect(ui).toContain("min-h-11");
    expect(ui).toContain("transition-none");
    expect(ui).toContain("active:bg-");
  });
  it("sits in the Add set row of both loggers, not in the tick column", () => {
    expect(athlete.match(/CheckAllButton/g)!.length).toBeGreaterThanOrEqual(2);
    expect(coach.match(/<CheckAllButton/g)!.length).toBe(2);
  });
  it("the whole-workout option is in the ⋯ menu, and both directions ask first with the count", () => {
    for (const src of [athlete, coach]) {
      expect(src).toContain("setConfirmAll({ mode: wb.mode, count: wb.count })");
      expect(src).not.toContain('bulkAll("uncheck"))');
      expect(src).toContain("bulkAll(mode)");
    }
  });
  it("asking to uncheck stops the finishing countdown so the sheet can't race it", () => {
    for (const src of [athlete, coach]) expect(src).toMatch(/cancelFinish\(\);\s*setConfirmAll\(/);
  });
  it("the coach logger shows a carried-down weight muted too", () => {
    expect(coach).toContain("muted={!entry.completed && filled.has(entry.uid)}");
  });
});
