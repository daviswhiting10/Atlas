"use client";

import { TodayScreen } from "@/components/athlete/TodayScreen";
import { HomeProgressView } from "@/components/athlete/HomeProgress";
import { DEMO_ATHLETE, DEMO_CALENDAR, DEMO_PLAN, DEMO_PROGRESS } from "@/lib/demo/sample";
import { demoSessionSummary } from "@/lib/demo/summary";
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
      progress={<HomeProgressView athlete={DEMO_ATHLETE} data={DEMO_PROGRESS} calendar={DEMO_CALENDAR} summary={demoSessionSummary} base="/demo" />}
    />
  );
}
