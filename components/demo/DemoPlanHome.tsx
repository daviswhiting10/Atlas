"use client";

import { PlanWeek } from "@/components/athlete/PlanWeek";
import { WeekNotesList } from "@/components/plan/WeekNoteCard";
import { DEMO_PLAN, DEMO_TODAY } from "@/lib/demo/sample";
import { upNextView } from "@/lib/plan/up-next";
import { useDemoPlan } from "./useDemoPlan";

/** The sample athlete's Plan first screen; finishing a workout moves Up next on, in this tab only. */
export function DemoPlanHome() {
  const plan = useDemoPlan(DEMO_PLAN);
  const upNext = upNextView(plan);
  return (
    <div>
      <div className="rise mb-5">
        <p className="eyebrow">{upNext.eyebrow}</p>
        <h1 className="mt-1.5 text-[30px] leading-[1.1] text-ink sm:text-[38px]">{plan.name}</h1>
      </div>
      <PlanWeek plan={plan} today={DEMO_TODAY} totalWeeks={plan.totalWeeks} base="/demo" />
      <div className="mt-6 max-w-3xl">
        <WeekNotesList notes={plan.weekNotes} currentWeek={plan.currentWeek} />
      </div>
    </div>
  );
}
