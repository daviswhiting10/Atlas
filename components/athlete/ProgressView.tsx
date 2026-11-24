"use client";

import { overlayBox, useSheetLock } from "@/hooks/use-sheet-lock";
import { useEffect, useMemo, useRef, useState } from "react";
import { format, parseISO } from "date-fns";
import { ChevronDown, Search, X } from "lucide-react";
import type { ExerciseProgress, ProgressData } from "@/lib/athlete/data";
import type { FocusMetric } from "@/lib/plan/generator";
import { formatValue, metricFor, shortFor, unitFor } from "@/lib/plan/overload";
import { overallProgress, type Overall } from "@/lib/progress/overall";
import type { SessionPoint } from "@/lib/plan/overload";
import { defaultLift } from "@/lib/progress/default-lift";
import { cn } from "@/lib/utils";
import { ExerciseName } from "@/components/ExerciseName";
import { useEscape } from "@/hooks/use-escape";
// The charts (recharts, the heaviest code on this screen) load after the page, not with it. A plain effect and state, not
// Suspense: React holds back a Suspense reveal for 300 ms even when the code is already there, and a pick should not wait.
function useLoaded<C>(load: () => Promise<C>, enabled: boolean): C | null {
  const [C, setC] = useState<C | null>(null);
  useEffect(() => {
    if (!enabled || C) return;
    let live = true;
    load().then((c) => live && setC(() => c));
    return () => {
      live = false;
    };
  }, [enabled, C, load]);
  return C;
}
const loadOverall = () => import("./OverallChart").then((m) => m.OverallChart);
const loadProgress = () => import("./ProgressChart").then((m) => m.ProgressChart);
/** The chart's own height, so nothing moves when it arrives. */
const ChartSpace = () => <div className="h-[200px]" aria-busy />;

const day = (iso: string) => format(parseISO(iso), "MMM d");

/** Lifts with at least this many sessions get charts; fewer is too thin to draw a line through. */
const THIN = 3;

