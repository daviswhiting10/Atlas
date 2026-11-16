import Link from "next/link";
import { Plus } from "lucide-react";
import type { TodayView } from "@/lib/goals/today";
import { CountUp } from "./CountUp";
import { GoalChecklist } from "./GoalChecklist";
import { GoalManage } from "./GoalManage";
import { AccentTitle, GoalStrip } from "./GoalStrip";
import { TodayLive, type GoalActions } from "./TodayLive";

/**
 * The goal card on Today, from plain data: the whole goal in one place. The title and the day number on one
 * row, a compact strip (75 days in three rows), a checklist where every row is tappable (workouts in one
 * tap), a link to log a workout with sets, and a closed "Diet & end goal" area. It is built so the whole
 * checklist is on screen on a phone without scrolling.
 * GoalToday loads the data and passes the real saves; a preview can pass fakes.
 * The loading shape of this card is GoalCardSkeleton (Skeletons.tsx): change one, change the other.
 */
export function GoalCard({ view, actions }: { view: TodayView; actions: GoalActions }) {
  return (
    <TodayLive view={view} actions={actions}>
      <section className="dusk dusk-card sm:p-8">
        <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-1">
          <h2 className="dusk-title min-w-0 pb-1">
            <AccentTitle name={view.name} />
          </h2>
          <div className="flex items-end gap-2">
            <p className="dusk-counter" aria-label={`Day ${view.dayOfGoal} of ${view.length}`}>
              <CountUp id={view.goalId} value={view.dayOfGoal} />
            </p>
            <div className="pb-1" aria-hidden>
              <p className="dusk-eyebrow">Day</p>
              <p className="dusk-counter-of">of {view.length}</p>
            </div>
          </div>
        </div>
        {view.attemptNumber > 1 && (
          <p className="mt-2 text-[13px] text-dusk-mute">
            Attempt {view.attemptNumber}
            {view.earlierBest ? ` · earlier best ${view.earlierBest} days` : ""}
          </p>
        )}

        <div className="mt-4">
          <GoalStrip id={view.goalId} cells={view.cells} columns={view.length > 40 ? 25 : 15} compact todayIndex={view.dayOfGoal - 1} restarts={view.attemptNumber > 1 ? [0] : []} />
        </div>
        <div className="mt-4">
          <GoalChecklist />
        </div>
        <GoalManage
          goalId={view.goalId}
          manage={view.manage}
          actions={actions}
          lead={
            <Link href="/workouts/new" className="dusk-chip">
              <Plus className="h-4 w-4" /> Log with sets
            </Link>
          }
        />
      </section>
    </TodayLive>
  );
}
