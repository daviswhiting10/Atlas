import { describe, expect, it } from "vitest";
import { kbKey, type KbState } from "./kb-reorder";
import { sessionOrder, type OrderEntry } from "./order";

const order = (n: number): OrderEntry[] => sessionOrder(Array.from({ length: n }, (_, i) => ({ aweId: `e${i + 1}`, section: null })), null);
const ids = (o: OrderEntry[]) => o.map((e) => e.aweId).join(",");
const ctx = (id: string, o: OrderEntry[], kb: KbState = null) => ({ id, name: id.toUpperCase(), order: o, kb });

describe("keyboard reorder: before anything is picked up", () => {
  it("Up and Down move focus to the neighbouring card", () => {
    expect(kbKey("ArrowDown", ctx("e2", order(4)))).toMatchObject({ handled: true, focus: "e3" });
    expect(kbKey("ArrowUp", ctx("e2", order(4)))).toMatchObject({ handled: true, focus: "e1" });
  });
  it("at the ends there is nowhere to go, and it says nothing is wrong", () => {
    expect(kbKey("ArrowUp", ctx("e1", order(4)))).toEqual({ handled: true, kb: null });
    expect(kbKey("ArrowDown", ctx("e4", order(4)))).toEqual({ handled: true, kb: null });
  });
  it("Space or Enter picks the card up and says how to move it", () => {
    for (const key of [" ", "Enter"]) {
      const r = kbKey(key, ctx("e2", order(4)));
      expect(r.kb).toMatchObject({ id: "e2" });
      expect(r.message).toContain("E2 picked up, position 2 of 4");
      expect(r.message).toContain("Space drops it");
    }
  });
  it("other keys are left alone (typing, Tab)", () => {
    expect(kbKey("a", ctx("e2", order(4))).handled).toBe(false);
    expect(kbKey("Tab", ctx("e2", order(4))).handled).toBe(false);
  });
});

describe("keyboard reorder: while a card is picked up", () => {
  const o = order(4);
  const picked: KbState = { id: "e2", original: o };
  it("Down and Up move it one place and keep it picked up", () => {
    const down = kbKey("ArrowDown", ctx("e2", o, picked));
    expect(ids(down.order!)).toBe("e1,e3,e2,e4");
    expect(down.kb).toBe(picked);
    expect(down.message).toBe("E2 moved to position 3 of 4.");
    expect(ids(kbKey("ArrowUp", ctx("e2", o, picked)).order!)).toBe("e2,e1,e3,e4");
  });
  it("at the end it says so and changes nothing", () => {
    const last = kbKey("ArrowDown", ctx("e4", order(4), { id: "e4", original: o }));
    expect(last.order).toBeUndefined();
    expect(last.message).toContain("can't go down any further");
  });
  it("Space drops it where it is", () => {
    const r = kbKey(" ", ctx("e2", o, picked));
    expect(r.kb).toBeNull();
    expect(r.order).toBeUndefined();
    expect(r.message).toContain("dropped at position 2 of 4");
  });
  it("Escape puts the order back as it was before the pick-up", () => {
    const moved = kbKey("ArrowDown", ctx("e2", o, picked)).order!;
    const r = kbKey("Escape", ctx("e2", moved, picked));
    expect(ids(r.order!)).toBe("e1,e2,e3,e4");
    expect(r.kb).toBeNull();
    expect(r.message).toContain("Move cancelled");
  });
  it("another card's handle does nothing while one is picked up", () => {
    expect(kbKey("ArrowDown", ctx("e3", o, picked))).toEqual({ handled: false, kb: picked });
  });
  it("a full journey: pick up, move twice, drop", () => {
    let cur = o;
    let kb: KbState = null;
    kb = kbKey(" ", ctx("e1", cur, kb)).kb;
    for (let n = 0; n < 2; n++) {
      const r = kbKey("ArrowDown", ctx("e1", cur, kb));
      cur = r.order ?? cur;
    }
    expect(ids(cur)).toBe("e2,e3,e1,e4");
    expect(kbKey(" ", ctx("e1", cur, kb)).kb).toBeNull();
  });
});
