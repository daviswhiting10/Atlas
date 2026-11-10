import type { Metadata } from "next";
import { getAthlete, getProgress } from "@/lib/athlete/data";
import { GOALS } from "@/lib/plan/generator";
import { ProgressView } from "@/components/athlete/ProgressView";

export const metadata: Metadata = { title: "Progress" };

export default async function ProgressPage() {
  const [athlete, data] = await Promise.all([getAthlete(), getProgress()]);
  const goal = GOALS[athlete.prefs.goal];

  return (
    <div>
      <div className="rise mb-7">
        <p className="eyebrow">Goal · {goal.label}</p>
        <h1 className="mt-1.5 font-display text-[38px] leading-[1.05] text-ink sm:text-5xl">Progress</h1>
        <p className="mt-2 max-w-xl text-[15px] leading-relaxed text-ink-soft">{goal.metricWhy}</p>
      </div>
      <ProgressView data={data} goalMetric={athlete.metric} goalLabel={goal.label} metricWhy={goal.metricWhy} />
    </div>
  );
}
