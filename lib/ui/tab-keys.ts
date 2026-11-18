/**
 * Arrow-key support for tab-style pickers (the WAI-ARIA tabs pattern, automatic activation):
 * Left/Right (and Up/Down) move to the next or previous tab and wrap, Home and End jump to the
 * ends. The tab that takes focus is the one that gets selected, so a picker needs only its own
 * `select` and `role="tab"` buttons inside the `role="tablist"` element.
 */

import type { KeyboardEvent } from "react";

/** The tab to move to for a key, or null when the key isn't one of ours. */
export function nextTabIndex(key: string, index: number, count: number): number | null {
  if (count <= 0) return null;
  switch (key) {
    case "ArrowRight":
    case "ArrowDown":
      return (index + 1) % count;
    case "ArrowLeft":
    case "ArrowUp":
      return (index - 1 + count) % count;
    case "Home":
      return 0;
    case "End":
      return count - 1;
    default:
      return null;
  }
}

/** `onKeyDown` for the tablist: moves focus to the next tab and selects it. */
export function onTablistKeyDown(e: KeyboardEvent<HTMLElement>, select: (index: number) => void): void {
  const tabs = Array.from(e.currentTarget.querySelectorAll<HTMLElement>('[role="tab"]'));
  const current = tabs.indexOf(e.target as HTMLElement);
  if (current < 0) return;
  const next = nextTabIndex(e.key, current, tabs.length);
  if (next == null) return;
  e.preventDefault();
  select(next);
  tabs[next].focus();
}
