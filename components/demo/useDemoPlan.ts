"use client";

import { useMemo, useSyncExternalStore } from "react";
import type { PlanOverview } from "@/lib/plan/overview";
import { demoStore } from "@/lib/demo/store";
import { planAfter } from "@/lib/demo/plan-after";

/** The sample plan with this tab's finished workouts applied (Today and Plan both read it, so they agree). */
export function useDemoPlan(plan: PlanOverview): PlanOverview {
  const key = useSyncExternalStore(demoStore.subscribeFinished, demoStore.finishedKey, () => "");
  return useMemo(() => planAfter(plan, new Set(key ? key.split(",") : [])), [plan, key]);
}
