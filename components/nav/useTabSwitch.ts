"use client";

import { startTransition, useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { chosenTab, tapTab } from "@/lib/tabs";
import { pushOrLoad } from "@/lib/nav-watchdog";

/**
 * The nav's tab taps: the tapped tab shows as chosen at once, a repeat tap while it loads is nothing, and a tap on
 * another tab is never blocked (lib/tabs.ts). The page's own path arriving ends the wait.
 */
export function useTabSwitch(pathname: string, onPage: (href: string) => boolean) {
  const router = useRouter();
  const [pending, setPending] = useState<string | null>(null);
  const pendingRef = useRef<string | null>(null);
  // The pending tab's watchdog: if its page hasn't arrived in 8 s, it loads the plain way (lib/nav-watchdog).
  const cancel = useRef<() => void>(() => {});

  // The page moved: whatever was loading has landed (or been replaced).
  useEffect(() => {
    pendingRef.current = null;
    setPending(null);
    cancel.current();
  }, [pathname]);
  useEffect(() => () => cancel.current(), []);

  const onClick = useCallback(
    (e: React.MouseEvent, href: string) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      e.preventDefault();
      const step = tapTab(pendingRef.current, href, onPage(href));
      pendingRef.current = step.pending;
      setPending(step.pending);
      cancel.current();
      if (!step.navigate) return;
      const push = (h: string) => startTransition(() => router.push(h));
      if (step.pending) cancel.current = pushOrLoad(push, href);
      else push(href);
    },
    [router, onPage]
  );

  /** Does this tab look chosen? */
  const chosen = useCallback((href: string) => chosenTab(pending, href, onPage(href)), [pending, onPage]);
  return { onClick, chosen };
}
