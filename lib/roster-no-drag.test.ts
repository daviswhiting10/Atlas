import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const swipe = readFileSync(new URL("../components/coach/SwipeRow.tsx", import.meta.url), "utf8");
const page = readFileSync(new URL("../app/(dashboard)/clients/page.tsx", import.meta.url), "utf8");

describe("roster rows are never dragged with a mouse", () => {
  it("the swipe starts only from touch or pen", () => {
    expect(swipe).toContain('if (e.pointerType === "mouse") return;');
  });
  it("no native drag (ghost image) and no text selection by dragging", () => {
    expect(swipe).toContain("onDragStart={(e) => e.preventDefault()}");
    expect(swipe).toContain("select-none");
    expect(page).toContain("draggable={false}");
  });
  it("the ⋯ menu stays the desktop way to Delete, and the phone keeps the swipe", () => {
    expect(page).toContain("Delete client");
    expect(page).toContain("<SwipeRow");
  });
});
