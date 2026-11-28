import type { Metadata } from "next";
import { getAthlete, getHistory, getProgress } from "@/lib/athlete/data";
import { changeMySessionDate, deleteMySession, reassignMySession, reassignSlots, historyDaySessions } from "@/lib/actions/athlete";
import { ProgressScreen } from "@/components/athlete/ProgressScreen";
import { endedGoals } from "@/lib/goals/data";
import { cookies } from "next/headers";
import { TZ_COOKIE } from "@/lib/athlete/data";
import { safeTimeZone } from "@/lib/athlete/sessions";
import { loadBodyWeights } from "@/lib/athlete/body-weight-data";

export const metadata: Metadata = { title: "Progress" };

export default async function ProgressPage() {
  // Both need only the athlete's id, so once it is known they load together.
  const athlete = await getAthlete();
  const timeZone = safeTimeZone(cookies().get(TZ_COOKIE)?.value);
  const [data, calendar, chapters, bodyWeight] = await Promise.all([getProgress(), getHistory(), endedGoals(athlete.clientId), loadBodyWeights(athlete.clientId, athlete.workspaceId, timeZone)]);
  return <ProgressScreen athlete={athlete} data={data} calendar={calendar} chapters={chapters} bodyWeight={bodyWeight} deleteSession={deleteMySession} changeDate={changeMySessionDate} reassign={reassignMySession} loadWeeks={reassignSlots} loadDay={historyDaySessions} />;
}
