import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { installSkewHeal, SKEW_HEAL_SCRIPT } from "@/lib/net/skew-heal";
import { pushOrLoad, WATCHDOG_MS } from "@/lib/nav-watchdog";

const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

type Listener = (ev: unknown) => void;
function fakeWindow(opts: { online?: boolean; storage?: "ok" | "throws" } = {}) {
  const listeners: Record<string, Listener[]> = {};
  const store = new Map<string, string>();
  const reload = vi.fn();
  const w = {
    navigator: { onLine: opts.online ?? true },
    sessionStorage:
      opts.storage === "throws"
        ? { getItem: () => { throw new Error("denied"); }, setItem: () => { throw new Error("denied"); } }
        : { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) },
    location: { reload },
    addEventListener: (type: string, fn: Listener) => void (listeners[type] ??= []).push(fn),
  };
  const fire = (type: string, ev: unknown) => (listeners[type] ?? []).forEach((fn) => fn(ev));
  return { w, fire, reload, listeners };
}
const scriptFailed = { target: { tagName: "SCRIPT", src: "https://x.app/_next/static/chunks/app/page-abc.js" } };
const chunkRejection = { reason: Object.assign(new Error("Loading chunk 1234 failed.\n(error: /_next/static/chunks/1234.js)"), { name: "ChunkLoadError" }) };

describe("a page left behind by a deploy reloads once, never in a loop", () => {
  beforeEach(() => vi.useFakeTimers({ now: new Date("2026-11-24T08:00:00Z") }));
  afterEach(() => vi.useRealTimers());

  it("one of our scripts failing to load reloads the page", () => {
    const { w, fire, reload } = fakeWindow();
    installSkewHeal(w as never);
    fire("error", scriptFailed);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("a second failure within 30 s (the reloaded page also broken) does nothing", () => {
    const { w, fire, reload } = fakeWindow();
    installSkewHeal(w as never);
    fire("error", scriptFailed);
    vi.advanceTimersByTime(5_000);
    // The reloaded page is a fresh install of the script on the same tab: same sessionStorage.
    installSkewHeal(w as never);
    fire("error", scriptFailed);
    fire("unhandledrejection", chunkRejection);
    expect(reload).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(26_000);
    fire("unhandledrejection", chunkRejection);
    expect(reload).toHaveBeenCalledTimes(2);
  });

  it("recognises the chunk errors browsers and webpack throw", () => {
    for (const reason of [
      chunkRejection.reason,
      new TypeError("Failed to fetch dynamically imported module: https://x.app/_next/static/chunks/9.js"),
      new TypeError("Importing a module script failed."),
      new Error("Loading CSS chunk 77 failed."),
    ]) {
      const { w, fire, reload } = fakeWindow();
      installSkewHeal(w as never);
      fire("unhandledrejection", { reason });
      expect(reload, String(reason)).toHaveBeenCalledTimes(1);
    }
  });

  it("leaves every other error alone", () => {
    const { w, fire, reload } = fakeWindow();
    installSkewHeal(w as never);
    fire("error", { target: { tagName: "IMG", src: "/_next/static/media/a.png" }, error: null, message: "" });
    fire("error", { target: { tagName: "SCRIPT", src: "https://cdn.example.com/widget.js" } });
    fire("error", { target: w, error: new TypeError("x is undefined"), message: "x is undefined" });
    fire("unhandledrejection", { reason: new TypeError("Failed to fetch") });
    fire("unhandledrejection", { reason: undefined });
    expect(reload).not.toHaveBeenCalled();
  });

  it("never reloads offline, or where it can't keep its stamp", () => {
    const off = fakeWindow({ online: false });
    installSkewHeal(off.w as never);
    off.fire("error", scriptFailed);
    expect(off.reload).not.toHaveBeenCalled();
    const locked = fakeWindow({ storage: "throws" });
    installSkewHeal(locked.w as never);
    locked.fire("error", scriptFailed);
    expect(locked.reload).not.toHaveBeenCalled();
  });

  it("error screens share the same guard (window.__atlasHeal)", () => {
    const { w, fire, reload } = fakeWindow();
    installSkewHeal(w as never);
    const heal = (w as unknown as { __atlasHeal: (e: unknown) => boolean }).__atlasHeal;
    expect(heal(new Error("Cannot read properties of null"))).toBe(false);
    expect(heal(chunkRejection.reason)).toBe(true);
    fire("error", scriptFailed);
    expect(reload).toHaveBeenCalledTimes(1);
    expect(read("app/error.tsx")).toContain("healChunkError(error)");
    expect(read("app/global-error.tsx")).toContain("healChunkError(error)");
  });

  it("the inline script is self-contained and is in the root layout's head, before the app's scripts", () => {
    const { w, fire, reload } = fakeWindow();
    new Function("window", SKEW_HEAL_SCRIPT)(w);
    fire("error", scriptFailed);
    expect(reload).toHaveBeenCalledTimes(1);
    const layout = read("app/layout.tsx");
    expect(layout).toMatch(/<head>[\s\S]*dangerouslySetInnerHTML=\{\{ __html: SKEW_HEAL_SCRIPT \}\}[\s\S]*<\/head>/);
  });
});

describe("a navigation that never lands loads the page the plain way", () => {
  let href: string;
  const assign = vi.fn();
  beforeEach(() => {
    vi.useFakeTimers();
    href = "https://x.app/demo/workout";
    assign.mockReset();
    vi.stubGlobal("window", { location: { get href() { return href; }, assign } });
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("stuck for 8 s: location.assign", () => {
    const push = vi.fn();
    pushOrLoad(push, "/demo/today");
    expect(push).toHaveBeenCalledWith("/demo/today");
    vi.advanceTimersByTime(WATCHDOG_MS - 1);
    expect(assign).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(assign).toHaveBeenCalledWith("/demo/today");
  });
  it("landed in time: nothing", () => {
    pushOrLoad(() => (href = "https://x.app/demo/today"), "/demo/today");
    vi.advanceTimersByTime(WATCHDOG_MS);
    expect(assign).not.toHaveBeenCalled();
  });
  it("cancelled (a newer tap): nothing", () => {
    const cancel = pushOrLoad(() => {}, "/demo/today");
    cancel();
    vi.advanceTimersByTime(WATCHDOG_MS);
    expect(assign).not.toHaveBeenCalled();
  });
  it("the tabs and the athlete logger's Back to Today both use it", () => {
    expect(read("components/nav/useTabSwitch.ts")).toContain("pushOrLoad(push, href)");
    expect(read("components/athlete/WorkoutLogger.tsx")).toContain('onClick={() => pushOrLoad((h) => router.push(h), `${base}/today`)} aria-label="Back to Today"');
  });
});

describe("the service worker never pulls scripts out from under a running page", () => {
  const config = read("next.config.mjs");
  it("a new worker waits for the next cold start", () => {
    expect(config).toContain("skipWaiting: false");
    expect(config).toContain("clientsClaim: true");
  });
});
