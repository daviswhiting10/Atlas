/**
 * After a deploy, a page from the old build can ask for a script file the server no longer has (no skew protection on
 * Hobby). The page then draws but never comes alive, or a sheet never opens. The cure is one reload: it fetches the new
 * build's page and scripts.
 *
 * `installSkewHeal` runs as an inline script in the root layout's <head>, before any of the app's own scripts, so it
 * still works when those are the ones that fail to load. It is written to be self-contained (no imports, no outside
 * names) because it is sent as its own source text. It reloads at most once per 30 s per tab (a sessionStorage stamp),
 * never while offline, and not at all where sessionStorage can't be used, so it can never loop.
 *
 * Error screens call `window.__atlasHeal(error)` (see `healChunkError`) for the errors React catches first.
 */

type HealWindow = Window & { __atlasHeal?: (e: unknown) => boolean };

export function installSkewHeal(w: HealWindow): void {
  const KEY = "atlas.heal-at";
  const GAP_MS = 30000;
  const CHUNK = /ChunkLoadError|Loading (CSS )?chunk \S+ failed|Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module/i;

  const isChunk = (e: unknown): boolean => {
    if (!e) return false;
    const x = e as { name?: unknown; message?: unknown };
    if (x.name === "ChunkLoadError") return true;
    return CHUNK.test(typeof x.message === "string" ? x.message : String(e));
  };

  const heal = (e: unknown): boolean => {
    if (!isChunk(e)) return false;
    if (w.navigator && w.navigator.onLine === false) return false; // a reload offline would leave nothing on screen
    try {
      const now = Date.now();
      const last = Number(w.sessionStorage.getItem(KEY)) || 0;
      if (Math.abs(now - last) < GAP_MS) return false;
      w.sessionStorage.setItem(KEY, String(now));
    } catch {
      return false; // no stamp, no guard: don't reload at all
    }
    w.location.reload();
    return true;
  };

  w.__atlasHeal = heal;
  // A script or stylesheet of ours that failed to load (these errors don't bubble; capture sees them), or a thrown error.
  w.addEventListener(
    "error",
    (ev) => {
      const t = ev.target as { tagName?: string; src?: string; href?: string } | null;
      if (t && (t.tagName === "SCRIPT" || t.tagName === "LINK")) {
        if ((t.src || t.href || "").indexOf("/_next/static/") !== -1) heal({ name: "ChunkLoadError" });
        return;
      }
      const ee = ev as ErrorEvent;
      heal(ee.error || ee.message);
    },
    true
  );
  w.addEventListener("unhandledrejection", (ev) => {
    heal((ev as PromiseRejectionEvent).reason);
  });
}

/** The inline <script> body for the root layout. */
export const SKEW_HEAL_SCRIPT = `(${installSkewHeal.toString()})(window);`;

/** From an error screen: a missing-chunk error reloads (once, guarded); anything else is left to the screen. */
export function healChunkError(error: unknown): boolean {
  if (typeof window === "undefined") return false;
  const w = window as HealWindow;
  return w.__atlasHeal ? w.__atlasHeal(error) : false;
}
