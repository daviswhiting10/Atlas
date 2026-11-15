"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/**
 * Warms the pages someone is likely to open next, once the screen has settled:
 * the goal page and the logger from the Today card, Today from the goal page.
 * Renders nothing. Skipped when the browser asks to save data. (In development
 * Next doesn't prefetch, so this does nothing there.)
 */
export function PrefetchRoutes({ hrefs }: { hrefs: string[] }) {
  const router = useRouter();
  const key = hrefs.join("\n");
  useEffect(() => {
    const saveData = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData;
    if (saveData) return;
    const run = () => key.split("\n").forEach((h) => router.prefetch(h));
    if ("requestIdleCallback" in window) {
      const id = window.requestIdleCallback(run, { timeout: 2000 });
      return () => window.cancelIdleCallback(id);
    }
    const t = setTimeout(run, 800);
    return () => clearTimeout(t);
  }, [key, router]);
  return null;
}
