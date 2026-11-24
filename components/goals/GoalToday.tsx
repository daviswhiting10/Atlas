import Link from "next/link";
import { Suspense } from "react";
import { ArrowRight } from "lucide-react";
import { format, parseISO } from "date-fns";
import { failedOn, latestFailedGoal } from "@/lib/goals/data";
import { todayGoal, todayGoalId } from "@/lib/goals/today-data";
import { todayView } from "@/lib/goals/today";
import { GoalChip } from "./GoalChip";

/**
 * The challenge chip on Home while a goal is running; after a missed day failed one, "Challenge failed on <date>.
 * Start again?" (until another starts, or it is deleted); nothing otherwise (starting a goal lives on You; the full card is on its own page).
 *
 * Finding out whether there is a goal is one light query, so it comes first with no
 * placeholder (someone with no goal never sees one). Loading the goal itself is the
 * slow part, and that is what the skeleton stands in for.
 */
export async function GoalToday({ clientId }: { clientId: string }) {
  const id = await todayGoalId(clientId);
  if (!id) {
    const failed = await latestFailedGoal(clientId);
    return failed ? <FailedLink id={failed.id} day={failed.failedOn} /> : null;
  }
  return (
    <Suspense fallback={null}>
      <LoadedGoal id={id} clientId={clientId} />
    </Suspense>
  );
}

async function LoadedGoal({ id, clientId }: { id: string; clientId: string }) {
  const loaded = await todayGoal(id, clientId);
  // A goal that finished while nobody was looking has just been closed: point at its chapter.
  if (!loaded || loaded.goal.status !== "ACTIVE") {
    const failed = loaded ? failedOn(loaded.goal) : null;
    if (loaded && failed) return <FailedLink id={loaded.goal.id} day={failed} />;
    return loaded ? (
      <Link href={`/goals/${loaded.goal.id}`} className="press inline-flex min-h-11 items-center gap-1 text-[15px] font-semibold text-ink">
        {loaded.goal.name} is finished · see the chapter <ArrowRight className="h-3.5 w-3.5" />
      </Link>
    ) : null;
  }
  return <GoalChip view={todayView(loaded)} />;
}

/** A missed day failed the challenge: one line, to its page (Start again is there). */
function FailedLink({ id, day }: { id: string; day: string }) {
  return (
    <Link href={`/challenges/${id}`} className="press inline-flex min-h-11 items-center gap-1 text-[15px] font-semibold text-ink">
      Challenge failed on {format(parseISO(day), "MMM d")}. Start again? <ArrowRight className="h-3.5 w-3.5" />
    </Link>
  );
}
