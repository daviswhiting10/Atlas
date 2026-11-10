"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { format, parseISO } from "date-fns";
import { ArrowRight, TrendingUp } from "lucide-react";
import type { ProgressData } from "@/lib/athlete/data";
import type { FocusMetric } from "@/lib/plan/generator";
import { METRICS, formatValue, metricFor } from "@/lib/plan/overload";
import { ProgressChart } from "./ProgressChart";
import { StatRow } from "./StatRow";
import { cn } from "@/lib/utils";

const ORDER: FocusMetric[] = ["weight", "reps", "e1rm", "volume"];
/** Exercises shown before "More". Enough for the main lifts; the rest are one tap away. */
const PILLS_SHOWN = 8;

const day = (iso: string) => format(parseISO(iso), "MMM d");
const compact = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(n >= 100000 ? 0 : 1)}k` : String(n));

function WeekTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload: { week: string; volume: number; sessions: number } }> }) {
  const row = active ? payload?.[0]?.payload : null;
  if (!row) return null;
  return (
    <div className="rounded-lg border border-line bg-white px-3 py-2 shadow-md">
      <p className="text-[11px] text-ink-mute">Week of {day(row.week)}</p>
      <p className="text-sm font-semibold text-ink">{row.volume.toLocaleString()} lb</p>
      <p className="text-xs text-ink-mute">
        {row.sessions} session{row.sessions === 1 ? "" : "s"}
      </p>
    </div>
  );
}

export function ProgressView({ data, goalMetric }: { data: ProgressData; goalMetric: FocusMetric }) {
  const [exerciseId, setExerciseId] = useState(data.exercises[0]?.exerciseId ?? null);
  const [chosen, setChosen] = useState<FocusMetric>(goalMetric);
  const [showAll, setShowAll] = useState(false);

  const exercise = data.exercises.find((e) => e.exerciseId === exerciseId) ?? data.exercises[0] ?? null;
  const metric = exercise ? metricFor(chosen, exercise.series) : chosen;

  const stats = useMemo(() => {
    if (!exercise) return null;
    // A deload session is low on purpose, so it is left out of "latest", "best" and the change.
    const counted = exercise.series.filter((p) => !p.deload && p[metric] != null);
    if (counted.length === 0) return null;
    const first = counted[0];
    const latest = counted[counted.length - 1];
    const firstValue = first[metric] as number;
    const latestValue = latest[metric] as number;
    const best = counted.reduce((b, p) => ((p[metric] as number) > (b[metric] as number) ? p : b), counted[0]);
    return {
      latest,
      latestValue,
      first,
      change: counted.length > 1 && firstValue ? Math.round(((latestValue - firstValue) / firstValue) * 100) : null,
      // Only worth showing when it isn't the number already on screen.
      best: (best[metric] as number) > latestValue ? best : null,
    };
  }, [exercise, metric]);

  if (data.exercises.length === 0 || !exercise) {
    return (
      <div className="rise rise-1">
        <ProgressChart series={[]} metric={goalMetric} loaded height={260} legend={false} />
        <Link href="/today" className="press mt-6 inline-flex h-12 items-center gap-2 rounded-xl bg-ink px-6 text-[15px] font-semibold text-white hover:bg-ink/85">
          Log your first workout <ArrowRight className="h-4 w-4" />
        </Link>
      </div>
    );
  }

  const unit = METRICS[metric].unit(exercise.loaded);
  const selectedIndex = data.exercises.findIndex((e) => e.exerciseId === exercise.exerciseId);
  // Keep the selected exercise visible even when it lives under "More".
  const visible = showAll ? data.exercises : data.exercises.filter((_, i) => i < PILLS_SHOWN || i === selectedIndex);
  const hidden = data.exercises.length - visible.length;

  return (
    <div className="space-y-10">
      <StatRow
        className="rise rise-1"
        stats={[
          { label: "Workouts", value: String(data.totals.sessions) },
          { label: "Total volume", value: compact(data.totals.volume), unit: "lb" },
          { label: "Records", value: String(data.totals.prs) },
          { label: "Streak", value: String(data.totals.streak), unit: data.totals.streak === 1 ? "week" : "weeks" },
        ]}
      />

      {/* ── One exercise ─────────────────────────────────────────────── */}
      <section className="rise rise-2">
        {/* Wraps onto as many rows as it needs: a name is never cut mid-word. */}
        <div className="flex flex-wrap gap-2" role="group" aria-label="Exercise">
          {visible.map((e) => {
            const active = e.exerciseId === exercise.exerciseId;
            return (
              <button
                key={e.exerciseId}
                type="button"
                aria-pressed={active}
                onClick={() => setExerciseId(e.exerciseId)}
                className={cn(
                  "press whitespace-nowrap rounded-full border px-3.5 py-1.5 text-sm font-medium",
                  active ? "border-ink bg-ink text-white" : "border-line bg-white text-ink-soft hover:border-ink/25 hover:text-ink"
                )}
              >
                {e.name}
              </button>
            );
          })}
          {(hidden > 0 || showAll) && data.exercises.length > PILLS_SHOWN && (
            <button
              type="button"
              aria-expanded={showAll}
              onClick={() => setShowAll(!showAll)}
              className="press whitespace-nowrap rounded-full px-3 py-1.5 text-sm font-medium text-ink-mute underline-offset-4 hover:text-ink hover:underline"
            >
              {showAll ? "Fewer" : `${hidden} more`}
            </button>
          )}
        </div>

        <div className="mt-7 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0">
            <h2 className="text-3xl leading-none text-ink">{exercise.name}</h2>
            <p className="mt-2 text-sm text-ink-mute">
              {METRICS[metric].label}
              {metric === goalMetric ? " · the number your goal is measured by" : ""}
            </p>
          </div>
          <div className="flex self-start rounded-lg border border-line bg-white p-0.5 sm:self-auto" role="radiogroup" aria-label="Metric">
            {ORDER.map((m) => {
              const disabled = !exercise.loaded && (m === "weight" || m === "e1rm");
              const active = m === metric;
              return (
                <button
                  key={m}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  disabled={disabled}
                  onClick={() => setChosen(m)}
                  className={cn(
                    "press whitespace-nowrap rounded-md px-3 py-1.5 text-[13px] font-medium",
                    active ? "bg-ink text-white" : "text-ink-mute hover:text-ink",
                    disabled && "opacity-30"
                  )}
                >
                  {METRICS[m].short}
                </button>
              );
            })}
          </div>
        </div>

        {stats && (
          <div className="mt-6 flex flex-wrap items-end gap-x-10 gap-y-3">
            <div>
              <p className="eyebrow">Latest session · {day(stats.latest.date)}</p>
              <p className="mt-1.5 text-5xl font-semibold leading-none tracking-tight text-ink">
                {formatValue(stats.latestValue, metric)}
                <span className="ml-1.5 text-base font-normal text-ink-mute">{unit}</span>
              </p>
            </div>
            <dl className="flex gap-8 pb-0.5 text-sm">
              {stats.change != null && (
                <div>
                  <dt className="text-ink-mute">Since {day(stats.first.date)}</dt>
                  <dd className={cn("mt-0.5 font-semibold", stats.change > 0 ? "text-signal" : "text-ink")}>
                    {stats.change > 0 ? "+" : ""}
                    {stats.change}%
                  </dd>
                </div>
              )}
              {stats.best && (
                <div>
                  <dt className="text-ink-mute">Best · {day(stats.best.date)}</dt>
                  <dd className="mt-0.5 font-semibold text-ink">
                    {formatValue(stats.best[metric] as number, metric)} {unit}
                  </dd>
                </div>
              )}
              <div>
                <dt className="text-ink-mute">Sessions</dt>
                <dd className="mt-0.5 font-semibold text-ink">{exercise.series.length}</dd>
              </div>
            </dl>
          </div>
        )}

        <div className="mt-6">
          <ProgressChart
            series={exercise.series}
            metric={metric}
            loaded={exercise.loaded}
            target={exercise.target}
            height={300}
            chartKey={`${exercise.exerciseId}-${metric}`}
          />
        </div>

        {exercise.target && (
          <div className="surface mt-6 flex items-start gap-3 p-4">
            <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-signal text-white">
              <TrendingUp className="h-4 w-4" />
            </span>
            <div className="min-w-0">
              <p className="eyebrow">Next session</p>
              <p className="mt-0.5 text-lg font-semibold tracking-tight text-ink">{exercise.target.headline}</p>
              <p className="mt-0.5 text-sm leading-relaxed text-ink-soft">{exercise.target.reason}</p>
            </div>
          </div>
        )}
      </section>

      <div className="rule grid gap-x-12 gap-y-10 pt-8 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
        {/* ── All lifts, week by week ────────────────────────────────── */}
        <section className="rise rise-3 min-w-0">
          <h2 className="text-xl text-ink">Weekly volume, all lifts</h2>
          <p className="mt-0.5 text-sm text-ink-mute">Total pounds moved each week. Dots are sessions.</p>
          <div className="mt-4 h-44">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.weeks} margin={{ top: 4, right: 0, left: -8, bottom: 0 }} barCategoryGap="28%">
                <XAxis dataKey="week" tickFormatter={day} tick={{ fontSize: 11, fill: "var(--ink-mute)" }} tickLine={false} axisLine={{ stroke: "rgba(11,15,26,0.07)" }} interval="preserveStartEnd" minTickGap={24} />
                <YAxis domain={[0, "auto"]} tickFormatter={compact} tick={{ fontSize: 11, fill: "var(--ink-mute)" }} tickLine={false} axisLine={false} width={48} tickCount={4} />
                <Tooltip content={<WeekTooltip />} cursor={{ fill: "rgba(11,15,26,0.04)" }} />
                <Bar dataKey="volume" fill="var(--signal)" radius={[2, 2, 0, 0]} maxBarSize={30} animationDuration={700} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-2 flex pl-10" aria-label="Sessions per week">
            {data.weeks.map((w) => (
              <div key={w.week} className="flex flex-1 justify-center gap-0.5">
                {w.sessions === 0 ? (
                  <span className="h-1 w-1 rounded-full bg-ink/15" />
                ) : (
                  Array.from({ length: Math.min(w.sessions, 6) }, (_, i) => <span key={i} className="h-1 w-1 rounded-full bg-ink/50" />)
                )}
              </div>
            ))}
          </div>
        </section>

        {/* ── Records ────────────────────────────────────────────────── */}
        <section className="rise rise-4 min-w-0">
          <h2 className="text-xl text-ink">Personal records</h2>
          <p className="mt-0.5 text-sm text-ink-mute">The heaviest weight you&apos;ve lifted on each exercise.</p>
          {data.recentPRs.length === 0 ? (
            <p className="rule mt-4 pt-4 text-[15px] leading-relaxed text-ink-soft">None yet. Your first session sets the baseline; lift heavier than it and the record lands here.</p>
          ) : (
            <ul className="rule mt-4 divide-y divide-line">
              {data.recentPRs.map((r, i) => (
                <li key={`${r.exercise}-${r.date}-${i}`} className="flex items-baseline gap-3 py-2.5">
                  <span className="h-2 w-2 shrink-0 translate-y-[-1px] rounded-full bg-gold" />
                  <span className="min-w-0 flex-1 truncate text-[15px] text-ink">{r.exercise}</span>
                  <span className="shrink-0 text-[13px] text-ink-mute">{day(r.date)}</span>
                  <span className="w-20 shrink-0 text-right text-[15px] font-semibold text-ink">
                    {formatValue(r.value, "weight")} <span className="text-xs font-normal text-ink-mute">{r.unit}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
