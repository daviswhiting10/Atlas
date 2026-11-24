"use client";

import { TodayScreen } from "@/components/athlete/TodayScreen";
import { DEMO_ATHLETE, DEMO_PLAN } from "@/lib/demo/sample";
import { useDemoPlan } from "./useDemoPlan";

/** Today for the sample athlete: finishing a workout moves Up next on, in this tab only. */
export function DemoToday() {
  const plan = useDemoPlan(DEMO_PLAN);
  return (
    <TodayScreen
      athlete={DEMO_ATHLETE}
      plan={plan}
      goal={null}
      base="/demo"
    />
  );
}
