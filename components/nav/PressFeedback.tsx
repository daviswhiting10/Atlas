"use client";

import { useEffect } from "react";

/** What looks pressed: anything built with the `press` class, tabs, and nav and header links and buttons. */
const PRESSABLE = ".press, [role='tab'], nav a, nav button, header a, header button, summary";

/**
 * A touch looks pressed the moment it lands, before the tap is even finished and before any server work.
 *
 * Safari on an iPhone only paints `:active` when a touch handler exists, and the app switches off the browser's own
 * tap highlight, so a tap that waits on a slow page had no feedback at all and looked ignored. This marks the touched
 * element with `data-pressed` (set directly on the page, not through React: it is on screen in the next frame), and
 * the styles in globals.css draw it. Cleared when the finger lifts, the touch is cancelled (a scroll), or after 1.5 s.
 */
export function PressFeedback() {
  useEffect(() => {
    let current: HTMLElement | null = null;
    let failsafe: ReturnType<typeof setTimeout> | undefined;
    const clear = () => {
      clearTimeout(failsafe);
      current?.removeAttribute("data-pressed");
      current = null;
    };
    const down = (e: PointerEvent) => {
      if (e.pointerType === "mouse" && e.button !== 0) return;
      const el = (e.target as Element | null)?.closest?.(PRESSABLE) as HTMLElement | null;
      clear();
      if (!el || (el as HTMLButtonElement).disabled || el.getAttribute("aria-disabled") === "true") return;
      current = el;
      el.setAttribute("data-pressed", "true");
      failsafe = setTimeout(clear, 1500);
    };
    document.addEventListener("pointerdown", down, true);
    document.addEventListener("pointerup", clear, true);
    document.addEventListener("pointercancel", clear, true);
    document.addEventListener("dragstart", clear, true);
    window.addEventListener("pagehide", clear);
    return () => {
      document.removeEventListener("pointerdown", down, true);
      document.removeEventListener("pointerup", clear, true);
      document.removeEventListener("pointercancel", clear, true);
      document.removeEventListener("dragstart", clear, true);
      window.removeEventListener("pagehide", clear);
      clear();
    };
  }, []);
  return null;
}
