import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { cookies } from "next/headers";
import { TZ_COOKIE, getAthlete, getPlanOverview } from "@/lib/athlete/data";
import { localDay, safeTimeZone } from "@/lib/athlete/sessions";
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
import { PlanWeek } from "@/components/athlete/PlanWeek";
import { deleteMySession, reassignMySession, sessionSummary } from "@/lib/actions/athlete";
import { WeekNotesList } from "@/components/plan/WeekNoteCard";
import { upNextView } from "@/lib/plan/up-next";

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

/**
 * The Plan tab (option B): up next first, with its exercises and Start, then the rest of the week,
 * "All N weeks". Edit plan and Change goals sit in the header's ⋯ (HeaderActions). The newest progress report is a row under the plan; the older ones are on All weeks.
 * ?view=all shows every week; ?view=edit the same with editing (not for a coached athlete).
 */
export default async function PlanPage({ searchParams }: { searchParams?: { view?: string } }) {
  // Finished blocks with a report, newest first: a row each, under the plan. Loaded alongside the plan.
  const timeZone = safeTimeZone(cookies().get(TZ_COOKIE)?.value);
  const [athlete, plan, reports] = await Promise.all([
    getAthlete(),
    getPlanOverview(),
    getAthlete().then((a) => listReports(a.clientId, a.workspaceId, timeZone)),
  ]);
  const rowsOf = (list: typeof reports, top = "mt-10") =>
    list.length > 0 && (
      <div className={`${top} max-w-3xl space-y-2`}>
        {list.map((r) => (
          <ReportLink key={`${r.assignmentId}-${r.block}`} entry={r} />
        ))}
      </div>
    );
  // With no plan, every report. On the Plan tab only the newest (one more thing to tap otherwise); the older ones are on All weeks.
  const reportRows = rowsOf(reports);
  const newestReport = rowsOf(reports.slice(0, 1));

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

  const locked = isCoached(athlete);
  const view = searchParams?.view === "all" ? "all" : searchParams?.view === "edit" && !locked ? "edit" : null;

  if (view) {
    return (
      <div>
        <Link href="/plan" className="press -ml-2 mb-3 inline-flex min-h-11 items-center gap-1.5 px-2 text-[15px] font-medium text-ink-soft">
          <ArrowLeft className="h-4 w-4" /> Plan
        </Link>
        <h1 className="rise mb-6 text-[28px] leading-[1.1] text-ink">{view === "edit" ? "Edit plan" : `All ${plan.totalWeeks} weeks`}</h1>
        <div className="max-w-3xl">
          <PlanView plan={plan} actions={ACTIONS} workoutBase="/workouts" locked={view === "all" || locked} />
        </div>
        {view === "all" && rowsOf(reports.slice(1))}
      </div>
    );
  }

  const upNext = upNextView(plan);
  return (
    <div>
      <div className="rise mb-5">
        <p className="eyebrow">{upNext.eyebrow}</p>
        <h1 className="mt-1.5 text-[30px] leading-[1.1] text-ink sm:text-[38px]">{plan.name}</h1>
      </div>
      <PlanWeek plan={plan} today={localDay(new Date(), safeTimeZone(cookies().get(TZ_COOKIE)?.value))} totalWeeks={plan.totalWeeks} summary={sessionSummary} deleteSession={deleteMySession} reassign={reassignMySession} />
      {plan.weekNotes.length > 0 && (
        <div className="mt-6 max-w-3xl">
          <WeekNotesList notes={plan.weekNotes} currentWeek={plan.currentWeek} />
        </div>
      )}
      {newestReport}
    </div>
  );
}
