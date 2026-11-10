"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis } from "recharts";
import { format, parseISO } from "date-fns";
import { ArrowRight, Dumbbell, Flame, Layers, Medal, TrendingUp } from "lucide-react";
import type { ProgressData } from "@/lib/athlete/data";
import type { FocusMetric } from "@/lib/plan/generator";
import { METRICS, formatValue, metricFor } from "@/lib/plan/overload";
import { ProgressChart } from "./ProgressChart";
import { cn } from "@/lib/utils";

const ORDER: FocusMetric[] = ["weight", "reps", "e1rm", "volume"];

function Tile({ icon: Icon, label, value, unit }: { icon: typeof Flame; label: string; value: string; unit?: string }) {
  return (
    <div className="surface p-4 sm:p-5">
      <div className="flex items-center gap-2 text-ink-mute">
        <Icon className="h-4 w-4" />
        <span className="eyebrow">{label}</span>
      </div>
      <p className="tnum mt-2.5 font-display text-[34px] leading-none text-ink">
        {value}
        {unit && <span className="ml-1 font-body text-sm text-ink-mute">{unit}</span>}
      </p>
    </div>
  );
}

function WeekTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload: { week: string; volume: number; sessions: number } }> }) {
  const row = active ? payload?.[0]?.payload : null;
  if (!row) return null;
  return (
    <div className="rounded-xl border border-line bg-white px-3 py-2 shadow-lg">
      <p className="text-[11px] text-ink-mute">Week of {format(parseISO(row.week), "MMM d")}</p>
      <p className="tnum text-sm font-semibold text-ink">{row.volume.toLocaleString()} lb</p>
      <p className="tnum text-xs text-ink-mute">
        {row.sessions} session{row.sessions === 1 ? "" : "s"}
      </p>
    </div>
  );
}

