import type { Metadata } from "next";
import { format, parseISO } from "date-fns";
import { getAthlete, getProgress } from "@/lib/athlete/data";
import { GOALS } from "@/lib/plan/generator";
import { ProgressView } from "@/components/athlete/ProgressView";
import Link from "next/link";
import { endedGoals } from "@/lib/goals/data";

export const metadata: Metadata = { title: "Progress" };

export default async function ProgressPage() {
  const [athlete, data] = await Promise.all([getAthlete(), getProgress()]);
  const chapters = await endedGoals(athlete.clientId);
  const goal = GOALS[athlete.prefs.goal];
  const { sessions, prs, since } = data.totals;

  // Say what is actually on the page, not what the page could show.
  const intro =
    sessions === 0 || !since
      ? `Nothing logged yet. Your goal is to ${goal.label.toLowerCase()}; your progress shows here once you start.`
      : `${sessions} workout${sessions === 1 ? "" : "s"} and ${prs} record${prs === 1 ? "" : "s"} since ${format(parseISO(since), "MMM d")}.`;

  return (
    <div>
      <div className="rise mb-8">
        <h1 className="text-4xl leading-none text-ink">Progress</h1>
        <p className="mt-3 max-w-2xl text-[15px] leading-relaxed text-ink-soft">{intro}</p>
      </div>
      <ProgressView data={data} goalMetric={athlete.metric} />
      {chapters.length > 0 && (
        <section className="mt-12">
          <h2 className="text-xl text-ink">Chapters</h2>
          <ul className="mt-2 divide-y divide-line">
            {chapters.map((c) => (
              <li key={c.id}>
                <Link href={`/goals/${c.id}`} className="press flex items-baseline justify-between gap-3 py-3 hover:text-ink-soft">
                  <span className="text-[15px] font-semibold text-ink">{c.name}</span>
                  <span className="text-[13px] text-ink-mute">
                    {format(parseISO(c.startDay), "MMM d")}
                    {c.endedAt ? ` – ${format(c.endedAt, "MMM d, yyyy")}` : ""}
                    {c.chapter ? "" : " · draft"}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
