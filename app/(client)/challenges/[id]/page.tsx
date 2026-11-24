import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { format, parseISO } from "date-fns";
import { GoalCard } from "@/components/goals/GoalCard";
import { ChallengeFooter } from "@/components/challenges/ChallengeFooter";
import { StartAgain } from "@/components/challenges/StartAgain";
import { TZ_COOKIE, getAthlete } from "@/lib/athlete/data";
import { isCoached } from "@/lib/athlete/coached";
import { localDay, safeTimeZone } from "@/lib/athlete/sessions";
import { activeGoalId, failedOn, loadGoal } from "@/lib/goals/data";
import { todayView } from "@/lib/goals/today";
import { DIET_KEY, templateByKey } from "@/lib/goals/templates";
import { deleteGoal, endGoal, logWorkout, removeWorkout, setDiet, startGoal, tagSession, tickRule } from "@/lib/actions/goals";

export const metadata: Metadata = { title: "Challenge" };

/**
 * One challenge: while it runs, the whole card (today's rules, its days, its diet) and the way to end it; once it has
 * ended, its dates and the chapter. A failed one (a missed day) says so and offers Start again, from today.
 * Either way it can be deleted (after a question).
 */
export default async function ChallengePage({ params }: { params: { id: string } }) {
  const athlete = await getAthlete();
  const loaded = await loadGoal(params.id, athlete.clientId);
  if (!loaded) notFound();
  const { goal } = loaded;
  const running = goal.status === "ACTIVE";
  const failed = failedOn(goal);
  // Start again: the same challenge from today, through the normal start, when another can be started.
  const canRestart = failed != null && templateByKey(goal.templateKey) != null && !athlete.isGuest && !isCoached(athlete) && !(await activeGoalId(athlete.clientId));
  const diet = goal.rules.rules.find((r) => r.key === DIET_KEY && r.kind === "check_in") as { detail?: string } | undefined;
  return (
    <div>
      <Link href={running ? "/today" : "/you"} className="press -ml-2 mb-3 inline-flex min-h-11 items-center gap-1.5 px-2 text-[15px] font-medium text-ink-soft">
        <ArrowLeft className="h-4 w-4" /> {running ? "Today" : "You"}
      </Link>
      {running ? (
        <GoalCard view={todayView(loaded)} actions={{ tickRule, tagSession, logWorkout, removeWorkout, setDiet, endGoal }} />
      ) : failed ? (
        <section className="rise">
          <h1 className="text-[30px] leading-[1.1] text-ink">Challenge failed on {format(parseISO(failed), "MMM d")}.</h1>
          {canRestart && (
            <>
              <p className="mt-2 text-[17px] text-ink-mute">Start again?</p>
              <StartAgain templateKey={goal.templateKey as string} today={localDay(new Date(), safeTimeZone(cookies().get(TZ_COOKIE)?.value))} diet={diet?.detail ?? null} start={startGoal} />
            </>
          )}
          {loaded.chapter && (
            <Link href={`/goals/${goal.id}`} className="press mt-5 flex min-h-[56px] items-center justify-between gap-3 border-y border-line text-[17px] font-semibold text-ink">
              Read the chapter <ArrowRight className="h-4 w-4 text-ink-soft" />
            </Link>
          )}
        </section>
      ) : (
        <section className="rise">
          <p className="eyebrow">{goal.status === "COMPLETED" ? "Finished" : "Ended"}</p>
          <h1 className="mt-1.5 text-[30px] leading-[1.1] text-ink">{goal.name}</h1>
          <p className="mt-2 text-[15px] text-ink-mute">
            {format(parseISO(goal.startDay), "MMM d, yyyy")}
            {goal.endedAt ? ` – ${format(goal.endedAt, "MMM d, yyyy")}` : ""}
          </p>
          {loaded.chapter && (
            <Link href={`/goals/${goal.id}`} className="press mt-5 flex min-h-[56px] items-center justify-between gap-3 border-y border-line text-[17px] font-semibold text-ink">
              Read the chapter <ArrowRight className="h-4 w-4 text-ink-soft" />
            </Link>
          )}
        </section>
      )}
      <ChallengeFooter goalId={goal.id} name={goal.name} running={running} end={endGoal} remove={deleteGoal} />
    </div>
  );
}
