import Link from "next/link";
import { ArrowRight, Plus } from "lucide-react";
import { activeGoalId, loadGoal } from "@/lib/goals/data";
import { todayView } from "@/lib/goals/today";
import { GoalChecklist } from "./GoalChecklist";
import { AccentTitle, GoalStrip } from "./GoalStrip";

/** The goal card on Today, or a quiet link to start one. */
export async function GoalToday({ clientId, canStart }: { clientId: string; canStart: boolean }) {
  const id = await activeGoalId(clientId);
  const loaded = id ? await loadGoal(id, clientId) : null;
  // A goal that finished while nobody was looking has just been closed: point at its chapter.
  if (!loaded || loaded.goal.status !== "ACTIVE") {
    return (
      <div className="flex flex-wrap items-center gap-x-5 gap-y-1">
        {loaded && (
          <Link href={`/goals/${loaded.goal.id}`} className="press inline-flex items-center gap-1 text-[14px] font-semibold text-ink">
            {loaded.goal.name} is finished · see the chapter <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        )}
        {canStart && (
          <Link href="/goals/new" className="press inline-flex items-center gap-1.5 text-[14px] font-medium text-ink-soft hover:text-ink">
            <Plus className="h-4 w-4" /> Start a goal
          </Link>
        )}
      </div>
    );
  }

  const view = todayView(loaded);
  return (
    <section className="dusk dusk-card rise rise-1 sm:p-8">
      <div className="flex items-start justify-between gap-4">
        <h2 className="dusk-title pt-1.5">
          <AccentTitle name={view.name} />
        </h2>
        <Link href={`/goals/${view.goalId}`} className="dusk-chip shrink-0">
          Details <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>

      <div className="mt-6 flex items-end gap-3">
        <p className="dusk-counter" aria-label={`Day ${view.dayOfGoal} of ${view.length}`}>
          {view.dayOfGoal}
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
        <GoalStrip cells={view.cells} columns={view.length > 40 ? 25 : 15} todayIndex={view.dayOfGoal - 1} restarts={view.attemptNumber > 1 ? [0] : []} />
      </div>
      <div className="mt-6">
        <GoalChecklist view={view} />
      </div>
    </section>
  );
}
