import Link from "next/link";
import { Suspense } from "react";
import { ArrowRight } from "lucide-react";
import { activeGoalId, loadGoal } from "@/lib/goals/data";
import { todayView } from "@/lib/goals/today";
import { endGoal, logWorkout, removeWorkout, setDiet, tagSession, tickRule } from "@/lib/actions/goals";
import { GoalCard } from "./GoalCard";
import { GoalCardSkeleton } from "./Skeletons";
import { StartLink } from "./StartLink";

/**
 * The goal card on Today, or a quiet link to start one.
 *
 * Finding out whether there is a goal is one light query, so it comes first with no
 * placeholder (someone with no goal never sees one). Loading the goal itself is the
 * slow part, and that is what the skeleton stands in for.
 */
export async function GoalToday({ clientId, canStart }: { clientId: string; canStart: boolean }) {
  const id = await activeGoalId(clientId);
  if (!id) return <StartLink canStart={canStart} />;
  return (
    <Suspense fallback={<GoalCardSkeleton />}>
      <LoadedGoal id={id} clientId={clientId} canStart={canStart} />
    </Suspense>
  );
}

async function LoadedGoal({ id, clientId, canStart }: { id: string; clientId: string; canStart: boolean }) {
  const loaded = await loadGoal(id, clientId);
  // A goal that finished while nobody was looking has just been closed: point at its chapter.
  if (!loaded || loaded.goal.status !== "ACTIVE") {
    return (
      <div className="space-y-2">
        {loaded && (
          <Link href={`/goals/${loaded.goal.id}`} className="press inline-flex items-center gap-1 text-[14px] font-semibold text-ink">
            {loaded.goal.name} is finished · see the chapter <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        )}
        <StartLink canStart={canStart} />
      </div>
    );
  }
  return <GoalCard view={todayView(loaded)} actions={{ tickRule, tagSession, logWorkout, removeWorkout, setDiet, endGoal }} />;
}
