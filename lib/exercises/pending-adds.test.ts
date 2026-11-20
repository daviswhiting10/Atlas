import { describe, expect, it } from "vitest";
import { addPendingAdd, clearPendingAdd, PENDING_ADD_MAX_MS, readPendingAdds } from "./pending-adds";

function store() {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) };
}

describe("pending exercise adds", () => {
  it("keeps a typed exercise for its workout, and only that one", () => {
    const s = store();
    addPendingAdd(s, "w1", { name: "Handstand Walk", target: { mode: "add" } }, 1000, "a");
    expect(readPendingAdds(s, "w1", 2000).map((p) => p.name)).toEqual(["Handstand Walk"]);
    expect(readPendingAdds(s, "w2", 2000)).toEqual([]);
  });
  it("a repeated tap is the same entry, however the name is typed", () => {
    const s = store();
    addPendingAdd(s, "w1", { name: "Handstand Walk", target: { mode: "add" } }, 1000, "a");
    addPendingAdd(s, "w1", { name: "handstand walks", target: { mode: "add" } }, 1500, "b");
    const kept = readPendingAdds(s, "w1", 2000);
    expect(kept).toHaveLength(1);
    expect(kept[0].name).toBe("Handstand Walk"); // the spelling first typed
  });
  it("different names are kept apart, oldest first", () => {
    const s = store();
    addPendingAdd(s, "w1", { name: "Handstand Walk", target: { mode: "add" } }, 1000, "a");
    addPendingAdd(s, "w1", { name: "Cossack Squat", target: { mode: "add" } }, 900, "b");
    expect(readPendingAdds(s, "w1", 2000).map((p) => p.name)).toEqual(["Cossack Squat", "Handstand Walk"]);
  });
  it("a swap for the same exercise replaces the earlier wish", () => {
    const s = store();
    addPendingAdd(s, "w1", { name: "Handstand Walk", target: { mode: "swap", aweId: "x" } }, 1000, "a");
    addPendingAdd(s, "w1", { name: "Cossack Squat", target: { mode: "swap", aweId: "x" } }, 1100, "b");
    addPendingAdd(s, "w1", { name: "Cossack Squat", target: { mode: "add" } }, 1200, "c");
    expect(readPendingAdds(s, "w1", 2000).map((p) => `${p.target.mode}:${p.name}`)).toEqual(["swap:Cossack Squat", "add:Cossack Squat"]);
  });
  it("forgets one when it's done", () => {
    const s = store();
    addPendingAdd(s, "w1", { name: "Handstand Walk", target: { mode: "add" } }, 1000, "a");
    clearPendingAdd(s, "w1", "a");
    expect(readPendingAdds(s, "w1", 2000)).toEqual([]);
  });
  it("drops entries from an abandoned session", () => {
    const s = store();
    addPendingAdd(s, "w1", { name: "Handstand Walk", target: { mode: "add" } }, 1000, "a");
    expect(readPendingAdds(s, "w1", 1000 + PENDING_ADD_MAX_MS + 1)).toEqual([]);
  });
  it("survives broken storage", () => {
    const bad = { getItem: () => "{not json", setItem: () => { throw new Error("full"); } };
    expect(readPendingAdds(bad, "w1")).toEqual([]);
    expect(() => addPendingAdd(bad, "w1", { name: "x", target: { mode: "add" } })).not.toThrow();
    expect(readPendingAdds(null, "w1")).toEqual([]);
  });
});
