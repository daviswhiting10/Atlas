import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
const hook = read("app/(dashboard)/clients/[id]/log/useDragOrder.ts");
const coach = read("app/(dashboard)/clients/[id]/log/WorkoutLogger.tsx");
const athlete = read("components/athlete/WorkoutLogger.tsx");
const handle = read("components/logger/DragHandle.tsx");

describe("the drag hook, for a mouse and a keyboard", () => {
  it("a mouse lifts from the grip as soon as it moves; the phone's hold is unchanged", () => {
    expect(hook).toContain("const MOUSE_LIFT = 4;");
    expect(hook).toContain('startPress(e, id, header, e.pointerType === "mouse")');
    expect(hook).toContain("export const LIFT_MS = 250;");
    expect(hook).toContain("const SLOP = 8;");
  });
  it("the grip is focusable, named, and runs the keyboard flow", () => {
    expect(hook).toContain("tabIndex: 0");
    expect(hook).toContain('"aria-roledescription": "reorder handle"');
    expect(hook).toContain("kbKey(e.key,");
    expect(hook).toContain("e.preventDefault();");
  });
  it("a second key pressed before React redraws moves from where the card is now", () => {
    expect(hook).toContain("orderRef.current = r.order;");
  });
  it("a move of focus alone happens at once (there is nothing to redraw)", () => {
    expect(hook).toContain("if (!r.order) listRef.current?.querySelector<HTMLElement>");
  });
  it("leaving the grip while a card is picked up drops it, and a move keeps focus on it", () => {
    expect(hook).toContain('document.activeElement?.getAttribute("data-drag-handle") !== id');
    expect(hook).toContain("pendingFocus.current = r.focus");
  });
});

describe("reduced motion", () => {
  it("nothing scales or glides: the lifted card follows the pointer, the others jump", () => {
    expect(hook).toContain('window.matchMedia("(prefers-reduced-motion: reduce)")');
    expect(hook).toContain('scale: reduce ? undefined : "1.03"');
    expect(hook).toContain('transition: reduce ? "none"');
    expect((hook.match(/reduce \? "none"/g) ?? []).length).toBeGreaterThanOrEqual(3);
  });
});

describe("both loggers use it", () => {
  it("the coach's desktop view has its own list, grips on open cards and folded rows, the insertion line and the status line", () => {
    expect(coach).toContain("const dragD = useDragOrder(");
    expect(coach).toContain("ref={dragD.listRef}");
    expect(coach.match(/dragD\.handle\(ex\.aweId, ex\.name\)/g)?.length).toBe(2);
    expect(coach).toContain("<DragStatus message={dragD.status} />");
    expect(coach).toContain("dragD.lineTop");
    expect(coach).toContain("data-exercise={ex.aweId} style={dragD.styleFor(ex.aweId)}");
    expect(coach).toContain("{...dragD.bind(ex.aweId)}");
  });
  it("the coach's phone view is the one it was", () => {
    expect(coach).toContain("hold={drag.bind(ex.aweId)}");
    expect(coach).toContain("ref={drag.listRef}");
  });
  it("the athlete's grip shows from the desktop width up; a phone has none and holds the header as before", () => {
    expect(athlete.match(/className="(-ml-1 )?hidden md:flex"/g)?.length).toBe(2);
    expect(athlete).toContain("{...drag.bind(ex.aweId)}");
    expect(athlete).toContain("<DragStatus message={drag.status} />");
  });
  it("the grip is a 44 px target with a focus ring, and the status line is a live region", () => {
    expect(handle).toContain("h-11 w-7");
    expect(handle).toContain("focus-visible:ring-2");
    expect(handle).toContain('role="status" aria-live="assertive"');
  });
  it("a drag changes only this session's order; the plan changes only from the Keep sheet (as on the phone)", () => {
    expect(coach).toContain("onChange: moveTo");
    expect(coach).toMatch(/const moveTo = [\s\S]*?setSavedOrder\(o\);/);
    expect(coach).toContain("onKeep={() => keepSuperset(keepAsk)}");
    expect(athlete).toContain("onChange: setSavedOrder");
    expect(athlete).toContain("onKeep={() => keepSuperset(keepAsk)}");
  });
});
