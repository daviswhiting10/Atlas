"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { rebuildPlan } from "@/lib/actions/athlete";
import { PENDING_PLAN_KEY } from "./account";
import { BuildingOverlay } from "./guest";

/** Answers older than this are stale: build nothing, let them start over. */
const MAX_AGE_MS = 60 * 60 * 1000;

/**
 * After a Google sign-up from the plan wizard: build the plan from the
 * answers the athlete gave before signing in, then show it. Renders nothing
 * when there's nothing waiting.
 */
export function PendingPlan() {
  const router = useRouter();
  const [building, setBuilding] = useState(false);
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    let pending: { prefs?: unknown; at?: number } | null = null;
    try {
      pending = JSON.parse(localStorage.getItem(PENDING_PLAN_KEY) ?? "null");
      localStorage.removeItem(PENDING_PLAN_KEY);
    } catch {}
    if (!pending?.prefs || !pending.at || Date.now() - pending.at > MAX_AGE_MS) return;
    setBuilding(true);
    rebuildPlan(pending.prefs)
      .then(() => router.refresh())
      .catch(() => setBuilding(false));
  }, [router]);

  return <BuildingOverlay mode={building ? "plan" : null} />;
}
