import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

/** Every tab and nav item answers a touch at once, switches on the first tap, and can't be held up by another. */
describe("tab taps", () => {
  const css = read("app/globals.css");
  const layout = read("app/layout.tsx");
  const press = read("components/nav/PressFeedback.tsx");

  it("something marks a touched element as pressed from the first touch", () => {
    expect(layout).toContain("<PressFeedback />");
    expect(press).toContain('"pointerdown"');
    expect(press).toContain('setAttribute("data-pressed", "true")');
  });
  it("what counts as pressable includes tabs, nav and header items, and the press class", () => {
    for (const sel of [".press", "[role='tab']", "nav a", "nav button", "header a"]) expect(press).toContain(sel);
  });
  it("the pressed look is drawn for those, without a transition on the way in", () => {
    expect(css).toMatch(/\.press\[data-pressed="true"\][^}]*transition: none/);
    expect(css).toMatch(/\[role="tab"\]\[data-pressed="true"\]/);
    expect(css).toMatch(/nav a\[data-pressed="true"\]/);
  });
  it("both navs choose a tab at once and ignore repeat taps, via the one hook", () => {
    for (const f of ["components/athlete/AppNav.tsx", "components/coach/CoachNav.tsx"]) {
      const src = read(f);
      expect(src).toContain("useTabSwitch");
      expect(src).toContain("onClick={(e) => onClick(e, href)}");
      expect(src).toContain("chosen(href)");
    }
  });
  it("the coach's bottom tabs are prefetched like the athlete's", () => {
    expect(read("components/coach/CoachNav.tsx")).toMatch(/prefetch\n\s+onClick=\{\(e\) => onClick\(e, href\)\}/);
  });
  it("every link to a home page asks for the same full prefetch (the first, lighter ask would otherwise win)", () => {
    const toggle = read("components/ModeToggle.tsx");
    expect(toggle).toMatch(/href=\{HOME\[other\]\}\n\s+prefetch/);
  });
});

describe("header chrome (chrome-cleanup)", () => {
  it("no Atlas logo link in either app header, and Coach | Me is one link", () => {
    for (const f of ["components/athlete/AppNav.tsx", "components/coach/CoachNav.tsx"]) expect(read(f)).not.toContain("Atlas home");
    const toggle = read("components/ModeToggle.tsx");
    expect((toggle.match(/<Link\b/g) ?? []).length).toBe(1);
  });
  it("the coach's header tabs on a desktop are fetched ahead in full, like the bottom tabs", () => {
    const src = read("components/coach/CoachNav.tsx");
    expect(src).toMatch(/key=\{href\}\n\s+href=\{href\}\n(\s+\/\/[^\n]*\n)*\s+prefetch\n\s+onClick=\{\(e\) => onClick\(e, href\)\}/);
  });
});
