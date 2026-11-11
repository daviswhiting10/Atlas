import type { Metadata } from "next";
import Link from "next/link";
import { format, parseISO } from "date-fns";
import { ArrowRight, Check, ChevronRight, Dumbbell, SkipForward } from "lucide-react";
import { getAthlete, getPlanOverview, getProgress } from "@/lib/athlete/data";
import { BLOCK_WEEKS } from "@/lib/plan/generator";
import { METRICS, formatValue, metricFor, unitFor } from "@/lib/plan/overload";
import { Greeting } from "@/components/athlete/Greeting";
import { ProgressChart } from "@/components/athlete/ProgressChart";
import { StatRow } from "@/components/athlete/StatRow";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Today" };

export default async function TodayPage() {
  const [athlete, plan, progress] = await Promise.all([getAthlete(), getPlanOverview(), getProgress()]);

  if (!plan) {
    return (
      <div className="rise">
        <Greeting name={athlete.firstName} />
        <div className="surface mt-7 p-8">
          <h2 className="text-2xl text-ink">No plan yet</h2>
          {athlete.selfServe ? (
            <>
              <p className="mt-2 max-w-sm text-[15px] text-ink-soft">Tell Atlas your goal and it will lay out your next 12 weeks.</p>
              <Link href="/you?goals=1" className="press mt-6 inline-flex h-12 items-center gap-2 rounded-xl bg-ink px-6 text-[15px] font-semibold text-white hover:bg-ink/85">
                Build my plan <ArrowRight className="h-4 w-4" />
              </Link>
            </>
          ) : (
            <p className="mt-2 max-w-sm text-[15px] text-ink-soft">Your coach hasn&apos;t assigned a program yet. It will show up here as soon as they do.</p>
          )}
        </div>
      </div>
    );
  }

  const next = plan.nextUp;
  const week = plan.workouts.filter((w) => w.week === plan.currentWeek);
  const weekDone = week.filter((w) => w.status === "LOGGED").length;
  const weekLeft = week.filter((w) => w.status === "PLANNED").length;
  const block = plan.blocks[Math.min(Math.floor((plan.currentWeek - 1) / BLOCK_WEEKS), plan.blocks.length - 1)];
  const lighterWeek = plan.lighterWeeks && next != null && next.week % BLOCK_WEEKS === 0;

  // Lead with the lift coming up first today, if it has history; otherwise the biggest lift.
  const focus =
    progress.exercises.find((e) => next?.exercises[0]?.name === e.name && e.series.length > 1) ?? progress.exercises[0] ?? null;
  const metric = focus ? metricFor(athlete.metric, focus.series) : athlete.metric;
  // Compare like with like: a deload session is low on purpose.
  const counted = focus?.series.filter((p) => !p.deload) ?? [];
  const first = counted[0];
  const latest = counted[counted.length - 1];
  const latestValue = latest?.[metric] ?? null;
  const firstValue = first?.[metric] ?? null;
  const change = latest && first && latest !== first && latestValue != null && firstValue ? Math.round(((latestValue - firstValue) / firstValue) * 100) : null;

  // State-aware helper under the week list.
  const weekLine =
    weekLeft === 0
      ? `Week ${plan.currentWeek} is done — ${weekDone} of ${week.length} logged.`
      : `Week ${plan.currentWeek}, ${weekDone} of ${week.length} done — pick any workout to start.`;

  return (
    <div className="space-y-8">
      <div className="rise">
        <Greeting name={athlete.firstName} />
        {athlete.isGuest && !athlete.isDemo && (
          <Link href="/you" className="press mt-3 inline-flex items-center gap-1.5 rounded-full border border-signal/30 bg-signal/5 px-3 py-1.5 text-[13px] font-medium text-signal hover:bg-signal/10">
            Guest account · save it to keep your progress <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        )}
      </div>

      {/* ── Up next ──────────────────────────────────────────────────── */}
      {next ? (
        <section className="surface-night rise rise-1 p-6 sm:p-8">
          <p className="text-[11px] font-semibold uppercase tracking-[0.09em] text-white/55">
            Up next · Week {next.week} of {plan.totalWeeks}
            {block ? ` · ${block.name}` : ""}
            {lighterWeek ? " · Deload week" : ""}
          </p>
          <div className="mt-3 flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
            <div className="min-w-0">
              <h2 className="text-4xl leading-none sm:text-5xl">{next.name}</h2>
              <p className="mt-3 truncate text-[15px] text-white/65">
                {next.exercises
                  .slice(0, 3)
                  .map((e) => e.name)
                  .join(" · ")}
                {next.exercises.length > 3 ? ` + ${next.exercises.length - 3} more` : ""}
              </p>
              <p className="mt-1 text-[13px] text-white/45">
                {next.exercises.length} exercises · about {next.estMinutes} min
              </p>
            </div>
            <Link
              href={`/workouts/${next.id}`}
              className="press flex h-14 shrink-0 items-center justify-center gap-2 rounded-xl bg-white px-8 text-base font-semibold text-ink hover:bg-white/90"
            >
              Start workout <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </section>
      ) : (
        <section className="surface-night rise rise-1 p-8">
          <h2 className="text-4xl">Plan complete.</h2>
          {athlete.selfServe ? (
            <>
              <p className="mt-3 max-w-md text-white/65">Every week done. Rebuild your plan to start the next cycle — your history carries over.</p>
              <Link href="/you?goals=1" className="press mt-6 inline-flex h-12 items-center gap-2 rounded-xl bg-white px-6 font-semibold text-ink">
                Build the next one <ArrowRight className="h-4 w-4" />
              </Link>
            </>
          ) : (
            <p className="mt-3 max-w-md text-white/65">Every workout in this program is done. Your coach will set up what comes next.</p>
          )}
        </section>
      )}

      <div className="grid gap-x-12 gap-y-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.35fr)]">
        {/* ── This week ──────────────────────────────────────────────── */}
        <section className="rise rise-2">
          <div className="flex items-baseline justify-between">
            <h2 className="text-xl text-ink">Week {plan.currentWeek}</h2>
            <span className="text-sm text-ink-mute">
              {weekDone} of {week.length} done
            </span>
          </div>
          <div className="mt-3 flex gap-1">
            {week.map((w) => (
              <span key={w.id} className={cn("h-1 flex-1 rounded-full", w.status === "LOGGED" ? "bg-signal" : w.status === "SKIPPED" ? "bg-ink/25" : "bg-ink/10")} />
            ))}
          </div>
          <ul className="mt-2 divide-y divide-line">
            {week.map((w) => {
              const isNext = w.id === next?.id;
              return (
                <li key={w.id}>
                  <Link href={`/workouts/${w.id}`} className="press group flex items-center gap-3 py-3.5">
                    <span
                      className={cn(
                        "flex h-8 w-8 shrink-0 items-center justify-center rounded-full",
                        w.status === "LOGGED" ? "bg-signal text-white" : "bg-ink/5 text-ink-mute"
                      )}
                    >
                      {w.status === "LOGGED" ? <Check className="h-4 w-4" strokeWidth={3} /> : w.status === "SKIPPED" ? <SkipForward className="h-3.5 w-3.5" /> : <Dumbbell className="h-3.5 w-3.5" />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className={cn("block truncate text-[15px] font-semibold", w.status === "SKIPPED" ? "text-ink-mute" : "text-ink")}>{w.name}</span>
                      <span className="block text-[13px] text-ink-mute">
                        {w.status === "LOGGED" ? "Logged" : w.status === "SKIPPED" ? "Skipped" : isNext ? "Up next" : "Not started"} · {w.exercises.length} exercises
                      </span>
                    </span>
                    <ChevronRight className="h-4 w-4 shrink-0 text-ink-mute transition-transform group-hover:translate-x-0.5" />
                  </Link>
                </li>
              );
            })}
          </ul>
          <p className="rule pt-3 text-[13px] text-ink-mute">{weekLine}</p>
        </section>

        {/* ── Focus chart: sits on the page, no card ─────────────────── */}
        <section className="rise rise-3 min-w-0">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <h2 className="truncate text-xl text-ink">{focus?.name ?? "Nothing logged yet"}</h2>
              <p className="mt-0.5 text-sm text-ink-mute">{focus ? METRICS[metric].label : "Your chart starts with your first set."}</p>
            </div>
            {latest && latestValue != null && (
              <div className="shrink-0 text-right">
                <p className="text-2xl font-semibold leading-none tracking-tight text-ink">
                  {formatValue(latestValue, metric)}
                  <span className="ml-1 text-sm font-normal text-ink-mute">{unitFor(metric, focus?.loaded ?? true, focus?.timed)}</span>
                </p>
                <p className="mt-1.5 text-[13px] text-ink-mute">
                  {format(parseISO(latest.date), "MMM d")} session
                  {change != null && change !== 0 && first && (
                    <>
                      {" · "}
                      <span className={cn("font-medium", change > 0 ? "text-signal" : "text-ink-soft")}>
                        {change > 0 ? "+" : ""}
                        {change}% since {format(parseISO(first.date), "MMM d")}
                      </span>
                    </>
                  )}
                </p>
              </div>
            )}
          </div>
          <div className="mt-4">
            <ProgressChart series={focus?.series ?? []} metric={metric} loaded={focus?.loaded ?? true} timed={focus?.timed} target={focus?.target} height={250} />
          </div>
          <Link href="/progress" className="press mt-4 inline-flex items-center gap-1 text-sm font-semibold text-ink hover:text-ink-soft">
            All progress <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </section>
      </div>

      {/* ── Totals: one row, hairline dividers, no cards ─────────────── */}
      <StatRow
        className="rise rise-4"
        stats={[
          { label: "Workouts", value: String(progress.totals.sessions), hint: `${plan.done} of ${plan.workouts.length} in this plan` },
          { label: "Streak", value: String(progress.totals.streak), unit: progress.totals.streak === 1 ? "week" : "weeks", hint: "in a row with a session" },
          { label: "Records", value: String(progress.totals.prs), hint: progress.totals.since ? `since ${format(parseISO(progress.totals.since), "MMM d")}` : "none yet" },
        ]}
      />
    </div>
  );
}
