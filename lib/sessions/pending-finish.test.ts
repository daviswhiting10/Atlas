import { describe, expect, it } from "vitest";
import { clearFinish, PENDING_FINISH_MAX_MS, queueFinish, queuedFinish } from "./pending-finish";

const fake = () => {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) };
};

describe("a finish queued while offline", () => {
  it("is kept per workout until it goes through", () => {
    const s = fake();
    expect(queuedFinish(s, "w1")).toBeNull();
    queueFinish(s, "w1", 42, 1000);
    queueFinish(s, "w2", 10, 1000);
    expect(queuedFinish(s, "w1", 2000)).toEqual({ minutes: 42 });
    clearFinish(s, "w1");
    expect(queuedFinish(s, "w1", 2000)).toBeNull();
    expect(queuedFinish(s, "w2", 2000)).toEqual({ minutes: 10 });
  });
  it("is forgotten when it is too old to trust", () => {
    const s = fake();
    queueFinish(s, "w1", 42, 0);
    expect(queuedFinish(s, "w1", PENDING_FINISH_MAX_MS + 1)).toBeNull();
  });
  it("survives storage that throws or holds junk", () => {
    const broken = { getItem: () => { throw new Error("no"); }, setItem: () => { throw new Error("no"); } };
    expect(() => queueFinish(broken, "w1", 1)).not.toThrow();
    expect(queuedFinish(broken, "w1")).toBeNull();
    const junk = { getItem: () => "not json", setItem: () => {} };
    expect(queuedFinish(junk, "w1")).toBeNull();
  });
});
