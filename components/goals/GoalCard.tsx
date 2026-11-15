import type { TodayView } from "@/lib/goals/today";
import { CountUp } from "./CountUp";
import { GoalChecklist } from "./GoalChecklist";
import { GoalManage } from "./GoalManage";
import { AccentTitle, GoalStrip } from "./GoalStrip";
import { TodayLive, type GoalActions } from "./TodayLive";

/**
 * The goal card on Today, from plain data: the whole goal in one place. Title, day number,
 * the strip, a checklist where every row is tappable, and a closed "Rules & end goal" area.
 * GoalToday loads the data and passes the real saves; a preview can pass fakes.
 * The loading shape of this card is GoalCardSkeleton (Skeletons.tsx): change one, change the other.
 */
export function GoalCard({ view, actions }: { view: TodayView; actions: GoalActions }) {
  return (
    <TodayLive view={view} actions={actions}>
      <section className="dusk dusk-card sm:p-8">
        <h2 className="dusk-title pt-1.5">
          <AccentTitle name={view.name} />
        </h2>

        <div className="mt-6 flex items-end gap-3">
          <p className="dusk-counter" aria-label={`Day ${view.dayOfGoal} of ${view.length}`}>
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
        <GoalManage goalId={view.goalId} manage={view.manage} actions={actions} />
      </section>
    </TodayLive>
  );
}
