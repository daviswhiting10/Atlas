import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Check, ChevronRight, Clock, Dumbbell, Flame, Medal, SkipForward, Sparkles } from "lucide-react";
import { getAthlete, getPlanOverview, getProgress } from "@/lib/athlete/data";
import { BLOCK_WEEKS, GOALS } from "@/lib/plan/generator";
import { METRICS, formatValue, metricFor } from "@/lib/plan/overload";
import { Greeting } from "@/components/athlete/Greeting";
import { ProgressChart } from "@/components/athlete/ProgressChart";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Today" };

function StatTile({ icon: Icon, label, value, hint }: { icon: typeof Flame; label: string; value: string; hint: string }) {
  return (
    <div className="surface p-5">
      <div className="flex items-center gap-2 text-ink-mute">
        <Icon className="h-4 w-4" />
        <span className="eyebrow">{label}</span>
      </div>
      <p className="tnum mt-3 font-display text-4xl leading-none text-ink">{value}</p>
      <p className="mt-1.5 text-[13px] text-ink-mute">{hint}</p>
    </div>
  );
}

export default async function TodayPage() {
  const [athlete, plan, progress] = await Promise.all([getAthlete(), getPlanOverview(), getProgress()]);

  if (!plan) {
    return (
      <div className="rise">
        <Greeting name={athlete.firstName} />
        <div className="surface mt-7 p-8 text-center">
          <h2 className="font-display text-3xl text-ink">No plan yet</h2>
          {athlete.selfServe ? (
            <>
              <p className="mx-auto mt-2 max-w-sm text-[15px] text-ink-soft">Tell Atlas your goal and it will lay out your next 12 weeks.</p>
              <Link href="/you" className="press mt-6 inline-flex h-12 items-center gap-2 rounded-2xl bg-blue px-6 text-[15px] font-semibold text-white hover:bg-blue-deep">
                Build my plan <ArrowRight className="h-4 w-4" />
              </Link>
            </>
          ) : (
            <p className="mx-auto mt-2 max-w-sm text-[15px] text-ink-soft">Your coach hasn&apos;t assigned a program yet. It will show up here as soon as they do.</p>
          )}
        </div>
      </div>
    );
  }

  const next = plan.nextUp;
  const week = plan.workouts.filter((w) => w.week === plan.currentWeek);
  const weekDone = week.filter((w) => w.status === "LOGGED").length;
  const block = plan.blocks[Math.min(Math.floor((plan.currentWeek - 1) / BLOCK_WEEKS), plan.blocks.length - 1)];
  const lighterWeek = athlete.selfServe && next != null && next.week % BLOCK_WEEKS === 0;

  // Lead with the lift the athlete has trained most — or the first one coming up.
  const focus =
    progress.exercises.find((e) => next?.exercises[0]?.name === e.name && e.series.length > 1) ?? progress.exercises[0] ?? null;
  const metric = focus ? metricFor(athlete.metric, focus.series) : athlete.metric;
  const latest = focus?.series.at(-1);
  const first = focus?.series[0];
  const latestValue = latest?.[metric] ?? null;
  const firstValue = first?.[metric] ?? null;
  const change = latestValue != null && firstValue ? Math.round(((latestValue - firstValue) / firstValue) * 100) : null;

  return (
    <div className="space-y-4">
      <div className="rise mb-7">
        <Greeting name={athlete.firstName} />
      </div>

      {/* ── Up next ──────────────────────────────────────────────────── */}
      {next ? (
        <section className="surface-night rise rise-1 p-6 sm:p-8">
          <p className="text-[11px] font-semibold uppercase tracking-[0.09em] text-white/60">
            Up next · Week {next.week} of {plan.totalWeeks}
            {block ? ` · ${block.name}` : ""}
          </p>
          <div className="mt-3 flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
            <div className="min-w-0">
              <h2 className="font-display text-5xl leading-none sm:text-6xl">{next.name}</h2>
              <p className="mt-3 truncate text-[15px] text-white/70">
                {next.exercises
                  .slice(0, 3)
                  .map((e) => e.name)
                  .join(" · ")}
                {next.exercises.length > 3 ? ` + ${next.exercises.length - 3} more` : ""}
              </p>
              <div className="mt-4 flex flex-wrap gap-2 text-[13px] text-white/80">
                <span className="tnum flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1.5">
                  <Dumbbell className="h-3.5 w-3.5" /> {next.exercises.length} exercises
                </span>
                <span className="tnum flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1.5">
                  <Clock className="h-3.5 w-3.5" /> ~{next.estMinutes} min
                </span>
                {lighterWeek && (
                  <span className="flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1.5">
                    <Sparkles className="h-3.5 w-3.5" /> Lighter week
                  </span>
                )}
              </div>
            </div>
            <Link
              href={`/workouts/${next.id}`}
              className="press flex h-14 shrink-0 items-center justify-center gap-2 rounded-2xl bg-white px-8 text-base font-semibold text-ink hover:bg-white/90"
            >
              Start workout <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </section>
      ) : (
        <section className="surface-night rise rise-1 p-8">
          <h2 className="font-display text-5xl">Plan complete.</h2>
          {athlete.selfServe ? (
            <>
              <p className="mt-3 max-w-md text-white/70">Every week done. Rebuild your plan to start the next cycle — your history carries over.</p>
              <Link href="/you" className="press mt-6 inline-flex h-12 items-center gap-2 rounded-2xl bg-white px-6 font-semibold text-ink">
                Build the next one <ArrowRight className="h-4 w-4" />
              </Link>
            </>
          ) : (
            <p className="mt-3 max-w-md text-white/70">Every workout in this program is done. Your coach will set up what comes next.</p>
          )}
        </section>
      )}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)]">
        {/* ── This week ──────────────────────────────────────────────── */}
        <section className="surface rise rise-2 p-5 sm:p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="eyebrow">This week</p>
              <h2 className="mt-1 font-display text-[28px] leading-none text-ink">Week {plan.currentWeek}</h2>
            </div>
            <span className="tnum rounded-full bg-ink/5 px-3 py-1.5 text-sm font-semibold text-ink-soft">
              {weekDone} / {week.length} done
            </span>
          </div>
          <div className="mt-3 flex gap-1.5">
            {week.map((w) => (
              <span key={w.id} className={cn("h-1.5 flex-1 rounded-full", w.status === "LOGGED" ? "bg-blue" : w.status === "SKIPPED" ? "bg-ink/25" : "bg-ink/10")} />
            ))}
          </div>
          <ul className="mt-4 space-y-2">
            {week.map((w) => {
              const isNext = w.id === next?.id;
              return (
                <li key={w.id}>
                  <Link
                    href={`/workouts/${w.id}`}
                    className={cn(
                      "press flex items-center gap-3 rounded-2xl border p-3.5",
                      isNext ? "border-blue/40 bg-blue/[0.04]" : "border-line hover:border-ink/20"
                    )}
                  >
                    <span
                      className={cn(
                        "flex h-9 w-9 shrink-0 items-center justify-center rounded-full",
                        w.status === "LOGGED" ? "bg-blue text-white" : w.status === "SKIPPED" ? "bg-ink/5 text-ink-mute" : isNext ? "bg-blue/10 text-blue" : "bg-ink/5 text-ink-mute"
                      )}
                    >
                      {w.status === "LOGGED" ? <Check className="h-4 w-4" strokeWidth={3} /> : w.status === "SKIPPED" ? <SkipForward className="h-4 w-4" /> : <Dumbbell className="h-4 w-4" />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[15px] font-semibold text-ink">{w.name}</span>
                      <span className="tnum block text-[13px] text-ink-mute">
                        {w.status === "LOGGED" ? "Logged" : w.status === "SKIPPED" ? "Skipped" : isNext ? "Up next" : "Coming up"} · {w.exercises.length} exercises
                      </span>
                    </span>
                    <ChevronRight className="h-4 w-4 shrink-0 text-ink-mute" />
                  </Link>
                </li>
              );
            })}
          </ul>
          <p className="mt-3 text-[13px] text-ink-mute">Tap any workout to do it today — the order is yours.</p>
        </section>

        {/* ── Focus chart ────────────────────────────────────────────── */}
        <section className="surface rise rise-3 flex flex-col p-5 sm:p-6">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="eyebrow">{focus ? `${METRICS[metric].label}` : "Your progress"}</p>
              <h2 className="mt-1 truncate font-display text-[28px] leading-none text-ink">{focus?.name ?? "Nothing logged yet"}</h2>
            </div>
            {latestValue != null && (
              <div className="shrink-0 text-right">
                <p className="tnum font-display text-3xl leading-none text-ink">
                  {formatValue(latestValue, metric)}
                  <span className="ml-1 font-body text-sm text-ink-mute">{METRICS[metric].unit(focus?.loaded ?? true)}</span>
                </p>
                {change != null && change !== 0 && (
                  <p className={cn("tnum mt-1 text-[13px] font-semibold", change > 0 ? "text-success" : "text-ink-mute")}>
                    {change > 0 ? "+" : ""}
                    {change}% since you started
                  </p>
                )}
              </div>
            )}
          </div>
          <div className="mt-3 flex-1">
            <ProgressChart series={focus?.series ?? []} metric={metric} loaded={focus?.loaded ?? true} target={focus?.target} height={270} />
          </div>
          <Link href="/progress" className="press mt-3 inline-flex items-center gap-1 self-start text-sm font-semibold text-blue hover:text-blue-deep">
            See all progress <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </section>
      </div>

      {/* ── Stats ────────────────────────────────────────────────────── */}
      <section className="rise rise-4 grid gap-4 sm:grid-cols-3">
        <StatTile icon={Dumbbell} label="Workouts" value={String(progress.totals.sessions)} hint={`${plan.done} of ${plan.workouts.length} in this plan`} />
        <StatTile icon={Flame} label="Streak" value={`${progress.totals.streak} wk`} hint={progress.totals.streak > 0 ? "Weeks in a row with a session" : "Log a session to start one"} />
        <StatTile icon={Medal} label="Records" value={String(progress.totals.prs)} hint={`Goal: ${GOALS[athlete.prefs.goal].label.toLowerCase()}`} />
      </section>
    </div>
  );
}
