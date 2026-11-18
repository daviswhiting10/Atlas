import { describe, expect, it } from "vitest";
import { PENDING_MAX_MS, addPending, clearPending, pendingKey, readPending } from "./pending";

function mem() {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) };
}

describe("pending ticks", () => {
  it("keeps a tap until the server confirms that state", () => {
    const s = mem();
    addPending(s, "w1", pendingKey("a", 1), { done: true }, 1000);
    expect(readPending(s, "w1", 2000)).toEqual({ "a:1": { done: true, at: 1000 } });
    clearPending(s, "w1", "a:1", true);
    expect(readPending(s, "w1", 2000)).toEqual({});
  });

  it("a confirmation of an older state doesn't clear a newer tap", () => {
    const s = mem();
    addPending(s, "w1", "a:1", { done: true }, 1000);
    addPending(s, "w1", "a:1", { done: false }, 1100); // un-ticked before the first save landed
    clearPending(s, "w1", "a:1", true); // the first save lands
    expect(readPending(s, "w1", 2000)["a:1"]?.done).toBe(false);
  });

  it("clears without a state when a save is given up", () => {
    const s = mem();
    addPending(s, "w1", "a:1", { done: true }, 1000);
    clearPending(s, "w1", "a:1");
    expect(readPending(s, "w1", 2000)).toEqual({});
  });

  it("keeps workouts apart, carries values, and forgets old taps", () => {
    const s = mem();
    addPending(s, "w1", "a:1", { done: true, weight: 102.5, reps: 8 }, 1000);
    addPending(s, "w2", "b:2", { done: true }, 1000);
    expect(readPending(s, "w1", 2000)["a:1"]).toMatchObject({ weight: 102.5, reps: 8 });
    expect(Object.keys(readPending(s, "w2", 2000))).toEqual(["b:2"]);
    expect(readPending(s, "w1", 1000 + PENDING_MAX_MS + 1)).toEqual({});
  });

  it("survives unreadable storage", () => {
    const broken = { getItem: () => "{not json", setItem: () => { throw new Error("full"); } };
    expect(readPending(broken, "w1")).toEqual({});
    expect(() => addPending(broken, "w1", "a:1", { done: true })).not.toThrow();
    expect(() => addPending(null, "w1", "a:1", { done: true })).not.toThrow();
  });
});

describe("network errors", () => {
  it("tells a lost connection from the server refusing", async () => {
    const { isNetworkError } = await import("./pending");
    expect(isNetworkError(new TypeError("Failed to fetch"), true)).toBe(true);
    expect(isNetworkError(new TypeError("Load failed"), true)).toBe(true); // Safari
    expect(isNetworkError(new Error("Set not found"), true)).toBe(false);
    expect(isNetworkError(new Error("anything"), false)).toBe(true); // offline: always the connection
    expect(isNetworkError(new TypeError("x is undefined"), true)).toBe(false);
  });
});
