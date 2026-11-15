import { describe, expect, it } from "vitest";
import { createOptimisticFlags, stillOverridden, type SaveResult } from "./optimistic";

/** A flag set with a scripted `save`: each call waits for you to release it. */
function harness() {
  const shown: Record<string, boolean> = {};
  const sent: Array<{ key: string; on: boolean }> = [];
  const failures: Array<{ key: string; error?: string }> = [];
  const gates: Array<(r: SaveResult | "throw") => void> = [];
  const flags = createOptimisticFlags({
    save: (key, on) => {
      sent.push({ key, on });
      return new Promise<SaveResult>((resolve, reject) => gates.push((r) => (r === "throw" ? reject(new Error("offline")) : resolve(r))));
    },
    apply: (key, on) => {
      shown[key] = on;
    },
    fail: (key, error) => failures.push({ key, error }),
  });
  /** Let queued promise callbacks run. */
  const tick = () => new Promise((r) => setTimeout(r, 0));
  return { flags, shown, sent, failures, gates, tick };
}

describe("a tap", () => {
  it("shows at once, before anything is sent", () => {
    const h = harness();
    h.flags.set("water", true, false);
    expect(h.shown.water).toBe(true); // synchronous
    expect(h.sent).toEqual([]); // the save hasn't even started
  });

  it("is saved in the background and then stays", async () => {
    const h = harness();
    h.flags.set("water", true, false);
    await h.tick();
    expect(h.sent).toEqual([{ key: "water", on: true }]);
    expect(h.flags.busy("water")).toBe(true);
    h.gates[0]({ ok: true });
    await h.flags.idle();
    expect(h.shown.water).toBe(true);
    expect(h.failures).toEqual([]);
    expect(h.flags.busy("water")).toBe(false);
  });
});

describe("a save that fails", () => {
  it("puts the flag back and says so once, with the server's words", async () => {
    const h = harness();
    h.flags.set("water", true, false);
    await h.tick();
    h.gates[0]({ ok: false, error: "That day is closed." });
    await h.flags.idle();
    expect(h.shown.water).toBe(false);
    expect(h.failures).toEqual([{ key: "water", error: "That day is closed." }]);
  });

  it("treats a thrown error (offline) the same way", async () => {
    const h = harness();
    h.flags.set("water", true, false);
    await h.tick();
    h.gates[0]("throw");
    await h.flags.idle();
    expect(h.shown.water).toBe(false);
    expect(h.failures).toHaveLength(1);
  });

  it("puts an untick back to ticked", async () => {
    const h = harness();
    h.flags.set("water", false, true);
    expect(h.shown.water).toBe(false);
    await h.tick();
    h.gates[0]({ ok: false });
    await h.flags.idle();
    expect(h.shown.water).toBe(true);
  });
});

describe("quick taps on one flag", () => {
  it("only the last value is sent when taps arrive before the first save starts", async () => {
    const h = harness();
    h.flags.set("water", true, false);
    h.flags.set("water", false, true); // changed their mind at once
    await h.tick();
    expect(h.sent).toEqual([{ key: "water", on: false }]); // the first was never sent
    h.gates[0]({ ok: true });
    await h.flags.idle();
    expect(h.shown.water).toBe(false);
  });

  it("saves go in order, one at a time", async () => {
    const h = harness();
    h.flags.set("water", true, false);
    await h.tick();
    h.flags.set("water", false, true); // while the first is still out
    await h.tick();
    expect(h.sent).toEqual([{ key: "water", on: true }]); // the second waits its turn
    h.gates[0]({ ok: true });
    await h.tick();
    expect(h.sent).toEqual([
      { key: "water", on: true },
      { key: "water", on: false },
    ]);
    h.gates[1]({ ok: true });
    await h.flags.idle();
    expect(h.shown.water).toBe(false);
  });

  it("a failed earlier save doesn't undo a newer tap, and the newer failure goes back to the last saved value", async () => {
    const h = harness();
    h.flags.set("water", true, false); // saved value is false
    await h.tick();
    h.flags.set("water", false, true);
    h.flags.set("water", true, false);
    h.gates[0]({ ok: false }); // the first one fails, but a newer tap is waiting
    await h.tick();
    expect(h.shown.water).toBe(true); // the newer tap still stands
    expect(h.failures).toEqual([]); // and nothing is reported yet
    await h.tick();
    expect(h.sent.at(-1)).toEqual({ key: "water", on: true });
    h.gates[1]({ ok: false, error: "Offline." }); // the newer one fails too
    await h.flags.idle();
    expect(h.shown.water).toBe(false); // back to what was last saved
    expect(h.failures).toEqual([{ key: "water", error: "Offline." }]);
  });

  it("goes back to the last value that did save, not the value before the failed tap", async () => {
    const h = harness();
    h.flags.set("water", true, false);
    await h.tick();
    h.gates[0]({ ok: true }); // saved: true
    await h.flags.idle();
    h.flags.set("water", false, true);
    await h.tick();
    h.gates[1]({ ok: false });
    await h.flags.idle();
    expect(h.shown.water).toBe(true);
  });
});

describe("separate flags", () => {
  it("don't wait for each other, and one failing leaves the other alone", async () => {
    const h = harness();
    h.flags.set("water", true, false);
    h.flags.set("reading", true, false);
    await h.tick();
    expect(h.sent.map((s) => s.key).sort()).toEqual(["reading", "water"]); // both out at once
    h.gates[0]({ ok: false });
    h.gates[1]({ ok: true });
    await h.flags.idle();
    expect(h.shown).toEqual({ water: false, reading: true });
    expect(h.failures).toHaveLength(1);
  });
});

describe("stillOverridden", () => {
  it("drops an override once the server agrees, keeps one it hasn't caught up with or that is still saving", () => {
    const kept = stillOverridden({ a: true, b: true, c: false, d: true }, { a: true, b: false, c: false }, (k) => k === "c");
    expect(kept).toEqual({ b: true, c: false, d: true }); // a agrees and is idle; b differs; c is busy; d is unknown to the server
  });
});
