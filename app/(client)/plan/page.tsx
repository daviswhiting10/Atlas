import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, SlidersHorizontal } from "lucide-react";
import { getAthlete, getPlanOverview } from "@/lib/athlete/data";
import { EQUIPMENT, EXPERIENCE, GOALS, resolvePrefs } from "@/lib/plan/generator";
import { CONDITIONS } from "@/lib/plan/goal";
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
  const [athlete, plan] = await Promise.all([getAthlete(), getPlanOverview()]);

  if (!plan) {
    return (
      <div className="surface rise p-8">
        <h1 className="text-3xl text-ink">No plan yet</h1>
        {athlete.selfServe ? (
          <>
            <p className="mt-2 max-w-sm text-[15px] text-ink-soft">Tell Atlas your goal and it lays out your next 12 weeks.</p>
            <Link href="/you?goals=1" className="press mt-6 inline-flex h-12 items-center gap-2 rounded-xl bg-ink px-6 text-[15px] font-semibold text-white hover:bg-ink/85">
              Build my plan <ArrowRight className="h-4 w-4" />
            </Link>
          </>
        ) : (
          <p className="mt-2 max-w-sm text-[15px] text-ink-soft">Your coach hasn&apos;t assigned a program yet. It will show up here as soon as they do.</p>
        )}
      </div>
    );
  }

  const prefs = plan.prefs ? resolvePrefs(plan.prefs) : null;
  const chips = prefs
    ? [
        GOALS[prefs.goal].label,
        `${prefs.daysPerWeek} day${prefs.daysPerWeek === 1 ? "" : "s"} a week`,
        `${prefs.minutes} min`,
        EQUIPMENT[prefs.equipment].label,
        EXPERIENCE[prefs.experience].label,
        ...prefs.conditions.map((c) => CONDITIONS[c].label),
      ]
    : [];

  return (
    <div>
      <div className="rise mb-7 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <p className="eyebrow">Your plan · {plan.totalWeeks} weeks</p>
          <h1 className="mt-1.5 text-[34px] leading-[1.08] text-ink sm:text-[42px]">{plan.name}</h1>
          {plan.goalText && <p className="mt-2 max-w-2xl text-[15px] leading-relaxed text-ink-soft">“{plan.goalText}”</p>}
          {chips.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {chips.map((c) => (
                <span key={c} className="rounded-full border border-line bg-white px-3 py-1 text-[13px] font-medium text-ink-soft">
                  {c}
                </span>
              ))}
            </div>
          )}
        </div>
        {athlete.selfServe && (
          <Link href="/you?goals=1" className="press flex h-11 shrink-0 items-center gap-2 self-start rounded-xl border border-line bg-white px-4 text-sm font-semibold text-ink hover:border-ink/20 sm:self-auto">
            <SlidersHorizontal className="h-4 w-4" /> Change goals
          </Link>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px] lg:gap-10">
        <PlanView plan={plan} actions={ACTIONS} workoutBase="/workouts" />

        {plan.rationale.length > 0 && (
          <aside className="rise rise-3 h-fit lg:sticky lg:top-24">
            <p className="eyebrow">Why this plan</p>
            <ul className="rule mt-3 divide-y divide-line">
              {plan.rationale.map((r, i) => (
                <li key={i} className="flex gap-3 py-3 text-[14px] leading-relaxed text-ink-soft">
                  <span className="mt-0.5 font-mono text-xs text-ink-mute">{String(i + 1).padStart(2, "0")}</span>
                  <span>{r}</span>
                </li>
              ))}
            </ul>
          </aside>
        )}
      </div>
    </div>
  );
}
