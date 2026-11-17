"use client";

import { useRef } from "react";

/** How long a press has to last to count as a long-press. */
export const LONG_PRESS_MS = 500;

/**
 * Tap does one thing, press-and-hold another (a row's tap logs it; holding it
 * marks it outdoors). Spread the returned handlers onto the element. The click
 * that follows a long-press is swallowed, so the tap action doesn't also run.
 * The phone's own long-press menu is turned off for the element (add
 * `select-none [-webkit-touch-callout:none]` to its classes too).
 */
export function useLongPress(onLongPress: () => void, onTap?: () => void) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fired = useRef(false);

  const cancel = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };

  return {
    onPointerDown: (e: React.PointerEvent) => {
      if (e.button !== 0) return;
      fired.current = false;
      cancel();
      timer.current = setTimeout(() => {
        fired.current = true;
        timer.current = null;
        if (typeof navigator !== "undefined" && "vibrate" in navigator) navigator.vibrate?.(15);
        onLongPress();
      }, LONG_PRESS_MS);
    },
    onPointerUp: cancel,
    onPointerLeave: cancel,
    onPointerCancel: cancel,
    // A long-press on a phone opens the system menu; this is the long-press here.
    onContextMenu: (e: React.MouseEvent) => e.preventDefault(),
    onClick: (e: React.MouseEvent) => {
      if (fired.current) {
        fired.current = false;
        e.preventDefault();
        return;
      }
      onTap?.();
    },
  };
}
