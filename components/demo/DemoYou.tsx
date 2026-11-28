"use client";

import { YouScreen } from "@/components/athlete/YouScreen";
import { youPlan } from "@/lib/athlete/you-summary";
import { DEMO_ATHLETE, DEMO_PLAN } from "@/lib/demo/sample";
import { useDemoPlan } from "./useDemoPlan";

/** The sample athlete's You: the plan link like a real account's, counting this tab's finished workouts (the same plan Today and Plan read). */
export function DemoYou() {
  const plan = useDemoPlan(DEMO_PLAN);
  return <YouScreen athlete={DEMO_ATHLETE} base="/demo" plan={youPlan(plan)} />;
}
