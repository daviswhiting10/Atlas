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

import { readdirSync, statSync } from "node:fs";

describe("every modal sheet in the app locks the page", () => {
  const walk = (dir: string): string[] =>
    readdirSync(new URL(`../${dir}`, import.meta.url)).flatMap((n) => {
      const rel = `${dir}/${n}`;
      return statSync(new URL(`../${rel}`, import.meta.url)).isDirectory() ? walk(rel) : rel.endsWith(".tsx") ? [rel] : [];
    });
  // Files with their own sheets drawn as a fixed full-window overlay (not the base-ui Dialog, which locks scroll itself,
  // and not the mode-switch shell or the "building" status overlay, which are not sheets).
  const sheets = [...walk("components"), ...walk("app")].filter((f) => {
    if (/components\/ui\/dialog\.tsx|ModeSwitchProvider/.test(f)) return false;
    const src = read(f);
    return /role="dialog"/.test(src) && /fixed (inset-0|z-50)/.test(src);
  });
  it("finds the sheets (so this test can't pass by finding none)", () => {
    expect(sheets.length).toBeGreaterThanOrEqual(12);
  });
  it.each(sheets)("%s", (f) => {
    expect(read(f)).toMatch(/useSheetLock\(|<SheetLock \/>/);
  });
});
