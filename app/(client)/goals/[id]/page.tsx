import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { format, parseISO } from "date-fns";
import { ArrowLeft } from "lucide-react";
import { ChapterView } from "@/components/goals/ChapterView";
import { GoalStrip, StripLegend } from "@/components/goals/GoalStrip";
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
    <Link href="/today" className="press mb-5 inline-flex items-center gap-1.5 text-[14px] font-medium text-ink-soft hover:text-ink">
      <ArrowLeft className="h-4 w-4" /> Today
    </Link>
  );

  if (goal.status !== "ACTIVE" && loaded.chapter) {
    return (
      <div>
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

  return (
    <div className="mx-auto max-w-2xl">
      {back}
      <p className="eyebrow">{goal.name}</p>
      <h1 className="rise mt-1 text-5xl leading-none text-ink">
        Day {view.dayOfGoal} <span className="text-2xl text-ink-mute">of {view.length}</span>
      </h1>
      <p className="mt-3 text-[14px] text-ink-mute">Started {format(parseISO(goal.startDay), "MMM d")}</p>

      <div className="mt-6">
        <GoalStrip cells={view.cells} columns={view.length > 40 ? 25 : 15} />
        <StripLegend cells={view.cells} />
      </div>
      {carried.length > 0 && (
        <p className="mt-4 text-[14px] text-ink-soft">
          {carried.length} days, {format(parseISO(carried[0].day), "MMM d")} through {format(parseISO(carried[carried.length - 1].day), "MMM d")}, happened before Atlas and count as done.
        </p>
      )}

      {result.attempts.filter((a) => a.days > 0).length > 1 && (
        <section className="mt-8">
          <h2 className="text-xl text-ink">Attempts</h2>
          <ul className="mt-2 text-[14px] text-ink-soft">
            {result.attempts
              .filter((a) => a.days > 0)
              .map((a) => (
                <li key={a.fromDay}>
                  {format(parseISO(a.fromDay), "MMM d")} · {a.days} days{a.current ? " so far" : ""}
                </li>
              ))}
          </ul>
        </section>
      )}

      <section className="mt-8">
        <h2 className="text-xl text-ink">Rules</h2>
        <RuleEditor goalId={goal.id} items={items} />
      </section>
    </div>
  );
}
