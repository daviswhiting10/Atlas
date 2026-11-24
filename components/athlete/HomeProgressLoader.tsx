import type { Athlete } from "@/lib/athlete/data";
import { getHistory, getProgress } from "@/lib/athlete/data";
import { HomeProgressView } from "@/components/athlete/HomeProgress";

/** For real athletes: loads what Progress loads, streamed in behind the greeting and the workout card. (Server only.) */
export async function HomeProgress({ athlete }: { athlete: Pick<Athlete, "metric"> }) {
  const [data, calendar] = await Promise.all([getProgress(), getHistory()]);
  return <HomeProgressView athlete={athlete} data={data} calendar={calendar} />;
}
