import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { format, parseISO } from "date-fns";
import { ArrowLeft } from "lucide-react";
import { ChapterView } from "@/components/goals/ChapterView";
import { AccentTitle, GoalStrip, StripLegend } from "@/components/goals/GoalStrip";
import { RuleEditor } from "@/components/goals/RuleEditor";
import { getAthlete } from "@/lib/athlete/data";
import { localDay } from "@/lib/athlete/sessions";
import { addDays } from "@/lib/goals/days";
import { loadGoal } from "@/lib/goals/data";
import { ruleActiveOn } from "@/lib/goals/rules";
import { todayView } from "@/lib/goals/today";

export const metadata: Metadata = { title: "Goal" };

export default async function GoalPage({ params }: { params: { id: string } }) {
  const athlete = await getAthlete();
  const loaded = await loadGoal(params.id, athlete.clientId);
  if (!loaded) notFound();
  const { goal, result } = loaded;

  const back = (
    <Link href="/today" className="dusk-chip is-quiet -ml-2 mb-4">
      <ArrowLeft className="h-4 w-4" /> Today
    </Link>
  );

  if (goal.status !== "ACTIVE" && loaded.chapter) {
    return (
      <div className="dusk dusk-page">
        <div className="dusk-backdrop" aria-hidden />
        {back}
        <ChapterView goalId={goal.id} chapter={loaded.chapter} sealed={loaded.sealed} sealsAt={loaded.sealsAt} sessions={loaded.sessions} />
      </div>
    );
  }

  const view = todayView(loaded);
  const today = localDay(new Date(), goal.timeZone);
  const real = result.periods.filter((p) => !p.carried);
  const items = goal.rules.rules
    .filter((r) => !r.toDay || r.toDay >= today)
    .map((r) => {
      // Days before today only: today is still in progress.
      const judged = real.filter((p) => p.day < today && r.key in p.rules && p.rules[r.key] !== "open" && p.rules[r.key] !== "needs_duration");
      const met = judged.filter((p) => p.rules[r.key] === "met").length;
      const from = r.fromDay && r.fromDay > goal.startDay ? `counted from ${format(parseISO(r.fromDay), "MMM d")}` : null;
      const until = r.toDay ? `stops after ${format(parseISO(r.toDay), "MMM d")}` : null;
      return { key: r.key, label: r.label, detail: [judged.length > 0 ? `${met} of ${judged.length} ${judged.length === 1 ? "day" : "days"} since Atlas` : "checked from today", from, until].filter(Boolean).join(" · "), removable: !r.toDay && ruleActiveOn(r, addDays(today, 1)) };
    });
  const carried = result.periods.filter((p) => p.carried);

  const attempts = result.attempts.filter((a) => a.days > 0);

  return (
    <div className="dusk dusk-page mx-auto max-w-2xl">
      <div className="dusk-backdrop" aria-hidden />
      {back}
      <h1 className="dusk-title is-hero rise">
        <AccentTitle name={goal.name} />
      </h1>

      <div className="mt-8 flex items-end gap-3">
        <p className="dusk-counter" aria-label={`Day ${view.dayOfGoal} of ${view.length}`}>
          {view.dayOfGoal}
        </p>
        <div className="pb-1" aria-hidden>
          <p className="dusk-eyebrow">Day</p>
          <p className="dusk-counter-of">of {view.length}</p>
        </div>
      </div>
      <div className="mt-5 flex flex-wrap gap-2">
        <span className="dusk-chip pointer-events-none">Started {format(parseISO(goal.startDay), "MMM d")}</span>
        {view.attemptNumber > 1 && <span className="dusk-chip pointer-events-none">Attempt {view.attemptNumber}</span>}
      </div>

      <div className="mt-8">
        <GoalStrip cells={view.cells} columns={view.length > 40 ? 25 : 15} todayIndex={view.dayOfGoal - 1} restarts={view.attemptNumber > 1 ? [0] : []} />
        <StripLegend cells={view.cells} today restarted={view.attemptNumber > 1} />
      </div>
      {carried.length > 0 && (
        <p className="mt-5 text-[14px] leading-relaxed text-dusk-soft">
          {carried.length} days, {format(parseISO(carried[0].day), "MMM d")} through {format(parseISO(carried[carried.length - 1].day), "MMM d")}, happened before Atlas and count as done.
        </p>
      )}

      {attempts.length > 1 && (
        <section className="mt-12">
          <h2 className="dusk-heading">Attempts</h2>
          <ul className="mt-3 divide-y divide-dusk-line text-[14px] text-dusk-soft">
            {attempts.map((a) => (
              <li key={a.fromDay} className="flex items-center justify-between py-3">
                <span>{format(parseISO(a.fromDay), "MMM d")}</span>
                <span className="tabular-nums text-dusk-text">
                  {a.days} days{a.current ? " so far" : ""}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="mt-12">
        <h2 className="dusk-heading">Rules</h2>
        <RuleEditor goalId={goal.id} items={items} />
      </section>
    </div>
  );
}
