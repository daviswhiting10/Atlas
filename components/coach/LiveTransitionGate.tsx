"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { liveRouteArrived } from "@/lib/live-transition";

/** Tells lib/live-transition that the route changed (it lives in the layout, so it is there on both sides of the change). */
export function LiveTransitionGate() {
  const pathname = usePathname();
  useEffect(() => {
    liveRouteArrived();
  }, [pathname]);
  return null;
}