export function ProgressView({
  data,
  goalMetric,
  goalLabel,
  metricWhy,
}: {
  data: ProgressData;
  goalMetric: FocusMetric;
  goalLabel: string;
  metricWhy: string;
}) {
  const [exerciseId, setExerciseId] = useState(data.exercises[0]?.exerciseId ?? null);
  const [chosen, setChosen] = useState<FocusMetric>(goalMetric);

  const exercise = data.exercises.find((e) => e.exerciseId === exerciseId) ?? data.exercises[0] ?? null;
  const metric = exercise ? metricFor(chosen, exercise.series) : chosen;

  const stats = useMemo(() => {
    if (!exercise) return null;
    const values = exercise.series.map((p) => p[metric]).filter((v): v is number => v != null);
    if (values.length === 0) return null;
    const first = values[0];
    const last = values[values.length - 1];
    return {
      last,
      best: Math.max(...values),
      change: first ? Math.round(((last - first) / first) * 100) : 0,
      records: exercise.series.filter((p) => p.pr[metric]).length,
    };
  }, [exercise, metric]);

  if (data.exercises.length === 0) {
    return (
      <div className="surface rise rise-1 p-6 sm:p-8">
        <ProgressChart series={[]} metric={goalMetric} loaded height={280} />
        <div className="mt-6 flex flex-col items-start justify-between gap-4 border-t border-line pt-6 sm:flex-row sm:items-center">
          <p className="max-w-md text-[15px] leading-relaxed text-ink-soft">
            Your goal is to <strong className="font-semibold text-ink">{goalLabel.toLowerCase()}</strong>. {metricWhy}
          </p>
          <Link href="/today" className="press flex h-12 shrink-0 items-center gap-2 rounded-2xl bg-blue px-6 text-[15px] font-semibold text-white hover:bg-blue-deep">
            Log your first workout <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </div>
    );
  }

  const unit = METRICS[metric].unit(exercise?.loaded ?? true);
  const maxVolume = Math.max(...data.weeks.map((w) => w.volume), 1);

  return (
    <div className="space-y-4">
      <section className="rise rise-1 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <Tile icon={Dumbbell} label="Workouts" value={String(data.totals.sessions)} />
        <Tile icon={Layers} label="Volume" value={data.totals.volume >= 1000 ? `${(data.totals.volume / 1000).toFixed(data.totals.volume >= 100000 ? 0 : 1)}k` : String(data.totals.volume)} unit="lb" />
        <Tile icon={Medal} label="Records" value={String(data.totals.prs)} />
        <Tile icon={Flame} label="Streak" value={String(data.totals.streak)} unit={data.totals.streak === 1 ? "week" : "weeks"} />
      </section>

      {/* ── Exercise chart ───────────────────────────────────────────── */}
      <section className="surface rise rise-2 p-4 sm:p-6">
        <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:-mx-6 sm:px-6" role="tablist" aria-label="Exercise">
          {data.exercises.map((e) => {
            const active = e.exerciseId === exercise?.exerciseId;
            return (
              <button
                key={e.exerciseId}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setExerciseId(e.exerciseId)}
                className={cn(
                  "press shrink-0 rounded-full border px-3.5 py-2 text-sm font-medium",
                  active ? "border-ink bg-ink text-white" : "border-line bg-white text-ink-soft hover:border-ink/20 hover:text-ink"
                )}
              >
                {e.name}
              </button>
            );
          })}
        </div>

        <div className="mt-5 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0">
            <p className="eyebrow">{METRICS[metric].label}</p>
            <h2 className="mt-1 truncate font-display text-4xl leading-none text-ink sm:text-5xl">{exercise?.name}</h2>
          </div>
          <div className="flex rounded-full border border-line bg-bone p-1" role="radiogroup" aria-label="Metric">
            {ORDER.map((m) => {
              const disabled = !exercise?.loaded && (m === "weight" || m === "e1rm");
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
                    "press flex-1 whitespace-nowrap rounded-full px-3 py-1.5 text-[13px] font-semibold sm:flex-none sm:px-4",
                    active ? "bg-white text-ink shadow-sm" : "text-ink-mute hover:text-ink",
                    disabled && "opacity-30"
                  )}
                >
                  {METRICS[m].short}
                  {m === goalMetric && <span className="ml-1 inline-block h-1.5 w-1.5 rounded-full bg-blue align-middle" aria-label="your goal metric" />}
                </button>
              );
            })}
          </div>
        </div>

        {stats && (
          <div className="mt-5 flex flex-wrap items-end gap-x-8 gap-y-3">
            <p className="tnum font-display text-6xl leading-none text-ink">
              {formatValue(stats.last, metric)}
              <span className="ml-1.5 font-body text-base text-ink-mute">{unit}</span>
            </p>
            <div className="flex gap-6 pb-1 text-sm">
              <div>
                <p className={cn("tnum font-semibold", stats.change > 0 ? "text-success" : "text-ink-soft")}>
                  {stats.change > 0 ? "+" : ""}
                  {stats.change}%
                </p>
                <p className="text-ink-mute">since first session</p>
              </div>
              <div>
                <p className="tnum font-semibold text-ink">
                  {formatValue(stats.best, metric)} {unit}
                </p>
                <p className="text-ink-mute">all-time best</p>
              </div>
              <div>
                <p className="tnum font-semibold text-ink">{exercise?.series.length}</p>
                <p className="text-ink-mute">sessions</p>
              </div>
            </div>
          </div>
        )}

        <div className="mt-4">
          <ProgressChart
            series={exercise?.series ?? []}
            metric={metric}
            loaded={exercise?.loaded ?? true}
            target={exercise?.target}
            height={300}
            chartKey={`${exercise?.exerciseId}-${metric}`}
          />
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-[13px] text-ink-mute">
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-gold" /> Personal record
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-5 border-t-2 border-dashed border-blue/60" /> Next target
          </span>
          {metric === goalMetric && (
            <span className="flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-blue" /> Leading metric for your goal
            </span>
          )}
        </div>

        {exercise?.target && (
          <div className="mt-4 flex items-start gap-3 rounded-2xl border border-blue/20 bg-blue/[0.06] p-4">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-blue text-white">
              <TrendingUp className="h-4 w-4" />
            </span>
            <div className="min-w-0">
              <p className="eyebrow text-blue-deep">Next session</p>
              <p className="tnum mt-0.5 text-lg font-semibold text-ink">{exercise.target.headline}</p>
              <p className="mt-0.5 text-sm leading-relaxed text-ink-soft">{exercise.target.reason}</p>
            </div>
          </div>
        )}
      </section>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
        {/* ── Weekly volume ──────────────────────────────────────────── */}
        <section className="surface rise rise-3 p-5 sm:p-6">
          <p className="eyebrow">Week by week</p>
          <h2 className="mt-1 font-display text-[28px] leading-none text-ink">Total volume</h2>
          <div className="mt-4 h-44">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.weeks} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
                <XAxis dataKey="week" tickFormatter={(w: string) => format(parseISO(w), "MMM d")} tick={{ fontSize: 11, fill: "var(--ink-mute)" }} tickLine={false} axisLine={false} interval="preserveStartEnd" minTickGap={24} />
                <Tooltip content={<WeekTooltip />} cursor={{ fill: "rgba(11,15,26,0.04)", radius: 8 }} />
                <Bar dataKey="volume" radius={[7, 7, 3, 3]} animationDuration={900}>
                  {data.weeks.map((w, i) => (
                    <Cell key={w.week} fill="var(--blue)" fillOpacity={i === data.weeks.length - 1 ? 1 : 0.28 + 0.5 * (w.volume / maxVolume)} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-3 flex gap-1" aria-label="Sessions per week">
            {data.weeks.map((w) => (
              <div key={w.week} className="flex flex-1 justify-center gap-0.5">
                {Array.from({ length: Math.min(w.sessions, 6) }, (_, i) => (
                  <span key={i} className="h-1.5 w-1.5 rounded-full bg-blue" />
                ))}
                {w.sessions === 0 && <span className="h-1.5 w-1.5 rounded-full bg-ink/10" />}
              </div>
            ))}
          </div>
          <p className="mt-2 text-[13px] text-ink-mute">Each dot is a session.</p>
        </section>

        {/* ── Records ────────────────────────────────────────────────── */}
        <section className="surface rise rise-4 p-5 sm:p-6">
          <p className="eyebrow">Latest</p>
          <h2 className="mt-1 font-display text-[28px] leading-none text-ink">Personal records</h2>
          {data.recentPRs.length === 0 ? (
            <p className="mt-4 text-[15px] leading-relaxed text-ink-soft">Your first session sets the baseline. Beat it next time and the record shows up here.</p>
          ) : (
            <ul className="mt-4 divide-y divide-line">
              {data.recentPRs.map((r, i) => (
                <li key={`${r.exercise}-${r.date}-${i}`} className="flex items-center gap-3 py-2.5">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gold/15 text-gold">
                    <Medal className="h-4 w-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[15px] font-medium text-ink">{r.exercise}</span>
                    <span className="block text-xs text-ink-mute">{format(parseISO(r.date), "MMM d")}</span>
                  </span>
                  <span className="tnum shrink-0 text-[15px] font-semibold text-ink">
                    {formatValue(r.value, r.metric)} <span className="text-xs font-normal text-ink-mute">{r.metric === "e1rm" ? "lb est. max" : "reps"}</span>
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
