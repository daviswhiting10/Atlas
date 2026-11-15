import type { Metadata } from "next";
import { getAthlete, getPlanOverview } from "@/lib/athlete/data";
import { TodayScreen } from "@/components/athlete/TodayScreen";
import { GoalToday } from "@/components/goals/GoalToday";

export const metadata: Metadata = { title: "Today" };

export default async function TodayPage() {
  // Today no longer reads the athlete's whole set history: progress and totals live on their own screens.
  const [athlete, plan] = await Promise.all([getAthlete(), getPlanOverview()]);
  return <TodayScreen athlete={athlete} plan={plan} goal={<GoalToday clientId={athlete.clientId} canStart={!athlete.isGuest} />} />;
}
