import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { StartScreen } from "@/components/goals/StartScreen";
import { TZ_COOKIE, getAthlete } from "@/lib/athlete/data";
import { localDay, safeTimeZone } from "@/lib/athlete/sessions";
import { activeGoalId } from "@/lib/goals/data";

export const metadata: Metadata = { title: "Start a goal" };

export default async function NewGoalPage() {
  const athlete = await getAthlete();
  if (athlete.isGuest) redirect("/today");
  if (await activeGoalId(athlete.clientId)) redirect("/today");

  const today = localDay(new Date(), safeTimeZone(cookies().get(TZ_COOKIE)?.value));
  return <StartScreen today={today} />;
}
