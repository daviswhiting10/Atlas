"use client";

import { startTransition, useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { chosenTab, tapTab } from "@/lib/tabs";

/** If the page hasn't switched by now, load it the plain way: a tab never stays stuck. */
const WATCHDOG_MS = 8000;

/**
 * The nav's tab taps: the tapped tab shows as chosen at once, a repeat tap while it loads is nothing, and a tap on
 * another tab is never blocked (lib/tabs.ts). The page's own path arriving ends the wait.
 */
export function useTabSwitch(pathname: string, onPage: (href: string) => boolean) {
  const router = useRouter();
  const [pending, setPending] = useState<string | null>(null);
  const pendingRef = useRef<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // The page moved: whatever was loading has landed (or been replaced).
  useEffect(() => {
    pendingRef.current = null;
    setPending(null);
    clearTimeout(timer.current);
  }, [pathname]);
  useEffect(() => () => clearTimeout(timer.current), []);

  const onClick = useCallback(
    (e: React.MouseEvent, href: string) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      e.preventDefault();
      const step = tapTab(pendingRef.current, href, onPage(href));
      pendingRef.current = step.pending;
      setPending(step.pending);
      clearTimeout(timer.current);
      if (!step.navigate) return;
      if (step.pending) timer.current = setTimeout(() => window.location.assign(href), WATCHDOG_MS);
      startTransition(() => router.push(href));
    },
    [router, onPage]
  );

  /** Does this tab look chosen? */
  const chosen = useCallback((href: string) => chosenTab(pending, href, onPage(href)), [pending, onPage]);
  return { onClick, chosen };
}
