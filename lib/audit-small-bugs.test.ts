import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";

const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe("closing a sheet opened from a menu leaves the page scrollable", () => {
  it("doesn't copy Base UI's overflow-x/-y lock back onto the body", async () => {
    const style = { position: "", top: "", width: "", overflow: "", overflowX: "", overflowY: "" };
    const body = { style, dataset: {} as Record<string, string> };
    vi.stubGlobal("document", { body });
    vi.stubGlobal("window", { scrollY: 120, scrollTo: vi.fn() });
    const { lockPage } = await import("@/hooks/use-sheet-lock");

    // A Base UI menu is open (its iOS lock: body overflow-x/-y hidden, inline). Its item opens a sheet.
    style.overflowX = "hidden";
    style.overflowY = "hidden";
    const unlock = lockPage();
    expect(body.dataset.sheetOpen).toBe("1");
    expect(style.position).toBe("fixed");
    // The menu closes and Base UI puts back what it found.
    style.overflowX = "";
    style.overflowY = "";
    // The sheet closes.
    unlock();
    expect(style).toMatchObject({ position: "", top: "", width: "", overflow: "", overflowX: "", overflowY: "" });
    expect(body.dataset.sheetOpen).toBeUndefined();
    expect(read("app/globals.css")).toMatch(/body\[data-sheet-open\] \{\s*overflow: hidden;/);
  });
});

describe("a save that fails offline adds one 'online' listener, however often it's tried", () => {
  it("the same callback is waited on once", async () => {
    const add = vi.fn();
    vi.stubGlobal("window", { addEventListener: add });
    vi.stubGlobal("navigator", { onLine: false });
    const { guardActions } = await import("@/lib/net/guard");
    const refresh = () => {};
    const offline = async () => {
      throw new TypeError("Failed to fetch");
    };
    // Each render of PlanView guards the actions again, with the same router.refresh.
    for (let i = 0; i < 3; i++) await guardActions({ save: offline }, refresh).save();
    expect(add).toHaveBeenCalledTimes(1);
  });
  it("PlanView and AssignPanel pass router.refresh itself, not a new arrow", () => {
    expect(read("components/athlete/PlanView.tsx")).toContain("guardActions(rest, router.refresh)");
    expect(read("components/coach/AssignPanel.tsx")).not.toContain("() => router.refresh())");
  });
});

describe("two quick live-bar taps don't leave a view transition hanging", () => {
  it("the first transition's update resolves when the second starts", async () => {
    const updates: Promise<void>[] = [];
    vi.stubGlobal("window", { matchMedia: () => ({ matches: false }) });
    vi.stubGlobal("sessionStorage", { setItem: () => {}, getItem: () => null });
    vi.stubGlobal("document", {
      documentElement: { dataset: {} },
      startViewTransition: (cb: () => Promise<void>) => {
        updates.push(cb());
        return { finished: new Promise(() => {}) };
      },
    });
    vi.useFakeTimers();
    try {
      const { liveTransitionTo, liveRouteArrived } = await import("@/lib/live-transition");
      const router = { push: vi.fn() };
      const bar = { getBoundingClientRect: () => ({ x: 0, y: 0, width: 1, height: 1 }) } as unknown as HTMLElement;
      liveTransitionTo(router, "/clients/a/log", bar);
      liveTransitionTo(router, "/clients/a/log", bar);
      const settled = [false, false];
      updates.forEach((p, i) => void p.then(() => (settled[i] = true)));
      await Promise.resolve();
      await Promise.resolve();
      expect(settled[0]).toBe(true); // before any timeout
      liveRouteArrived();
      await Promise.resolve();
      await Promise.resolve();
      expect(settled[1]).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });
});
