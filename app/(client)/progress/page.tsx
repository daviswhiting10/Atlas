import type { Metadata } from "next";
import { format, parseISO } from "date-fns";
import { getAthlete, getProgress } from "@/lib/athlete/data";
import { GOALS } from "@/lib/plan/generator";
import { METRICS } from "@/lib/plan/overload";
import { ProgressView } from "@/components/athlete/ProgressView";

export const metadata: Metadata = { title: "Progress" };

export default async function ProgressPage() {
  const [athlete, data] = await Promise.all([getAthlete(), getProgress()]);
  const goal = GOALS[athlete.prefs.goal];
  const { sessions, prs, since } = data.totals;

  // Say what is actually on the page, not what the page could show.
  const intro =
    sessions === 0 || !since
      ? `Nothing logged yet. Your goal is to ${goal.label.toLowerCase()}, so once you start, charts will lead with ${METRICS[athlete.metric].label.toLowerCase()}.`
      : `${sessions} workout${sessions === 1 ? "" : "s"} and ${prs} record${prs === 1 ? "" : "s"} since ${format(parseISO(since), "MMM d")}. Your goal is to ${goal.label.toLowerCase()}, so charts open on ${METRICS[athlete.metric].label.toLowerCase()}.`;

  return (
    <div>
      <div className="rise mb-8">
        <h1 className="text-4xl leading-none text-ink">Progress</h1>
        <p className="mt-3 max-w-2xl text-[15px] leading-relaxed text-ink-soft">{intro}</p>
      </div>
      <ProgressView data={data} goalMetric={athlete.metric} />
    </div>
  );
}
