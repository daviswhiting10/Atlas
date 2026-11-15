import Link from "next/link";
import { format, parseISO } from "date-fns";
import { ArrowLeft } from "lucide-react";
import type { TodayView } from "@/lib/goals/today";
import { CountUp } from "./CountUp";
import { AccentTitle, GoalStrip, StripLegend } from "./GoalStrip";
import { PrefetchRoutes } from "./PrefetchRoutes";
import { ViewTransitionArrived } from "./ViewTransitionLink";

/**
 * The top of a running goal's page: back link, title, day number, chips and the strip.
 * Its loading shape is GoalPageSkeleton (Skeletons.tsx): change one, change the other.
 */
export function GoalHero({ view, startDay }: { view: TodayView; startDay: string }) {
  return (
    <>
      <ViewTransitionArrived settled />
      <PrefetchRoutes hrefs={["/today"]} />
      <Link href="/today" className="dusk-chip is-quiet -ml-2 mb-4">
        <ArrowLeft className="h-4 w-4" /> Today
      </Link>
      <h1 className="dusk-title is-hero vt-goal-title">
        <AccentTitle name={view.name} />
      </h1>

      <div className="mt-8 flex items-end gap-3">
        <p className="dusk-counter vt-goal-counter" aria-label={`Day ${view.dayOfGoal} of ${view.length}`}>
          <CountUp id={view.goalId} value={view.dayOfGoal} />
        </p>
        <div className="pb-1" aria-hidden>
          <p className="dusk-eyebrow">Day</p>
          <p className="dusk-counter-of">of {view.length}</p>
        </div>
      </div>
      <div className="mt-5 flex flex-wrap gap-2">
        <span className="dusk-chip pointer-events-none">Started {format(parseISO(startDay), "MMM d")}</span>
        {view.attemptNumber > 1 && <span className="dusk-chip pointer-events-none">Attempt {view.attemptNumber}</span>}
      </div>

      <div className="mt-8">
        <GoalStrip id={view.goalId} cells={view.cells} columns={view.length > 40 ? 25 : 15} todayIndex={view.dayOfGoal - 1} restarts={view.attemptNumber > 1 ? [0] : []} />
        <StripLegend cells={view.cells} today restarted={view.attemptNumber > 1} />
      </div>
    </>
  );
}