/** "All lifts ▾": a sheet with a search box and every lift, most-trained first. */
function LiftSheet({ exercises, value, onChange, onClose }: { exercises: ExerciseProgress[]; value: string | null; onChange: (id: string | null) => void; onClose: () => void }) {
  const vp = useSheetLock();
  const box = overlayBox(vp);
  const [query, setQuery] = useState("");
  const ranked = useMemo(() => [...exercises].sort((a, b) => (b.count ?? b.series.length) - (a.count ?? a.series.length)), [exercises]);
  const q = query.trim().toLowerCase();
  const matches = q ? ranked.filter((e) => e.name.toLowerCase().includes(q)) : ranked;
  const pick = (id: string | null) => {
    onChange(id);
    onClose();
  };
  useEscape(true, onClose);
  return (
    <div className={`fade-in fixed z-50 ${box.className} flex items-end bg-night/50 backdrop-blur-sm`} style={box.style} onClick={onClose}>
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
export function ProgressView({ data, goalMetric, history, overall: given, loadSeries, records = true, compact = false }: { data: ProgressData; goalMetric: FocusMetric; history?: React.ReactNode; /** Home: tighter, so the heatmap fits the first screen. */ compact?: boolean; /** False on Home: the latest record stays on Progress. */ records?: boolean; /** The overall line, when the server worked it out (then `data.exercises` need not carry their series). */ overall?: Overall; /** Fetches one lift's history when it is picked, for exercises sent without it. */ loadSeries?: (input: { exerciseIds: string[] }) => Promise<Record<string, SessionPoint[]>> }) {
  // Opens on the lift done most (its curve and its lighter weeks); "All lifts" is in the chooser.
  const [exerciseId, setExerciseId] = useState<string | null>(() => defaultLift(data.exercises, THIN));
  const [sheet, setSheet] = useState(false);
  const overall = useMemo(() => given ?? overallProgress(data.exercises), [given, data.exercises]);
  const picked = data.exercises.find((e) => e.exerciseId === exerciseId) ?? null;
  // A lift sent without its history gets it from the server: all of them when the chooser opens (so a pick is usually
  // instant by the time one is made), or just the picked one if that comes first.
  const [fetched, setFetched] = useState<Record<string, SessionPoint[]>>({});
  const asked = useRef(new Set<string>());
  const fetchSeries = (ids: string[]) => {
    const fresh = ids.filter((id) => !asked.current.has(id));
    if (fresh.length === 0 || !loadSeries) return;
    fresh.forEach((id) => asked.current.add(id));
    loadSeries({ exerciseIds: fresh }).then(
      (r) => setFetched((f) => ({ ...f, ...r })),
      () => fresh.forEach((id) => asked.current.delete(id))
    );
  };
  const needs = picked != null && picked.series.length === 0 && (picked.count ?? 0) > 0 && fetched[picked.exerciseId] == null && loadSeries != null;
  useEffect(() => {
    if (needs && picked) fetchSeries([picked.exerciseId]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [needs, picked]);
  useEffect(() => {
    // Opening the chooser is the sign a lift is about to be picked: its history starts loading now (and its chart code, below).
    if (sheet) fetchSeries(data.exercises.filter((e) => e.series.length === 0 && (e.count ?? 0) > 0).map((e) => e.exerciseId));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sheet]);
  const exercise = useMemo(() => (picked ? { ...picked, series: picked.series.length ? picked.series : (fetched[picked.exerciseId] ?? []) } : null), [picked, fetched]);
  const loading = needs;
  const metric = exercise ? metricFor(goalMetric, exercise.series) : goalMetric;
  const OverallC = useLoaded(loadOverall, true);
  const ProgressC = useLoaded(loadProgress, sheet || exercise != null);

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
  const record = records ? (data.recentPRs[0] ?? null) : null;
  const chooser =
    data.exercises.length > 0 ? (
      <button type="button" onClick={() => setSheet(true)} className="press inline-flex min-h-11 items-center gap-1 text-[15px] font-medium text-ink-soft hover:text-ink">
        <span className="max-w-[180px] truncate">{exercise?.name ?? "All lifts"}</span> <ChevronDown className="h-4 w-4" />
      </button>
    ) : undefined;

  // Nothing logged yet: nothing to show.
  if (sessions === 0) return null;

  return (
    <div className={compact ? "space-y-5" : "space-y-14"}>
      {exercise ? (
        <Section title="Strength" control={chooser}>
          {loading && <div className="h-[56px]" aria-busy />}
          {one && (
            <Big
              value={one.change != null && one.sessions >= THIN ? `${one.change > 0 ? "+" : ""}${one.change}%` : formatValue(one.latest, metric)}
              label={one.change != null && one.sessions >= THIN ? shortFor(metric, exercise.timed) : unitFor(metric, exercise.loaded, exercise.timed)}
              accent={one.change != null && one.change > 0 && one.sessions >= THIN}
            />
          )}
          {loading && <div className="mt-5 h-[200px]" aria-busy />}
          {exercise.series.length >= THIN && (
            <div className="mt-5">
              {ProgressC ? <ProgressC series={exercise.series} metric={metric} loaded={exercise.loaded} timed={exercise.timed} height={compact ? 130 : 200} legend={false} chartKey={`${exercise.exerciseId}-${metric}`} /> : <ChartSpace />}
            </div>
          )}
        </Section>
      ) : (
        overall.change != null &&
        overall.since && (
          <Section title="Strength" control={chooser}>
            <Big value={`${overall.change > 0 ? "+" : ""}${overall.change}%`} label={`since the week of ${day(overall.since)}`} accent={overall.change > 0} />
            {sessions >= THIN && (
              <div className="mt-5">
                {OverallC ? <OverallC points={overall.points} height={compact ? 130 : 200} /> : <ChartSpace />}
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
