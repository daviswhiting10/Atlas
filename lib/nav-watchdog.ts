/**
 * A client navigation that can't stay stuck. After a deploy (or on a bad connection) Next gives up on the in-app
 * navigation, starts a plain page load and holds the old screen until that load lands; if it never does, every tap is
 * dead. So: start the in-app navigation, and if the address still hasn't changed by `ms`, load the page the plain way.
 *
 * Used by the bottom tabs (components/nav/useTabSwitch) and the logger's Back to Today.
 */

export const WATCHDOG_MS = 8000;

/** Navigate with `push`; returns a cancel for the watchdog (a newer tap replaces it). */
export function pushOrLoad(push: (href: string) => void, href: string, ms = WATCHDOG_MS): () => void {
  const from = window.location.href;
  const timer = setTimeout(() => {
    if (window.location.href === from) window.location.assign(href);
  }, ms);
  push(href);
  return () => clearTimeout(timer);
}
