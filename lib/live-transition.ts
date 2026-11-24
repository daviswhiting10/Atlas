"use client";

/**
 * The live-session bar and the logger as one thing that grows and shrinks: tapping the bar makes it expand into the logger
 * (position and size interpolate), and leaving the logger collapses it back into the bar, like a mini-player.
 *
 * With the View Transitions API (document.startViewTransition) the bar and the logger's root share one view-transition-name
 * while the change runs (the `data-live-vt` attribute switches the CSS on; see app/globals.css), so the browser morphs one
 * into the other. Without it, a short FLIP (about 230 ms, ease-out) does the same on the logger's root. With reduced
 * motion, there is no animation: a plain navigation.
 */

const MS = 230;
const EASE = "cubic-bezier(0.2, 0.8, 0.2, 1)";
const KEY = "atlas.live-bar-rect";

type Router = { push: (href: string) => void };
let pending: (() => void) | null = null;
let enterFrom: DOMRect | null = null;

const reduced = () => typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
type VT = { finished: Promise<unknown> };
const startVT = (cb: () => Promise<void>): VT | null => {
  const d = document as unknown as { startViewTransition?: (cb: () => Promise<void>) => VT };
  return typeof d.startViewTransition === "function" ? d.startViewTransition(cb) : null;
};

/** The logger's root that is on screen (the phone and the desktop layouts each have one; one is hidden). */
function visibleRoot(): HTMLElement | null {
  const all = Array.from(document.querySelectorAll<HTMLElement>("[data-live-root]"));
  return all.find((e) => e.getClientRects().length > 0) ?? null;
}

function remember(r: DOMRect) {
  try {
    sessionStorage.setItem(KEY, JSON.stringify({ x: r.x, y: r.y, width: r.width, height: r.height }));
  } catch {
    /* private mode: the collapse just has no target */
  }
}
function recall(): DOMRect | null {
  try {
    const v = JSON.parse(sessionStorage.getItem(KEY) ?? "null") as { x: number; y: number; width: number; height: number } | null;
    return v ? new DOMRect(v.x, v.y, v.width, v.height) : null;
  } catch {
    return null;
  }
}

/** From the bar into the logger (`bar`: the bar's element), or from the logger back out to `href` (`bar` omitted). */
export function liveTransitionTo(router: Router, href: string, bar?: HTMLElement | null): void {
  if (reduced()) return router.push(href);
  const root = document.documentElement;
  const entering = bar != null;
  if (entering) {
    const r = bar.getBoundingClientRect();
    enterFrom = r;
    remember(r);
  }
  const vt = startVT(
    () =>
      new Promise<void>((resolve) => {
        // A second tap before the first route arrived: let the first transition finish rather than hang on it.
        pending?.();
        pending = resolve;
        router.push(href);
        // Never hold the page: if the route does not arrive, let the transition go.
        setTimeout(() => {
          if (pending === resolve) {
            pending = null;
            resolve();
          }
        }, 1500);
      })
  );
  if (vt) {
    root.dataset.liveVt = "1";
    void vt.finished.finally(() => {
      delete root.dataset.liveVt;
      enterFrom = null;
    });
    return;
  }
  // No View Transitions: a short FLIP.
  if (entering) return router.push(href); // the gate animates the logger in when it arrives
  const el = visibleRoot();
  const to = recall();
  if (!el || !to) return router.push(href);
  const from = el.getBoundingClientRect();
  const a = el.animate(
    [
      { transform: "none", opacity: 1, borderRadius: "0px" },
      { transform: `translate(${to.x - from.x}px, ${to.y - from.y}px) scale(${to.width / from.width}, ${Math.max(to.height / from.height, 0.02)})`, opacity: 0.4, borderRadius: "16px" },
    ],
    { duration: MS - 30, easing: EASE, fill: "forwards" }
  );
  el.style.transformOrigin = "top left";
  void a.finished.then(() => router.push(href), () => router.push(href));
}

/** Called after each route change: lets a pending view transition capture the new page, or runs the FLIP in. */
export function liveRouteArrived(): void {
  if (pending) {
    const done = pending;
    pending = null;
    // The new route's DOM is committed (this runs in an effect). Not a frame callback: while a view transition waits for
    // its update, the page does not render, so requestAnimationFrame would never fire.
    done();
    return;
  }
  if (enterFrom && !document.documentElement.dataset.liveVt) {
    const from = enterFrom;
    enterFrom = null;
    const el = visibleRoot();
    if (!el || reduced()) return;
    const to = el.getBoundingClientRect();
    el.style.transformOrigin = "top left";
    el.animate(
      [
        { transform: `translate(${from.x - to.x}px, ${from.y - to.y}px) scale(${from.width / to.width}, ${Math.max(from.height / to.height, 0.02)})`, opacity: 0.4, borderRadius: "16px" },
        { transform: "none", opacity: 1, borderRadius: "0px" },
      ],
      { duration: MS, easing: EASE }
    );
  }
}
