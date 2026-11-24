"use client";

import { useSheetLock } from "@/hooks/use-sheet-lock";

/** Drop this inside a sheet that is drawn inline (not its own component): while it is mounted the page is pinned and the bottom nav steps aside. */
export function SheetLock() {
  useSheetLock();
  return null;
}
