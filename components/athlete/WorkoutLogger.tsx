"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { format, parseISO } from "date-fns";
import { ArrowLeft, ArrowRight, Check, ChevronsUpDown, Loader2, Medal, Minus, Plus, Timer, TrendingUp, X } from "lucide-react";
import type { LoggerData, LoggerExercise, LoggerSet } from "@/lib/athlete/data";
import { finishWorkout, saveSet } from "@/lib/actions/athlete";
import { METRICS, formatValue, buildSeries, isRecord, metricFor, sessionPoint } from "@/lib/plan/overload";
import { ProgressChart } from "./ProgressChart";
import { cn } from "@/lib/utils";

type SetMap = Record<string, LoggerSet[]>;

const clock = (totalSeconds: number) => {
  const s = Math.max(0, Math.round(totalSeconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

// ── Stepper ─────────────────────────────────────────────────────────────────

function Stepper({
  value,
  step,
  unit,
  label,
  onChange,
  dim,
}: {
  value: number | null;
  step: number;
  unit: string;
  label: string;
  onChange: (v: number | null) => void;
  dim: boolean;
}) {
  const bump = (dir: 1 | -1) => {
    const next = value == null ? (dir === 1 ? step : 0) : Math.max(0, Math.round((value + dir * step) * 100) / 100);
    onChange(next);
  };
  return (
    <div className={cn("flex h-[52px] min-w-0 flex-1 items-center rounded-2xl border bg-white transition-colors", dim ? "border-signal/25 bg-signal/[0.04]" : "border-line")}>
      <button type="button" onClick={() => bump(-1)} aria-label={`Decrease ${label}`} className="press flex h-full w-10 shrink-0 items-center justify-center text-ink-mute hover:text-ink">
        <Minus className="h-4 w-4" />
      </button>
      <label className="flex min-w-0 flex-1 flex-col items-center">
        <input
          type="number"
          inputMode="decimal"
          min={0}
          step={step}
          value={value ?? ""}
          placeholder="–"
          aria-label={label}
          onChange={(e) => onChange(e.target.value === "" ? null : Math.max(0, Number(e.target.value)))}
          onFocus={(e) => e.target.select()}
          className="tnum w-full bg-transparent text-center text-lg font-semibold leading-none text-ink outline-none [appearance:textfield] placeholder:text-ink-mute/50 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
        />
        <span className="mt-0.5 text-[10px] font-medium uppercase tracking-wide text-ink-mute">{unit}</span>
      </label>
      <button type="button" onClick={() => bump(1)} aria-label={`Increase ${label}`} className="press flex h-full w-10 shrink-0 items-center justify-center text-ink-mute hover:text-ink">
        <Plus className="h-4 w-4" />
      </button>
    </div>
  );
}

// ── Logger ──────────────────────────────────────────────────────────────────

export function WorkoutLogger({ data }: { data: LoggerData }) {
  const router = useRouter();
  const [sets, setSetsState] = useState<SetMap>(() => Object.fromEntries(data.exercises.map((e) => [e.aweId, e.sets])));
  const setsRef = useRef(sets);
  const [index, setIndex] = useState(() => {
    const i = data.exercises.findIndex((e) => e.sets.some((s) => !s.done));
    return i === -1 ? 0 : i;
  });
  const [rest, setRest] = useState<{ endsAt: number; total: number } | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [records, setRecords] = useState<Record<string, string>>({});
  const [switching, setSwitching] = useState(false);
  const [summary, setSummary] = useState<null | { minutes: number }>(null);
  const [finishing, startFinish] = useTransition();
  const startedAt = useRef(Date.now());
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  const debounce = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const railRef = useRef<HTMLDivElement>(null);

  const apply = useCallback((next: SetMap) => {
    setsRef.current = next;
    setSetsState(next);
  }, []);

  // Escape closes the workout switcher.
  useEffect(() => {
    if (!switching) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setSwitching(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [switching]);

  // One clock drives the elapsed time and the rest countdown.
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (rest && now >= rest.endsAt) {
      setRest(null);
      if (typeof navigator !== "undefined" && "vibrate" in navigator) navigator.vibrate?.([120, 60, 120]);
    }
  }, [now, rest]);

  useEffect(() => {
    const rail = railRef.current;
    const el = rail?.querySelector<HTMLElement>("[data-active=true]");
    if (rail && el) rail.scrollTo({ left: el.offsetLeft - rail.clientWidth / 2 + el.clientWidth / 2, behavior: "smooth" });
  }, [index]);

  // Saves run one at a time, in order, so the first set of a workout always
  // creates the log before the second one looks for it.
  const persist = useCallback(
    (aweId: string, setNumber: number) => {
      queue.current = queue.current.then(async () => {
        const s = setsRef.current[aweId]?.find((x) => x.setNumber === setNumber);
        if (!s || (!s.done && !s.setLogId)) return;
        try {
          const res = await saveSet({
            assignedWorkoutId: data.id,
            aweId,
            setNumber,
            weight: s.weight,
            reps: s.reps,
            done: s.done,
            setLogId: s.setLogId,
          });
          apply({
            ...setsRef.current,
            [aweId]: setsRef.current[aweId].map((x) => (x.setNumber === setNumber ? { ...x, setLogId: res.setLogId } : x)),
          });
        } catch {
          // A set that never reached the server must not keep looking done.
          if (!s.setLogId) {
            apply({
              ...setsRef.current,
              [aweId]: setsRef.current[aweId].map((x) => (x.setNumber === setNumber ? { ...x, done: false } : x)),
            });
            setRecords((r) => Object.fromEntries(Object.entries(r).filter(([k]) => k !== `${aweId}:${setNumber}`)));
          }
          toast.error("Couldn't save that set. Check your connection and tap it again.");
        }
      });
    },
    [apply, data.id]
  );

  const deloadWeek = data.deloadWeek;
  const exercise = data.exercises[index];
  const current = sets[exercise.aweId];

  function edit(ex: LoggerExercise, i: number, patch: Partial<Pick<LoggerSet, "weight" | "reps">>) {
    const list = setsRef.current[ex.aweId];
    const before = list[i];
    const next = list.map((s, j) => {
      if (j === i) return { ...s, ...patch };
      // Carry a weight change forward to the sets you haven't done yet.
      if (j > i && !s.done && patch.weight !== undefined && s.weight === before.weight) return { ...s, weight: patch.weight };
      return s;
    });
    apply({ ...setsRef.current, [ex.aweId]: next });
    if (before.done) {
      const key = `${ex.aweId}:${before.setNumber}`;
      clearTimeout(debounce.current[key]);
      debounce.current[key] = setTimeout(() => persist(ex.aweId, before.setNumber), 500);
    }
  }

  function toggle(ex: LoggerExercise, i: number) {
    const list = setsRef.current[ex.aweId];
    const s = list[i];
    const done = !s.done;
    if (done && (s.reps == null || s.reps <= 0)) {
      toast(`Enter your ${ex.unit === "secs" ? "time" : "reps"} first`);
      return;
    }
    // A loaded lift saved without a weight would be charted as bodyweight.
    if (done && ex.loaded && !s.weight) {
      toast("Enter the weight first");
      return;
    }
    const next = list.map((x, j) => (j === i ? { ...x, done } : x));
    apply({ ...setsRef.current, [ex.aweId]: next });
    persist(ex.aweId, s.setNumber);

    const key = `${ex.aweId}:${s.setNumber}`;
    if (!done) {
      setRecords((r) => Object.fromEntries(Object.entries(r).filter(([k]) => k !== key)));
      return;
    }

    // Personal record? Same rule as the charts (isRecord): the heaviest weight
    // yet on a loaded lift, or the next 5-rep step on bodyweight work — judged
    // against all history and anything already done today.
    const earlier = list.filter((x, j) => j !== i && x.done);
    const best = {
      weight: Math.max(0, ...ex.history.map((p) => p.weight ?? 0), ...earlier.map((x) => x.weight ?? 0)),
      reps: Math.max(0, ...ex.history.map((p) => p.reps), ...earlier.map((x) => x.reps ?? 0)),
    };
    const mine = { weight: ex.loaded ? s.weight : null, reps: s.reps ?? 0 };
    if (ex.history.length > 0 && !deloadWeek && isRecord(mine, best)) {
      const label = mine.weight != null ? `${mine.weight} lb` : `${mine.reps} ${ex.unit === "secs" ? "sec" : "reps"}`;
      setRecords((r) => ({ ...r, [key]: label }));
      toast.success(`New record on ${ex.name}`, { description: label });
    }

    const everythingDone = data.exercises.every((e) => setsRef.current[e.aweId].every((x) => x.done));
    if (!everythingDone) setRest({ endsAt: Date.now() + ex.restSeconds * 1000, total: ex.restSeconds });
    else setRest(null);
  }

  function addSet(ex: LoggerExercise) {
    const list = setsRef.current[ex.aweId];
    const last = list[list.length - 1];
    apply({
      ...setsRef.current,
      [ex.aweId]: [...list, { setNumber: list.length + 1, weight: last?.weight ?? null, reps: last?.reps ?? ex.repMin, done: false, setLogId: null }],
    });
  }

  function finish() {
    startFinish(async () => {
      try {
        await queue.current;
        const minutes = Math.max(1, Math.round((Date.now() - startedAt.current) / 60000));
        await finishWorkout({ assignedWorkoutId: data.id, durationMin: data.status === "LOGGED" ? undefined : minutes });
        setRest(null);
        setSummary({ minutes });
      } catch {
        toast.error("Couldn't finish the workout. Please try again.");
      }
    });
  }

  // ── Derived numbers ───────────────────────────────────────────────────────
  const all = data.exercises.flatMap((e) => sets[e.aweId]);
  const doneCount = all.filter((s) => s.done).length;
  const totalCount = all.length;
  const volume = Math.round(all.reduce((sum, s) => (s.done && s.reps ? sum + (s.weight ?? 0) * s.reps : sum), 0));
  const exerciseDone = (e: LoggerExercise) => sets[e.aweId].every((s) => s.done);
  const isLast = index === data.exercises.length - 1;
  const nextExercise = data.exercises[index + 1];

  const today = new Date().toLocaleDateString("en-CA"); // yyyy-mm-dd in the athlete's own timezone
  const { series, metric } = useMemo(() => {
    const live = sessionPoint(today, current.map((s) => ({ weight: s.weight, reps: s.reps, completed: s.done })), deloadWeek);
    const series = buildSeries(live ? [...exercise.history, live] : exercise.history);
    return { series, metric: metricFor(data.metric, series.length > 0 ? series : exercise.history) };
  }, [current, exercise.history, data.metric, today, deloadWeek]);
  const metricName = !exercise.loaded && (data.metric === "weight" || data.metric === "e1rm") ? "reps" : metric;
  const latest = series.at(-1)?.[metricName];

  const restLeft = rest ? (rest.endsAt - now) / 1000 : 0;
  const elapsed = (now - startedAt.current) / 1000;

  // ── Summary ───────────────────────────────────────────────────────────────
  if (summary) {
    const recordList = Object.entries(records);
    return (
      <div className="rise mx-auto max-w-xl pt-6 text-center md:pt-12">
        <span className="pop mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-signal text-white">
          <Check className="h-8 w-8" strokeWidth={3} />
        </span>
        <h1 className="mt-6 font-display text-5xl text-ink">{data.name}, done.</h1>
        <p className="mt-2 text-[15px] text-ink-soft">Every set you logged is already on your charts.</p>

        <div className="mt-8 grid grid-cols-3 gap-3">
          {[
            [String(doneCount), "sets"],
            [volume >= 10000 ? `${(volume / 1000).toFixed(1)}k` : volume.toLocaleString(), "lb moved"],
            [String(summary.minutes), "minutes"],
          ].map(([value, label]) => (
            <div key={label} className="surface p-4">
              <p className="tnum font-display text-4xl leading-none text-ink">{value}</p>
              <p className="mt-1.5 text-[13px] text-ink-mute">{label}</p>
            </div>
          ))}
        </div>

        {recordList.length > 0 && (
          <div className="surface mt-3 p-5 text-left">
            <p className="eyebrow flex items-center gap-1.5 text-gold">
              <Medal className="h-3.5 w-3.5" /> {recordList.length} new record{recordList.length > 1 ? "s" : ""}
            </p>
            <ul className="mt-3 space-y-2">
              {recordList.map(([key, label]) => {
                const ex = data.exercises.find((e) => key.startsWith(e.aweId));
                return (
                  <li key={key} className="flex items-baseline justify-between gap-3 text-[15px]">
                    <span className="truncate font-medium text-ink">{ex?.name}</span>
                    <span className="tnum shrink-0 text-ink-soft">{label}</span>
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        <div className="mt-6 flex flex-col gap-3 sm:flex-row">
          <Link href="/progress" className="press flex h-14 flex-1 items-center justify-center gap-2 rounded-2xl bg-ink text-base font-semibold text-white hover:bg-ink/85">
            <TrendingUp className="h-4 w-4" /> See your progress
          </Link>
          <Link href="/today" className="press flex h-14 flex-1 items-center justify-center rounded-2xl border border-line bg-white text-base font-semibold text-ink hover:border-ink/20">
            Back to today
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="-mt-5 md:mt-0">
      {/* ── Header ───────────────────────────────────────────────────── */}
      <div className="sticky top-0 z-20 -mx-4 border-b border-line bg-bone/90 px-4 pb-3 pt-3 backdrop-blur-xl sm:-mx-8 sm:px-8 md:top-16">
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => router.push("/today")} aria-label="Back to today" className="press -ml-2 flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-ink-soft hover:bg-ink/5">
            <ArrowLeft className="h-5 w-5" />
          </button>
          <button type="button" onClick={() => setSwitching(true)} className="press flex min-w-0 flex-1 items-center gap-1.5 rounded-xl py-1 text-left">
            <span className="min-w-0">
              <span className="block truncate font-display text-2xl leading-tight text-ink">{data.name}</span>
              <span className="tnum block text-xs text-ink-mute">
                Week {data.week} · {doneCount}/{totalCount} sets{data.status === "LOGGED" ? " · logged" : ` · ${clock(elapsed)}`}
              </span>
            </span>
            <ChevronsUpDown className="h-4 w-4 shrink-0 text-ink-mute" />
          </button>
          <button
            type="button"
            onClick={finish}
            disabled={finishing || doneCount === 0}
            className="press flex h-10 shrink-0 items-center gap-1.5 rounded-full bg-ink px-4 text-sm font-semibold text-white hover:bg-ink/85 disabled:opacity-30"
          >
            {finishing ? <Loader2 className="h-4 w-4 animate-spin" /> : "Finish"}
          </button>
        </div>
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-ink/10">
          <div className="h-full rounded-full bg-signal transition-[width] duration-500 ease-out" style={{ width: `${totalCount ? (doneCount / totalCount) * 100 : 0}%` }} />
        </div>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[250px_minmax(0,1fr)] lg:gap-8">
        {/* ── Exercise rail ──────────────────────────────────────────── */}
        <div ref={railRef} className="no-scrollbar relative -mx-4 flex min-w-0 gap-2 overflow-x-auto px-4 sm:-mx-8 sm:px-8 lg:sticky lg:top-44 lg:mx-0 lg:flex-col lg:self-start lg:overflow-visible lg:px-0" role="tablist" aria-label="Exercises">
          {data.exercises.map((e, i) => {
            const done = exerciseDone(e);
            const active = i === index;
            const count = sets[e.aweId].filter((s) => s.done).length;
            return (
              <button
                key={e.aweId}
                type="button"
                role="tab"
                aria-selected={active}
                data-active={active}
                onClick={() => setIndex(i)}
                className={cn(
                  "press flex shrink-0 items-center gap-2.5 rounded-2xl border px-3 py-2.5 text-left lg:w-full",
                  active ? "border-ink bg-ink text-white" : "border-line bg-white text-ink hover:border-ink/20"
                )}
              >
                <span
                  className={cn(
                    "tnum flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
                    done ? "bg-signal text-white" : active ? "bg-white/15 text-white" : "bg-ink/5 text-ink-mute"
                  )}
                >
                  {done ? <Check className="h-3.5 w-3.5" strokeWidth={3} /> : i + 1}
                </span>
                <span className="min-w-0">
                  <span className="block max-w-[150px] truncate text-sm font-semibold lg:max-w-none">{e.name}</span>
                  <span className={cn("tnum hidden text-xs lg:block", active ? "text-white/60" : "text-ink-mute")}>
                    {count}/{sets[e.aweId].length} sets
                  </span>
                </span>
              </button>
            );
          })}
        </div>

        {/* ── Current exercise ───────────────────────────────────────── */}
        <div key={exercise.aweId} className="fade-in min-w-0 space-y-4">
          {index === 0 && data.note && <p className="rounded-2xl bg-gold/10 px-4 py-3 text-sm text-ink-soft">{data.note}</p>}

          <div>
            <p className="eyebrow">
              Exercise {index + 1} of {data.exercises.length}
              {exercise.muscles.length > 0 ? ` · ${exercise.muscles.slice(0, 2).join(", ")}` : ""}
            </p>
            <h1 className="mt-1 font-display text-4xl leading-tight text-ink sm:text-5xl">{exercise.name}</h1>
          </div>

          {/* Target */}
          <div className="surface p-4 sm:p-5">
            <div className="flex items-start gap-3">
              <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-signal text-white">
                <TrendingUp className="h-4 w-4" />
              </span>
              <div className="min-w-0">
                <p className="eyebrow">Today&apos;s target</p>
                <p className="tnum mt-0.5 text-xl font-semibold text-ink">{exercise.target.headline}</p>
                <p className="mt-1 text-sm leading-relaxed text-ink-soft">{exercise.target.reason}</p>
              </div>
            </div>
            {exercise.last && (
              <p className="mt-3 border-t border-line pt-3 text-[13px] text-ink-soft">
                <span className="font-semibold text-ink">Last time</span> · {format(parseISO(exercise.last.date), "MMM d")} ·{" "}
                {exercise.last.sets.map((s) => (s.weight != null ? `${s.weight}×${s.reps}` : `${s.reps}`)).join(", ")}
              </p>
            )}
          </div>

          {/* Sets */}
          <div className="surface p-3 sm:p-4">
            <div className="mb-2 flex items-center justify-between px-1">
              <p className="tnum text-sm font-medium text-ink-soft">
                {current.length} sets · {exercise.repMin === exercise.repMax ? exercise.repMax : `${exercise.repMin}–${exercise.repMax}`} {exercise.unit === "secs" ? "sec" : "reps"}
              </p>
              <p className="tnum flex items-center gap-1 text-[13px] text-ink-mute">
                <Timer className="h-3.5 w-3.5" /> {clock(exercise.restSeconds)} rest
              </p>
            </div>
            <ul className="space-y-2">
              {current.map((s, i) => {
                const record = records[`${exercise.aweId}:${s.setNumber}`];
                return (
                  <li key={s.setNumber}>
                    <div className="flex items-center gap-2">
                      <span className={cn("tnum w-5 shrink-0 text-center text-sm font-semibold", s.done ? "text-signal" : "text-ink-mute")}>{s.setNumber}</span>
                      {exercise.loaded && (
                        <Stepper value={s.weight} step={exercise.increment || 5} unit="lb" label={`Set ${s.setNumber} weight`} dim={s.done} onChange={(v) => edit(exercise, i, { weight: v })} />
                      )}
                      <Stepper
                        value={s.reps}
                        step={exercise.unit === "secs" ? 5 : 1}
                        unit={exercise.unit === "secs" ? "sec" : "reps"}
                        label={`Set ${s.setNumber} ${exercise.unit === "secs" ? "seconds" : "reps"}`}
                        dim={s.done}
                        onChange={(v) => edit(exercise, i, { reps: v == null ? null : Math.round(v) })}
                      />
                      <button
                        type="button"
                        onClick={() => toggle(exercise, i)}
                        aria-pressed={s.done}
                        aria-label={s.done ? `Set ${s.setNumber} done — tap to undo` : `Mark set ${s.setNumber} done`}
                        className={cn(
                          "press flex h-[52px] w-[52px] shrink-0 items-center justify-center rounded-2xl border",
                          s.done ? "border-signal bg-signal text-white" : "border-line bg-white text-ink-mute hover:border-signal hover:text-signal"
                        )}
                      >
                        <Check className={cn("h-6 w-6", s.done && "pop")} strokeWidth={3} />
                      </button>
                    </div>
                    {record && (
                      <p className="fade-in tnum ml-7 mt-1.5 inline-flex items-center gap-1.5 rounded-full bg-gold/15 px-2.5 py-1 text-xs font-semibold text-gold">
                        <Medal className="h-3 w-3" /> New record · {record}
                      </p>
                    )}
                  </li>
                );
              })}
            </ul>
            <button type="button" onClick={() => addSet(exercise)} className="press mt-2 flex h-11 w-full items-center justify-center gap-1.5 rounded-2xl border border-dashed border-ink/15 text-sm font-medium text-ink-mute hover:border-ink/30 hover:text-ink">
              <Plus className="h-4 w-4" /> Add a set
            </button>
          </div>

          {/* Next / finish */}
          <div className="flex gap-2">
            {index > 0 && (
              <button type="button" onClick={() => setIndex(index - 1)} aria-label="Previous exercise" className="press flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-line bg-white text-ink-soft hover:border-ink/20">
                <ArrowLeft className="h-5 w-5" />
              </button>
            )}
            {isLast ? (
              <button
                type="button"
                onClick={finish}
                disabled={finishing || doneCount === 0}
                className="press flex h-14 flex-1 items-center justify-center gap-2 rounded-2xl bg-ink text-base font-semibold text-white hover:bg-ink/85 disabled:opacity-40"
              >
                {finishing ? <Loader2 className="h-5 w-5 animate-spin" /> : <>{data.status === "LOGGED" ? "Save changes" : "Finish workout"} <Check className="h-5 w-5" strokeWidth={3} /></>}
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setIndex(index + 1)}
                className={cn(
                  "press flex h-14 min-w-0 flex-1 items-center justify-center gap-2 rounded-2xl px-4 text-base font-semibold",
                  exerciseDone(exercise) ? "bg-ink text-white hover:bg-ink/85" : "border border-line bg-white text-ink hover:border-ink/20"
                )}
              >
                <span className="truncate">Next: {nextExercise?.name}</span> <ArrowRight className="h-5 w-5 shrink-0" />
              </button>
            )}
          </div>

          {/* Live chart: on the page, no card */}
          <div className="rule pt-6">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-lg text-ink">{METRICS[metricName].label}</h2>
                <p className="mt-0.5 text-sm text-ink-mute">
                  {series.length === 0 ? "Your first set starts this chart." : current.some((s) => s.done) ? "Today's session updates as you log." : "Sessions so far. The dashed point is today's target."}
                </p>
              </div>
              {latest != null && (
                <p className="shrink-0 text-2xl font-semibold leading-none tracking-tight text-ink">
                  {formatValue(latest, metricName)}
                  <span className="ml-1 text-sm font-normal text-ink-mute">{METRICS[metricName].unit(exercise.loaded)}</span>
                </p>
              )}
            </div>
            <div className="mt-3">
              <ProgressChart
                series={series}
                metric={metricName}
                loaded={exercise.loaded}
                target={current.some((s) => s.done) ? null : exercise.target}
                height={190}
              />
            </div>
          </div>
        </div>
      </div>

      {/* ── Rest timer ───────────────────────────────────────────────── */}
      {rest && (
        <div className="sheet-up fixed inset-x-0 bottom-0 z-40 flex justify-center px-4" style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 16px)" }}>
          <div className="relative flex w-full max-w-sm items-center gap-3 overflow-hidden rounded-full bg-night py-2 pl-5 pr-2 text-white shadow-[0_20px_40px_-16px_rgba(11,15,26,0.7)]">
            <div className="absolute inset-y-0 left-0 bg-signal/35 transition-[width] duration-500 ease-linear" style={{ width: `${Math.max(0, Math.min(100, (restLeft / rest.total) * 100))}%` }} />
            <Timer className="relative h-4 w-4 text-white/70" />
            <p className="relative flex-1 text-sm text-white/70">
              Rest <span className="tnum ml-1 text-xl font-semibold text-white">{clock(restLeft)}</span>
            </p>
            <button type="button" onClick={() => setRest({ endsAt: rest.endsAt + 15000, total: rest.total + 15 })} className="press tnum relative h-10 rounded-full bg-white/10 px-3.5 text-sm font-semibold hover:bg-white/20">
              +15s
            </button>
            <button type="button" onClick={() => setRest(null)} className="press relative h-10 rounded-full bg-white px-4 text-sm font-semibold text-ink">
              Skip
            </button>
          </div>
        </div>
      )}

      {/* ── Workout switcher ─────────────────────────────────────────── */}
      {switching && (
        <div className="fade-in fixed inset-0 z-50 flex items-end justify-center bg-night/40 backdrop-blur-sm sm:items-center" onClick={() => setSwitching(false)}>
          <div className="sheet-up w-full max-w-md rounded-t-[28px] bg-bone p-5 sm:rounded-[28px]" style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 20px)" }} role="dialog" aria-modal="true" aria-label="Switch workout" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <div>
                <p className="eyebrow">Week {data.week}</p>
                <h2 className="font-display text-3xl text-ink">Switch workout</h2>
              </div>
              <button type="button" onClick={() => setSwitching(false)} aria-label="Close" className="press flex h-10 w-10 items-center justify-center rounded-full bg-ink/5 text-ink-soft">
                <X className="h-5 w-5" />
              </button>
            </div>
            <ul className="mt-4 space-y-2">
              {data.siblings.map((w) => {
                const here = w.id === data.id;
                return (
                  <li key={w.id}>
                    <Link
                      href={`/workouts/${w.id}`}
                      onClick={() => setSwitching(false)}
                      aria-current={here ? "page" : undefined}
                      className={cn("press flex items-center gap-3 rounded-2xl border bg-white p-3.5", here ? "border-ink" : "border-line hover:border-ink/20")}
                    >
                      <span className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-full", w.status === "LOGGED" ? "bg-signal text-white" : "bg-ink/5 text-ink-mute")}>
                        {w.status === "LOGGED" ? <Check className="h-4 w-4" strokeWidth={3} /> : <ArrowRight className="h-4 w-4" />}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[15px] font-semibold text-ink">{w.name}</span>
                        <span className="block text-[13px] text-ink-mute">{here ? "You're here" : w.status === "LOGGED" ? "Logged" : w.status === "SKIPPED" ? "Skipped" : "Not done yet"}</span>
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
            <Link href="/plan" className="press mt-3 flex h-12 items-center justify-center rounded-2xl text-sm font-semibold text-signal hover:bg-signal/5">
              See the full plan
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
