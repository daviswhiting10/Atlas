import type { Metadata } from "next";
import { getAthlete, getProgress } from "@/lib/athlete/data";
import { ProgressScreen } from "@/components/athlete/ProgressScreen";
import { endedGoals } from "@/lib/goals/data";

export const metadata: Metadata = { title: "Progress" };

export default async function ProgressPage() {
  // Both need only the athlete's id, so once it is known they load together.
  const athlete = await getAthlete();
  const [data, chapters] = await Promise.all([getProgress(), endedGoals(athlete.clientId)]);
  return <ProgressScreen athlete={athlete} data={data} chapters={chapters} />;
}
