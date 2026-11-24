"use client";

import { useEffect, useState } from "react";

/**
 * For a bottom sheet while it is open:
 * - the page behind does not scroll (the body is pinned where it was and put back on close), so a flick in the list
 *   scrolls the list, not the page;
 * - the bottom navigation is hidden (`body[data-sheet-open]`, see globals.css), so it can't show through the dimmed page or
 *   jump up above the keyboard;
 * - the sheet follows what is actually visible (the visual viewport): on a phone, when the keyboard opens the sheet's
 *   bottom stays docked on top of it instead of floating mid-page. Returns where the overlay should sit (null: use the
 *   whole window, as before the keyboard or where there is no visual viewport).
 */
export function useSheetLock(open = true): { top: number; height: number } | null {
  const [box, setBox] = useState<{ top: number; height: number } | null>(null);

  useEffect(() => {
    if (!open) return;
    const body = document.body;
    const y = window.scrollY;
    const prev = { position: body.style.position, top: body.style.top, width: body.style.width, overflow: body.style.overflow };
    body.style.position = "fixed";
    body.style.top = `-${y}px`;
    body.style.width = "100%";
    body.style.overflow = "hidden";
    body.dataset.sheetOpen = "1";
    return () => {
      body.style.position = prev.position;
      body.style.top = prev.top;
      body.style.width = prev.width;
      body.style.overflow = prev.overflow;
      delete body.dataset.sheetOpen;
      window.scrollTo(0, y);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const vv = window.visualViewport;
    if (!vv) return;
    const sync = () => setBox(vv.height < window.innerHeight - 1 || vv.offsetTop > 0 ? { top: vv.offsetTop, height: vv.height } : null);
    sync();
    vv.addEventListener("resize", sync);
    vv.addEventListener("scroll", sync);
    return () => {
      vv.removeEventListener("resize", sync);
      vv.removeEventListener("scroll", sync);
      setBox(null);
    };
  }, [open]);

  return box;
}
