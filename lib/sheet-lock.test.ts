import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

describe("a bottom sheet locks the page and stays docked", () => {
  const hook = read("hooks/use-sheet-lock.ts");
  it("pins the body while open and puts the scroll back on close", () => {
    expect(hook).toContain('body.style.position = "fixed"');
    expect(hook).toContain("window.scrollTo(0, y)");
  });
  it("follows the visual viewport so the sheet stays on top of the keyboard", () => {
    expect(hook).toContain("window.visualViewport");
    expect(hook).toContain("vv.offsetTop");
  });
  it("hides the bottom navigation while open (both navs, and the CSS rule)", () => {
    expect(read("app/globals.css")).toContain("body[data-sheet-open] [data-bottom-nav]");
    expect(read("components/athlete/AppNav.tsx")).toContain("data-bottom-nav");
    expect(read("components/coach/CoachNav.tsx")).toContain("data-bottom-nav");
  });
  it("the exercise picker uses it, and its list scrolls on its own", () => {
    const p = read("components/exercises/ExercisePicker.tsx");
    expect(p).toContain("useSheetLock()");
    expect(p).toContain("overflow-y-auto overscroll-contain");
    expect(p).toContain("min-h-0 flex-1");
  });
});
