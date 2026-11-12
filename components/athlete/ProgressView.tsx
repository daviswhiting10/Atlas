"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { format, parseISO } from "date-fns";
import { ArrowRight, Search, TrendingUp, X } from "lucide-react";
import type { ExerciseProgress, ProgressData } from "@/lib/athlete/data";
import type { FocusMetric } from "@/lib/plan/generator";
import { METRICS, formatValue, metricFor, unitFor } from "@/lib/plan/overload";
import { overallProgress } from "@/lib/progress/overall";
import { OverallChart } from "./OverallChart";
import { ProgressChart } from "./ProgressChart";
import { StatRow } from "./StatRow";
import { cn } from "@/lib/utils";

const ORDER: FocusMetric[] = ["weight", "reps", "e1rm", "volume"];
const day = (iso: string) => format(parseISO(iso), "MMM d");

/** Search the athlete's exercises; picking one opens its chart. */
function ExerciseSearch({ exercises, value, onChange }: { exercises: ExerciseProgress[]; value: string | null; onChange: (id: string | null) => void }) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const selected = exercises.find((e) => e.exerciseId === value) ?? null;
  // Most-trained first, so an empty search shows the lifts that matter.
  const ranked = useMemo(() => [...exercises].sort((a, b) => b.series.length - a.series.length), [exercises]);
  const q = query.trim().toLowerCase();
  const matches = (q ? ranked.filter((e) => e.name.toLowerCase().includes(q)) : ranked).slice(0, 8);

  function pick(id: string) {
    onChange(id);
    setQuery("");
    setOpen(false);
    inputRef.current?.blur();
  }

  return (
    <div className="relative">
      <div className="flex h-12 items-center gap-2 rounded-xl border border-line bg-white px-3.5 focus-within:border-ink/40">
        <Search className="h-4 w-4 shrink-0 text-ink-mute" />
        <input
          ref={inputRef}
          role="combobox"
          aria-expanded={open}
          aria-controls="exercise-options"
          aria-label="Search exercises"
          value={open ? query : selected?.name ?? ""}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 120)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && matches[0]) {
              e.preventDefault();
              pick(matches[0].exerciseId);
            }
            if (e.key === "Escape") inputRef.current?.blur();
          }}
          placeholder={`Look at one exercise (${exercises.length})`}
          className="min-w-0 flex-1 bg-transparent text-[15px] text-ink outline-none placeholder:text-ink-mute"
        />
        {selected && !open && (
          <button type="button" onClick={() => onChange(null)} aria-label="Clear" className="press flex h-7 w-7 items-center justify-center rounded-full text-ink-mute hover:bg-ink/5 hover:text-ink">
            <X className="h-4 w-4" />
          </button>
        )}
      </div>
      {open && (
        <ul id="exercise-options" role="listbox" className="absolute inset-x-0 top-[52px] z-20 max-h-80 overflow-y-auto rounded-xl border border-line bg-white p-1 shadow-lg">
          {matches.length === 0 ? (
            <li className="px-3 py-2.5 text-sm text-ink-mute">No exercise matches &ldquo;{query}&rdquo;</li>
          ) : (
            matches.map((e) => (
              <li key={e.exerciseId} role="option" aria-selected={e.exerciseId === value}>
                <button
                  type="button"
                  onMouseDown={(ev) => ev.preventDefault()}
                  onClick={() => pick(e.exerciseId)}
                  className="press flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2.5 text-left hover:bg-ink/5"
                >
                  <span className="truncate text-[15px] text-ink">{e.name}</span>
                  <span className="shrink-0 text-xs text-ink-mute">
                    {e.series.length} session{e.series.length === 1 ? "" : "s"}
                  </span>
                </button>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}

export function ProgressView({
  data,
  goalMetric,
  emptyAction = { href: "/today", label: "Log your first workout" },
  totals = true,
  records = true,
}: {
  data: ProgressData;
  goalMetric: FocusMetric;
  /** Where the empty state points: the athlete starts a workout, a coach logs one for the client. */
  emptyAction?: { href: string; label: string };
  /** The workouts / sets / records / streak row. Off where the page already shows those numbers. */
  totals?: boolean;
  /** Personal records at the end. Off where they have their own tab (the coach's client page). */
  records?: boolean;
}) {
  const [exerciseId, setExerciseId] = useState<string | null>(null);
  const [chosen, setChosen] = useState<FocusMetric>(goalMetric);
  const overall = useMemo(() => overallProgress(data.exercises), [data.exercises]);

  const exercise = data.exercises.find((e) => e.exerciseId === exerciseId) ?? null;
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

  if (data.exercises.length === 0) {
    return (
      <div className="rise rise-1">
        <ProgressChart series={[]} metric={goalMetric} loaded height={260} legend={false} />
        <Link href={emptyAction.href} className="press mt-6 inline-flex h-12 items-center gap-2 rounded-xl bg-ink px-6 text-[15px] font-semibold text-white hover:bg-ink/85">
          {emptyAction.label} <ArrowRight className="h-4 w-4" />
        </Link>
      </div>
    );
  }

  const unit = exercise ? unitFor(metric, exercise.loaded, exercise.timed) : "";
  const anyLoaded = data.exercises.some((e) => e.loaded);

  return (
    <div className="space-y-10">
      {totals && (
        <StatRow
          className="rise rise-1"
          stats={[
            { label: "Workouts", value: String(data.totals.sessions) },
            { label: "Sets", value: data.totals.sets.toLocaleString() },
            { label: "Records", value: String(data.totals.prs) },
            { label: "Streak", value: String(data.totals.streak), unit: data.totals.streak === 1 ? "week" : "weeks" },
          ]}
        />
      )}

      {/* ── At a glance: every lift at once ──────────────────────────── */}
      <section className="rise rise-2">
        <h2 className="text-3xl leading-none text-ink">Overall progress</h2>
        {overall.change != null && overall.since ? (
          <>
            <div className="mt-6 flex flex-wrap items-end gap-x-10 gap-y-3">
              <p className={cn("text-5xl font-semibold leading-none tracking-tight", overall.change > 0 ? "text-signal" : "text-ink")}>
                {overall.change > 0 ? "+" : ""}
                {overall.change}%
              </p>
              <p className="pb-0.5 text-sm text-ink-soft">
                across {overall.lifts} exercise{overall.lifts === 1 ? "" : "s"} since {day(overall.since)} · {anyLoaded ? "estimated 1-rep max" : "best reps"}
              </p>
            </div>
            <div className="mt-6">
              <OverallChart points={overall.points} height={280} />
            </div>
          </>
        ) : (
          <p className="rule mt-5 pt-4 text-[15px] leading-relaxed text-ink-soft">
            Starts once an exercise is logged twice.
          </p>
        )}
      </section>

      {/* ── One exercise, on demand ──────────────────────────────────── */}
      <section className="rise rise-3 rule relative z-10 pt-8">
        <ExerciseSearch exercises={data.exercises} value={exerciseId} onChange={setExerciseId} />

        {exercise && (
          <div className="fade-in">
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
                timed={exercise.timed}
                target={exercise.target}
                height={280}
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
          </div>
        )}
      </section>

      {records && (
        <section className="rise rise-4 rule pt-8">
          <h2 className="text-xl text-ink">Personal records</h2>
          <RecordsList prs={data.recentPRs.slice(0, 6)} />
        </section>
      )}
    </div>
  );
}

/** Personal records, newest first: the best weight on each exercise. */
export function RecordsList({ prs }: { prs: ProgressData["recentPRs"] }) {
  if (prs.length === 0) return <p className="rule mt-4 pt-4 text-[15px] text-ink-soft">None yet.</p>;
  return (
    <ul className="rule mt-4 divide-y divide-line">
      {prs.map((r, i) => (
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
  );
}
