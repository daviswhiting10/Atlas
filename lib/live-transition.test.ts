import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

describe("the live-session bar grows into the logger", () => {
  const lib = read("lib/live-transition.ts");
  it("uses View Transitions where there are some, a 230 ms FLIP where there are not", () => {
    expect(lib).toContain("startViewTransition");
    expect(lib).toContain("const MS = 230");
    expect(lib).toContain("el.animate(");
  });
  it("reduced motion is a plain navigation, in both directions", () => {
    expect(lib).toContain("if (reduced()) return router.push(href);");
    expect(read("app/globals.css")).toMatch(/prefers-reduced-motion: reduce\)[\s\S]*view-transition-group/);
  });
  it("never waits on a frame while the page is held (the transition would hang)", () => {
    expect(lib).not.toContain("requestAnimationFrame(() => requestAnimationFrame");
    expect(lib).toContain("    done();\n    return;");
  });
  it("the bar and both logger roots share the name only while it runs", () => {
    const css = read("app/globals.css");
    expect(css).toContain("html[data-live-vt] [data-live-bar]");
    expect(css).toContain("html[data-live-vt] [data-live-root]");
    expect(read("components/coach/LiveSessionBar.tsx")).toContain("liveTransitionTo(router, live.href, bar.current)");
    expect((read("app/(dashboard)/clients/[id]/log/WorkoutLogger.tsx").match(/data-live-root/g) ?? []).length).toBe(2);
  });
  it("the logger route has an instant shell and the bar prefetches it", () => {
    expect(read("app/(dashboard)/clients/[id]/log/loading.tsx")).toContain("data-live-root");
    expect(read("components/coach/LiveSessionBar.tsx")).toContain("router.prefetch(href)");
  });
  it("leaving the logger shrinks it back (both back links)", () => {
    const l = read("app/(dashboard)/clients/[id]/log/WorkoutLogger.tsx");
    expect((l.match(/onClick=\{leaveToClient\}/g) ?? []).length).toBe(2);
  });
});
