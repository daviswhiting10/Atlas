import Link from "next/link";
import { ArrowRight, Plus } from "lucide-react";
import { activeGoalId, loadGoal } from "@/lib/goals/data";
import { todayView } from "@/lib/goals/today";
import { GoalChecklist } from "./GoalChecklist";
import { GoalStrip } from "./GoalStrip";

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
    <section className="surface rise rise-1 p-5 sm:p-7">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="eyebrow">{view.name}</p>
          <h2 className="mt-1 text-4xl leading-none text-ink">
            Day {view.dayOfGoal} <span className="text-xl text-ink-mute">of {view.length}</span>
          </h2>
          {view.attemptNumber > 1 && (
            <p className="mt-2 text-[13px] text-ink-mute">
              Attempt {view.attemptNumber}
              {view.earlierBest ? ` · earlier best ${view.earlierBest} days` : ""}
            </p>
          )}
        </div>
        <Link href={`/goals/${view.goalId}`} className="press inline-flex shrink-0 items-center gap-1 text-[13px] font-semibold text-ink hover:text-ink-soft">
          Details <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>
      <div className="mt-5">
        <GoalStrip cells={view.cells} columns={view.length > 40 ? 25 : 15} />
      </div>
      <div className="mt-5">
        <GoalChecklist view={view} />
      </div>
    </section>
  );
}
