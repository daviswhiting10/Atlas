import type { Metadata } from "next";
import { Suspense } from "react";
import { getAthlete, getPlanOverview } from "@/lib/athlete/data";
import { TodayScreen } from "@/components/athlete/TodayScreen";
import { GoalToday } from "@/components/goals/GoalToday";
import { TodayReport } from "@/components/report/TodayReport";
import { preloadTodayGoal } from "@/lib/goals/today-data";
import { nutritionEnabled } from "@/lib/nutrition/flag";
import { TodayNutrition } from "@/components/nutrition/TodayNutrition";

export const metadata: Metadata = { title: "Today" };

export default async function TodayPage() {
  // Today no longer reads the athlete's whole set history: progress and totals live on their own screens.
  // The running goal starts loading as soon as the athlete is known, alongside the plan.
  const planP = getPlanOverview();
  const athlete = await getAthlete();
  preloadTodayGoal(athlete.clientId);
  const plan = await planP;
  return (
    <TodayScreen athlete={athlete} plan={plan} nutrition={nutritionEnabled() ? <Suspense fallback={null}><TodayNutrition clientId={athlete.clientId} /></Suspense> : undefined} goal={<GoalToday clientId={athlete.clientId} />}
      report={
        <Suspense fallback={null}>
          <TodayReport clientId={athlete.clientId} workspaceId={athlete.workspaceId} />
        </Suspense>
      }
    />
  );
}
