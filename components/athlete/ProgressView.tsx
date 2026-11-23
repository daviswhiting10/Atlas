"use client";

import { useMemo, useState } from "react";
import { format, parseISO } from "date-fns";
import { ChevronDown, Search, X } from "lucide-react";
import type { ExerciseProgress, ProgressData } from "@/lib/athlete/data";
import type { FocusMetric } from "@/lib/plan/generator";
import { formatValue, metricFor, shortFor, unitFor } from "@/lib/plan/overload";
import { overallProgress } from "@/lib/progress/overall";
import { defaultLift } from "@/lib/progress/default-lift";
import { OverallChart } from "./OverallChart";
import { ProgressChart } from "./ProgressChart";
import { cn } from "@/lib/utils";
import { ExerciseName } from "@/components/ExerciseName";
import { useEscape } from "@/hooks/use-escape";

const day = (iso: string) => format(parseISO(iso), "MMM d");

/** Lifts with at least this many sessions get charts; fewer is too thin to draw a line through. */
const THIN = 3;

/** "All lifts ▾": a sheet with a search box and every lift, most-trained first. */
function LiftSheet({ exercises, value, onChange, onClose }: { exercises: ExerciseProgress[]; value: string | null; onChange: (id: string | null) => void; onClose: () => void }) {
  const [query, setQuery] = useState("");
  const ranked = useMemo(() => [...exercises].sort((a, b) => b.series.length - a.series.length), [exercises]);
  const q = query.trim().toLowerCase();
  const matches = q ? ranked.filter((e) => e.name.toLowerCase().includes(q)) : ranked;
  const pick = (id: string | null) => {
    onChange(id);
    onClose();
  };
  useEscape(true, onClose);
  return (
    <div className="fade-in fixed inset-0 z-50 flex items-end bg-night/50 backdrop-blur-sm" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Choose a lift"
        onClick={(e) => e.stopPropagation()}
        className="sheet-up flex max-h-[80vh] w-full flex-col rounded-t-[24px] border-t border-line bg-bone px-4 pt-3 sm:mx-auto sm:max-w-md sm:rounded-[24px]"
        style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 16px)" }}
      >
        <div className="flex items-center gap-2">
          <label className="flex h-12 min-w-0 flex-1 items-center gap-2 rounded-xl border border-line-strong bg-dusk-raised px-3.5 focus-within:border-ink/40">
            <Search className="h-4 w-4 shrink-0 text-ink-mute" />
            <span className="sr-only">Search lifts</span>
            <input autoFocus value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search" className="min-w-0 flex-1 bg-transparent text-[16px] text-ink outline-none placeholder:text-ink-mute" />
          </label>
          <button type="button" onClick={onClose} aria-label="Close" className="press flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-ink-soft">
            <X className="h-5 w-5" />
          </button>
        </div>
        <ul className="mt-2 min-h-0 flex-1 divide-y divide-line overflow-y-auto">
          {!q && (
            <li>
              <button type="button" onClick={() => pick(null)} className={cn("press flex min-h-[52px] w-full items-center text-left text-[16px] font-semibold", value == null ? "text-signal" : "text-ink")}>
                All lifts
              </button>
            </li>
          )}
          {matches.map((e) => (
            <li key={e.exerciseId}>
              <button type="button" onClick={() => pick(e.exerciseId)} className={cn("press flex min-h-[52px] w-full items-center text-left text-[16px] font-semibold", e.exerciseId === value ? "text-signal" : "text-ink")}>
                <ExerciseName name={e.name} inControl />
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

/** A section: one small heading (with an optional control on the right), then one visual. */
function Section({ title, control, children }: { title: string; control?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section>
      <div className="mb-3 flex min-h-11 items-center justify-between gap-3">
        <h2 className="text-[13px] font-semibold uppercase tracking-[0.1em] text-ink-mute">{title}</h2>
        {control}
      </div>
      {children}
    </section>
  );
}

/** Big number, tiny label. */
function Big({ value, label, accent = false }: { value: string; label?: string; accent?: boolean }) {
  return (
    <p className="flex items-baseline gap-2">
      <span className={cn("text-[56px] font-semibold leading-none tracking-[-0.04em]", accent ? "text-signal" : "text-ink")}>{value}</span>
      {label && <span className="text-[15px] font-medium text-ink-mute">{label}</span>}
    </p>
  );
}

/**
 * Progress, for the athlete and for the coach's view of a client. Three sections, each one
 * heading and one visual: Strength (all lifts, or one picked from a sheet), History (the
 * calendar, passed in as `history`; the coach has it on the Sessions tab instead), and the
 * latest record. A section with nothing to show renders nothing, heading included (no
 * overall line yet means no Strength section): never a chart of two points or a row of zeros.
 */
export function ProgressView({ data, goalMetric, history }: { data: ProgressData; goalMetric: FocusMetric; history?: React.ReactNode }) {
  // Opens on the lift done most (its curve and its lighter weeks); "All lifts" is in the chooser.
  const [exerciseId, setExerciseId] = useState<string | null>(() => defaultLift(data.exercises, THIN));
  const [sheet, setSheet] = useState(false);
  const overall = useMemo(() => overallProgress(data.exercises), [data.exercises]);
  const exercise = data.exercises.find((e) => e.exerciseId === exerciseId) ?? null;
  const metric = exercise ? metricFor(goalMetric, exercise.series) : goalMetric;

  const one = useMemo(() => {
    if (!exercise) return null;
    // A deload session is low on purpose, so it is left out of the change.
    const counted = exercise.series.filter((p) => !p.deload && p[metric] != null);
    if (counted.length === 0) return null;
    const first = counted[0][metric] as number;
    const latest = counted[counted.length - 1][metric] as number;
    return { latest, change: counted.length > 1 && first ? Math.round(((latest - first) / first) * 100) : null, sessions: counted.length };
  }, [exercise, metric]);

  const sessions = data.totals.sessions;
  const record = data.recentPRs[0] ?? null;
  const chooser =
    data.exercises.length > 0 ? (
      <button type="button" onClick={() => setSheet(true)} className="press inline-flex min-h-11 items-center gap-1 text-[15px] font-medium text-ink-soft hover:text-ink">
        <span className="max-w-[180px] truncate">{exercise?.name ?? "All lifts"}</span> <ChevronDown className="h-4 w-4" />
      </button>
    ) : undefined;

  // Nothing logged yet: nothing to show.
  if (sessions === 0) return null;

  return (
    <div className="space-y-14">
      {exercise ? (
        <Section title="Strength" control={chooser}>
          {one && (
            <Big
              value={one.change != null && one.sessions >= THIN ? `${one.change > 0 ? "+" : ""}${one.change}%` : formatValue(one.latest, metric)}
              label={one.change != null && one.sessions >= THIN ? shortFor(metric, exercise.timed) : unitFor(metric, exercise.loaded, exercise.timed)}
              accent={one.change != null && one.change > 0 && one.sessions >= THIN}
            />
          )}
          {exercise.series.length >= THIN && (
            <div className="mt-5">
              <ProgressChart series={exercise.series} metric={metric} loaded={exercise.loaded} timed={exercise.timed} height={200} legend={false} chartKey={`${exercise.exerciseId}-${metric}`} />
            </div>
          )}
        </Section>
      ) : (
        overall.change != null &&
        overall.since && (
          <Section title="Strength" control={chooser}>
            <Big value={`${overall.change > 0 ? "+" : ""}${overall.change}%`} label={`since ${day(overall.since)}`} accent={overall.change > 0} />
            {sessions >= THIN && (
              <div className="mt-5">
                <OverallChart points={overall.points} height={200} />
              </div>
            )}
          </Section>
        )
      )}

      {history}

      {record && (
        <Section title="Records">
          <div className="flex items-baseline justify-between gap-3 border-t border-line py-3.5">
            <ExerciseName name={record.exercise} className="text-[17px] font-semibold text-ink" />
            <span className="shrink-0 text-[17px] text-ink-soft">
              {formatValue(record.value, "weight")} {record.unit} · {day(record.date)}
            </span>
          </div>
        </Section>
      )}

      {sheet && <LiftSheet exercises={data.exercises} value={exerciseId} onChange={setExerciseId} onClose={() => setSheet(false)} />}
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
          <ExerciseName name={r.exercise} className="flex-1 text-[15px] text-ink" />
          <span className="shrink-0 text-[13px] text-ink-mute">{day(r.date)}</span>
          <span className="w-20 shrink-0 text-right text-[15px] font-semibold text-ink">
            {formatValue(r.value, "weight")} <span className="text-xs font-normal text-ink-mute">{r.unit}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}
