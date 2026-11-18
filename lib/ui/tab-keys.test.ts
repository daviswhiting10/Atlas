import { describe, expect, it } from "vitest";
import { nextTabIndex } from "./tab-keys";

describe("nextTabIndex", () => {
  it("moves right and down to the next tab, wrapping at the end", () => {
    expect(nextTabIndex("ArrowRight", 0, 3)).toBe(1);
    expect(nextTabIndex("ArrowDown", 1, 3)).toBe(2);
    expect(nextTabIndex("ArrowRight", 2, 3)).toBe(0);
  });
  it("moves left and up to the previous tab, wrapping at the start", () => {
    expect(nextTabIndex("ArrowLeft", 2, 3)).toBe(1);
    expect(nextTabIndex("ArrowUp", 1, 3)).toBe(0);
    expect(nextTabIndex("ArrowLeft", 0, 3)).toBe(2);
  });
  it("Home and End jump to the ends", () => {
    expect(nextTabIndex("Home", 2, 5)).toBe(0);
    expect(nextTabIndex("End", 0, 5)).toBe(4);
  });
  it("ignores other keys, so typing and Tab still work", () => {
    for (const k of ["Tab", "Enter", " ", "a", "Escape", "PageDown"]) expect(nextTabIndex(k, 1, 3)).toBeNull();
  });
  it("stays put with one tab and does nothing with none", () => {
    expect(nextTabIndex("ArrowRight", 0, 1)).toBe(0);
    expect(nextTabIndex("ArrowRight", 0, 0)).toBeNull();
  });
});
