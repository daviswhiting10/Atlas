"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * While a coached client waits for her plan, ask the server again every so often (and once when she comes back
 * to the app), so the plan appears by itself: the Home Screen app has no pull-to-refresh. Renders nothing.
 */
export function RefreshWhileEmpty({ everyMs = 20_000 }: { everyMs?: number }) {
  const router = useRouter();
  useEffect(() => {
    const ask = () => {
      if (document.visibilityState === "visible" && navigator.onLine) router.refresh();
    };
    const t = setInterval(ask, everyMs);
    document.addEventListener("visibilitychange", ask);
    window.addEventListener("online", ask);
    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", ask);
      window.removeEventListener("online", ask);
    };
  }, [router, everyMs]);
  return null;
}
