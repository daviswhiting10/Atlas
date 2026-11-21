import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, SlidersHorizontal } from "lucide-react";
import { cookies } from "next/headers";
import { TZ_COOKIE, getAthlete, getPlanOverview } from "@/lib/athlete/data";
import { safeTimeZone } from "@/lib/athlete/sessions";
import { listReports } from "@/lib/report/load";
import { ReportLink } from "@/components/report/ReportLink";
import {
  planAddExercise,
  planAddWorkout,
  planRemoveExercise,
  planRemoveWorkout,
  planSetNote,
  planSetTargets,
  planSetWorkoutNote,
  planSwapExercise,
  setWorkoutSkipped,
} from "@/lib/actions/athlete";
import { isCoached } from "@/lib/athlete/coached";
import { RefreshWhileEmpty } from "@/components/athlete/RefreshWhileEmpty";
import { PlanView, type PlanActions } from "@/components/athlete/PlanView";

export const metadata: Metadata = { title: "Plan" };

/** The athlete's own edits. The coach's editor passes the same shape, scoped to a client. */
const ACTIONS: PlanActions = {
  addWorkout: planAddWorkout,
  removeWorkout: planRemoveWorkout,
  addExercise: planAddExercise,
  removeExercise: planRemoveExercise,
  swapExercise: planSwapExercise,
  setTargets: planSetTargets,
  setWorkoutNote: planSetWorkoutNote,
  setPlanNote: planSetNote,
  setSkipped: setWorkoutSkipped,
};

export default async function PlanPage() {
  // Finished blocks with a report, newest first: a row each, under the plan. Loaded alongside the plan.
  const timeZone = safeTimeZone(cookies().get(TZ_COOKIE)?.value);
  const [athlete, plan, reports] = await Promise.all([
    getAthlete(),
    getPlanOverview(),
    getAthlete().then((a) => listReports(a.clientId, a.workspaceId, timeZone)),
  ]);
  const reportRows = reports.length > 0 && (
    <div className="mt-10 max-w-3xl space-y-2">
      {reports.map((r) => (
        <ReportLink key={`${r.assignmentId}-${r.block}`} entry={r} />
      ))}
    </div>
  );

  if (!plan) {
    return (
      <div className="surface rise p-8">
        <h1 className="text-3xl text-ink">No plan yet</h1>
        {isCoached(athlete) && <RefreshWhileEmpty />}
        {athlete.selfServe ? (
          <>
            <p className="mt-2 max-w-sm text-[15px] text-ink-soft">Tell Atlas your goal and it lays out your next 12 weeks.</p>
            <Link href="/you?goals=1" className="press mt-6 inline-flex h-12 items-center gap-2 rounded-xl bg-dusk-button px-6 text-[15px] font-semibold text-dusk-button-text hover:bg-dusk-button/85">
              Build my plan <ArrowRight className="h-4 w-4" />
            </Link>
          </>
        ) : (
          <p className="mt-2 max-w-sm text-[15px] text-ink-soft">Your coach hasn&apos;t assigned a program yet. It will show up here as soon as they do.</p>
        )}
        {reportRows}
      </div>
    );
  }

  return (
    <div>
      <div className="rise mb-7 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <p className="eyebrow">Your plan · {plan.totalWeeks} weeks</p>
          <h1 className="mt-1.5 text-[34px] leading-[1.08] text-ink sm:text-[42px]">{plan.name}</h1>
          {plan.goalText && <p className="mt-2 max-w-2xl text-[15px] leading-relaxed text-ink-soft">“{plan.goalText}”</p>}
        </div>
        {athlete.selfServe && (
          <Link href="/you?goals=1" className="press flex h-11 shrink-0 items-center gap-2 self-start rounded-xl border border-line bg-paper px-4 text-sm font-semibold text-ink hover:border-ink/20 sm:self-auto">
            <SlidersHorizontal className="h-4 w-4" /> Change goals
          </Link>
        )}
      </div>

      <div className="max-w-3xl">
        <PlanView plan={plan} actions={ACTIONS} workoutBase="/workouts" locked={isCoached(athlete)} />
      </div>
      {reportRows}
    </div>
  );
}
