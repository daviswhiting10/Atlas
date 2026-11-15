import { ArrowRight } from "lucide-react";
import type { TodayView } from "@/lib/goals/today";
import { CountUp } from "./CountUp";
import { GoalChecklist } from "./GoalChecklist";
import { AccentTitle, GoalStrip } from "./GoalStrip";
import { PrefetchRoutes } from "./PrefetchRoutes";
import { TodayLive, type GoalActions } from "./TodayLive";
import { ViewTransitionLink } from "./ViewTransitionLink";

/**
 * The goal card on Today, from plain data. GoalToday loads the data and passes the
 * real saves; a preview can pass fakes. The loading shape of this card is
 * GoalCardSkeleton (Skeletons.tsx): change one, change the other.
 */
export function GoalCard({ view, actions, detailsHref }: { view: TodayView; actions: GoalActions; detailsHref?: string }) {
  const href = detailsHref ?? `/goals/${view.goalId}`;
  return (
    <TodayLive view={view} actions={actions}>
      <section className="dusk dusk-card sm:p-8">
        <PrefetchRoutes hrefs={[href, "/workouts/new"]} />
        <div className="flex items-start justify-between gap-4">
          <h2 className="dusk-title vt-goal-title pt-1.5">
            <AccentTitle name={view.name} />
          </h2>
          <ViewTransitionLink href={href} carry={{ name: view.name, day: view.dayOfGoal, length: view.length }} className="dusk-chip shrink-0">
            Details <ArrowRight className="h-3.5 w-3.5" />
          </ViewTransitionLink>
        </div>

        <div className="mt-6 flex items-end gap-3">
          <p className="dusk-counter vt-goal-counter" aria-label={`Day ${view.dayOfGoal} of ${view.length}`}>
            <CountUp id={view.goalId} value={view.dayOfGoal} />
          </p>
          <div className="pb-1" aria-hidden>
            <p className="dusk-eyebrow">Day</p>
            <p className="dusk-counter-of">of {view.length}</p>
          </div>
        </div>
        {view.attemptNumber > 1 && (
          <p className="mt-3 text-[13px] text-dusk-mute">
            Attempt {view.attemptNumber}
            {view.earlierBest ? ` · earlier best ${view.earlierBest} days` : ""}
          </p>
        )}

        <div className="mt-6">
          <GoalStrip id={view.goalId} cells={view.cells} columns={view.length > 40 ? 25 : 15} todayIndex={view.dayOfGoal - 1} restarts={view.attemptNumber > 1 ? [0] : []} />
        </div>
        <div className="mt-6">
          <GoalChecklist />
        </div>
      </section>
    </TodayLive>
  );
}
