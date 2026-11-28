import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getAthlete } from "@/lib/athlete/data";
import { loadPlanSummary } from "@/lib/plan/summary";
import { Suspense } from "react";
import { GoalsAndChallenges } from "@/components/challenges/GoalsAndChallenges";
import { YouScreen } from "@/components/athlete/YouScreen";
import { activeGoalId } from "@/lib/goals/data";
import { isCoached } from "@/lib/athlete/coached";
import { nutritionEnabled } from "@/lib/nutrition/flag";

export const metadata: Metadata = { title: "You" };

export default async function YouPage({ searchParams }: { searchParams: { goals?: string } }) {
  // Changing goals is making a new plan, now on the Plan tab: an old link here lands there.
  if (searchParams.goals === "1") redirect("/plan/new");
  const athlete = await getAthlete();
  const [plan, goalId] = await Promise.all([
    // Only the plan's name, goal, week and counts: not every exercise of every workout.
    loadPlanSummary({ clientId: athlete.clientId, workspaceId: athlete.workspaceId, fallbackPrefs: athlete.selfServe ? athlete.prefs : null }),
    // Starting a goal lives here (Today shows the goal's card once one is running).
    athlete.isGuest || isCoached(athlete) ? null : activeGoalId(athlete.clientId),
  ]);
  const canStart = !athlete.isGuest && !isCoached(athlete) && !goalId;
  return (
    <YouScreen
      athlete={athlete}
      plan={plan}
      nutrition={nutritionEnabled()}
      challenges={athlete.isGuest && !athlete.isDemo ? undefined : <Suspense fallback={null}><GoalsAndChallenges clientId={athlete.clientId} canStart={canStart} /></Suspense>}
    />
  );
}
