"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Check, ChevronDown, Loader2, Plus, Search, X } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { DayInput } from "@/components/ui/day-input";
import { dayFrom } from "@/lib/day-field";
import { cleanName } from "@/lib/exercises/custom";
import { nameKey } from "@/lib/exercises/names";
import { lastTime, quickLogStart, saveQuickSession, searchQuickExercises, type QuickExercise } from "@/lib/actions/quick-log";
import { describeLast, describeLogged, prefillSets, type LastTime, type QuickSet } from "@/lib/sessions/quick-log";
import { ExerciseName } from "@/components/ExerciseName";
import { formatClock, parseClock } from "@/lib/sessions/duration";
import { timedKind } from "@/lib/plan/timed";

type Row = { weight: string; reps: string; band: QuickSet["band"] };
type Item = {
  key: string;
  exerciseId: string | null;
  name: string;
  isNew: boolean;
  /** "3 × 10 @ 45 lb · Nov 6" once loaded; null when there's no history; "" when not looked up (editing a saved session). */
  last: string | null;
  unit: "reps" | "secs";
  loading: boolean;
  /** Changed by hand: a late "last time" answer mustn't overwrite it. */
  touched: boolean;
  rows: Row[];
};
type Draft = { date: string; items: Item[]; title: string; notes: string; duration: string };

export type QuickLogInitial = {
  id: string;
  date: string;
  title: string | null;
  notes: string | null;
  durationMin: number | null;
  exercises: Array<{ exerciseId: string; name: string; isNew: boolean; sets: QuickSet[] }>;
};

const today = () => dayOf(new Date());
const dayOf = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const toRow = (s: QuickSet): Row => ({ weight: s.weight == null ? "" : String(s.weight), reps: s.reps == null ? "" : String(s.reps), band: s.band });
const numOrNull = (s: string) => {
  const n = Number(s.replace(",", "."));
  return s.trim() === "" || !Number.isFinite(n) ? null : n;
};
let keySeq = 0;
const newKey = () => `q${Date.now().toString(36)}${(keySeq++).toString(36)}`;
/** "3 × 10 @ 135 lb" from what's typed so far; "" when no set has reps yet. */
const summaryOf = (i: Item) => describeLogged(i.rows.map((r) => ({ weight: numOrNull(r.weight), reps: numOrNull(r.reps), band: r.band })), i.unit);

/** What a form holds, for "has anything changed?": no keys, lookups or loading state. */
function content(d: Draft): string {
  return JSON.stringify({
    date: d.date,
    title: d.title.trim(),
    notes: d.notes.trim(),
    duration: d.duration,
    items: d.items.map((i) => ({ id: i.exerciseId, name: i.name, rows: i.rows })),
  });
}

function dateLabel(day: string): string {
  if (day === today()) return "Today";
  const y = new Date();
  y.setDate(y.getDate() - 1);
  if (day === dayOf(y)) return "Yesterday";
  return new Date(`${day}T12:00:00`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

/**
 * Log a workout done outside the plan: pick or type exercises, sets start
 * from last time, one save. Kept on this device as you go, so closing the
 * tab doesn't lose it.
 */
export function QuickLog({
  clientId,
  heading,
  backHref,
  backLabel,
  doneHref,
  initial,
}: {
  /** A coach logging for a client; omitted when athletes log for themselves. */
  clientId?: string;
  heading: string;
  backHref: string;
  backLabel: string;
  doneHref: string;
  /** An off-plan session being edited. */
  initial?: QuickLogInitial | null;
}) {
  const router = useRouter();
  const draftKey = `atlas:quicklog:${clientId ?? "me"}${initial ? `:${initial.id}` : ""}`;

  const [date, setDate] = useState(() => (initial ? dayOf(new Date(initial.date)) : today()));
  const [items, setItems] = useState<Item[]>(() =>
    (initial?.exercises ?? []).map((e) => ({ key: newKey(), exerciseId: e.exerciseId, name: e.name, isNew: e.isNew, last: "", unit: "reps", loading: false, touched: true, rows: e.sets.map(toRow) }))
  );
  const [title, setTitle] = useState(initial?.title ?? "");
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [duration, setDuration] = useState(initial?.durationMin ? String(initial.durationMin) : "");
  const [more, setMore] = useState(Boolean(initial?.title || initial?.notes || initial?.durationMin));
  const [recent, setRecent] = useState<QuickExercise[]>([]);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<QuickExercise[]>([]);
  const [searching, setSearching] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [restored, setRestored] = useState(false);
  // One exercise is open at a time; the rest are one-line summaries. A saved
  // session being edited opens with every exercise summed up.
  const [openKey, setOpenKey] = useState<string | null>(null);
  const sectionRefs = useRef<Record<string, HTMLElement | null>>({});
  const barRef = useRef<HTMLOListElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const dateRef = useRef<HTMLInputElement>(null);
  // Until the saved copy has been read, nothing may be written over it.
  const [ready, setReady] = useState(false);

  // ── On-device copy: only of changes not yet saved ──────────────────────────
  // What the screen opened with (empty, or the session being edited). A copy is
  // kept only while the form differs from it, so opening a screen and leaving
  // never leaves a stale copy behind.
  const baseline = useRef<string | null>(null);
  if (baseline.current === null) baseline.current = content({ date, items, title, notes, duration });

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(draftKey);
      if (raw) {
        const d = JSON.parse(raw) as Draft;
        if (Array.isArray(d.items) && content(d) !== baseline.current) {
          setDate(d.date || today());
          setItems(d.items.map((i) => ({ ...i, loading: false })));
          setOpenKey(d.items.at(-1)?.key ?? null);
          setTitle(d.title ?? "");
          setNotes(d.notes ?? "");
          setDuration(d.duration ?? "");
          setRestored(true);
        } else {
          window.localStorage.removeItem(draftKey);
        }
      }
    } catch {
      /* private window or blocked storage: start fresh */
    }
    setReady(true);
  }, [draftKey]);

  useEffect(() => {
    if (!ready) return;
    try {
      const draft: Draft = { date, items, title, notes, duration };
      if (content(draft) === baseline.current) window.localStorage.removeItem(draftKey);
      else window.localStorage.setItem(draftKey, JSON.stringify(draft));
    } catch {
      /* storage unavailable: the save button still works */
    }
  }, [ready, draftKey, date, items, title, notes, duration]);

  useEffect(() => {
    quickLogStart({ clientId })
      .then((r) => setRecent(r.recent))
      .catch(() => setRecent([]));
    if (!initial) searchRef.current?.focus();
  }, [clientId, initial]);

  // ── Search (debounced) ──────────────────────────────────────────────────────
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    const t = window.setTimeout(() => {
      searchQuickExercises({ clientId, q })
        .then((r) => setResults(r))
        .catch(() => setResults([]))
        .finally(() => setSearching(false));
    }, 160);
    return () => window.clearTimeout(t);
  }, [query, clientId]);

  const added = useMemo(() => new Set(items.map((i) => i.exerciseId ?? `new:${i.name.toLowerCase()}`)), [items]);
  const shownResults = results.filter((r) => !added.has(r.id));
  const typed = query.trim().replace(/\s+/g, " ");
  // The same name however it's written (case, plural, spacing, shorthand) is the same exercise.
  const typedKey = nameKey(typed);
  const exactExists = results.some((r) => nameKey(r.name) === typedKey) || items.some((i) => nameKey(i.name) === typedKey);

  // ── Adding ──────────────────────────────────────────────────────────────────
  const add = useCallback(
    (ex: { id: string | null; name: string; isNew?: boolean }) => {
      const key = newKey();
      setItems((prev) => [
        ...prev,
        { key, exerciseId: ex.id, name: ex.name, isNew: ex.id == null || Boolean(ex.isNew), last: null, unit: "reps", loading: ex.id != null, touched: false, rows: prefillSets(null).map(toRow) },
      ]);
      // Starting the next exercise folds the one before it into its summary.
      setOpenKey(key);
      setQuery("");
      setResults([]);
      searchRef.current?.focus();
      if (!ex.id) return;
      lastTime({ clientId, exerciseId: ex.id })
        .then((last: LastTime | null) =>
          setItems((prev) =>
            prev.map((i) =>
              i.key !== key
                ? i
                : {
                    ...i,
                    loading: false,
                    unit: last?.unit ?? "reps",
                    last: last ? `${describeLast(last)} · ${new Date(last.date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}` : null,
                    rows: i.touched ? i.rows : prefillSets(last).map(toRow),
                  }
            )
          )
        )
        .catch(() => setItems((prev) => prev.map((i) => (i.key === key ? { ...i, loading: false } : i))));
    },
    [clientId]
  );

  function onSearchKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key !== "Enter") return;
    e.preventDefault();
    if (shownResults[0]) add(shownResults[0]);
    else if (typed.length >= 2 && !searching) add({ id: null, name: typed });
  }

  // ── Editing ─────────────────────────────────────────────────────────────────
  const update = (key: string, f: (i: Item) => Item) => setItems((prev) => prev.map((i) => (i.key === key ? f(i) : i)));
  const setRow = (key: string, r: number, patch: Partial<Row>) =>
    update(key, (i) => ({ ...i, touched: true, rows: i.rows.map((row, k) => (k === r ? { ...row, ...patch } : row)) }));
  const addRow = (key: string) =>
    update(key, (i) => ({ ...i, touched: true, rows: [...i.rows, i.rows[i.rows.length - 1] ?? { weight: "", reps: "", band: null }].slice(0, 20) }));
  const removeRow = (key: string, r: number) => update(key, (i) => ({ ...i, touched: true, rows: i.rows.filter((_, k) => k !== r) }));
  const remove = (key: string) => setItems((prev) => prev.filter((i) => i.key !== key));

  // The jump bar keeps the open exercise's chip in view.
  useEffect(() => {
    const bar = barRef.current;
    const chip = bar?.querySelector<HTMLElement>("[aria-current=true]");
    if (bar && chip) bar.scrollTo({ left: chip.offsetLeft - 16, behavior: "smooth" });
  }, [openKey, items.length]);

  /** Open one exercise (folding the open one) and bring it into view under the jump bar. */
  function openItem(key: string) {
    setOpenKey(key);
    window.requestAnimationFrame(() => sectionRefs.current[key]?.scrollIntoView({ behavior: "smooth", block: "start" }));
  }
  function toSearch() {
    setOpenKey(null);
    window.requestAnimationFrame(() => {
      searchRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      searchRef.current?.focus({ preventScroll: true });
    });
  }

  const setCount = items.reduce((n, i) => n + i.rows.filter((r) => (numOrNull(r.reps) ?? 0) > 0).length, 0);
  // A walk or a class: no sets, just a name and a time.
  const timeOnly = setCount === 0 && title.trim().length > 0 && (numOrNull(duration) ?? 0) > 0;
  const canSave = setCount > 0 || timeOnly;

  function startOver() {
    setItems([]);
    setTitle("");
    setNotes("");
    setDuration("");
    setDate(today());
    setRestored(false);
    setOpenKey(null);
    searchRef.current?.focus();
  }

  async function save() {
    if (!canSave || saving) return;
    setSaving(true);
    setError(null);
    // The day the field shows now, not one from an earlier render (lib/day-field.ts).
    const day = dayFrom(dateRef, date);
    const res = await saveQuickSession({
      clientId,
      sessionId: initial?.id,
      date: day,
      title: title.trim() || undefined,
      notes: notes.trim() || undefined,
      durationMin: numOrNull(duration) ? Math.round(numOrNull(duration)!) : null,
      exercises: items.map((i) => ({
        exerciseId: i.exerciseId,
        name: i.name,
        sets: i.rows.map((r) => ({ weight: numOrNull(r.weight), reps: numOrNull(r.reps), band: r.band })),
      })),
    }).catch(() => ({ ok: false as const, error: "Couldn't reach the server. Your workout is still here; try again." }));
    if (!res.ok) {
      setError(res.error);
      setSaving(false);
      return;
    }
    try {
      window.localStorage.removeItem(draftKey);
    } catch {
      /* nothing to clear */
    }
    toast.success(`${initial ? "Workout updated" : timeOnly ? `Workout saved · ${duration} min` : `Workout saved · ${setCount} set${setCount === 1 ? "" : "s"}`} · ${dateLabel(day)}`);
    router.push(doneHref);
    router.refresh();
  }

  const field = "h-11 w-full rounded-lg border border-line-strong bg-dusk-raised px-3 text-[16px] text-ink outline-none focus:border-ink/40";

  return (
    <div className="mx-auto max-w-xl pb-6">
      <div className="mb-5 flex items-center justify-between gap-3">
        <Link href={backHref} className="inline-flex min-h-11 items-center gap-1 text-sm text-ink-mute hover:text-ink">
          <ArrowLeft className="h-4 w-4" /> {backLabel}
        </Link>
        <button
          type="button"
          onClick={() => (dateRef.current?.showPicker ? dateRef.current.showPicker() : dateRef.current?.focus())}
          className="press relative inline-flex h-11 items-center gap-1 rounded-full bg-ink/5 px-3.5 text-sm font-semibold text-ink"
        >
          {dateLabel(date)} <ChevronDown className="h-3.5 w-3.5" />
          <DayInput
            ref={dateRef}
            value={date}
            max={today()}
            onDay={(d) => d && setDate(d)}
            aria-label="Day of the workout"
            className="pointer-events-none absolute inset-0 opacity-0"
            tabIndex={-1}
          />
        </button>
      </div>

      <h1 className="text-[34px] font-semibold leading-[1.05] tracking-[-0.03em] text-ink">{heading}</h1>
      {!initial && items.length === 0 && <p className="mt-1.5 text-[15px] text-ink-mute">Anything you did outside the plan. Add what you did; sets start from last time.</p>}
      {restored && (
        <p className="mt-1 text-[13px] text-ink-mute">
          Picked up where you left off ·{" "}
          <button type="button" onClick={startOver} className="font-medium text-ink-soft underline-offset-2 hover:underline">
            start over
          </button>
        </p>
      )}

      {/* ── Jump bar: every exercise, one tap away ─────────────────────────── */}
      {items.length >= 2 && (
        <nav aria-label="Exercises in this workout" className="sticky top-0 z-10 -mx-4 mt-4 border-b border-line bg-bone/90 px-4 py-2 backdrop-blur-xl md:top-16">
          <ol ref={barRef} className="no-scrollbar relative flex gap-2 overflow-x-auto">
            {items.map((i, n) => {
              const done = summaryOf(i) !== "";
              const open = i.key === openKey;
              return (
                <li key={i.key} className="shrink-0">
                  <button
                    type="button"
                    onClick={() => openItem(i.key)}
                    aria-current={open ? "true" : undefined}
                    className={cn(
                      "press flex min-h-11 items-center gap-2 rounded-full border py-1.5 pl-1.5 pr-3.5 text-left text-[14px] font-semibold",
                      open ? "border-ink/60 bg-dusk-raised text-ink" : "border-line bg-paper text-ink-soft hover:text-ink"
                    )}
                  >
                    <span className={cn("tnum flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[12px]", done ? "bg-signal/20 text-signal" : "bg-ink/10 text-ink-soft")}>
                      {done ? <Check className="h-3.5 w-3.5" strokeWidth={3} /> : n + 1}
                    </span>
                    <ExerciseName name={i.name} inControl className="max-w-[180px] leading-tight" />
                  </button>
                </li>
              );
            })}
            <li className="shrink-0">
              <button type="button" onClick={toSearch} aria-label="Add an exercise" className="press flex min-h-11 items-center gap-1 rounded-full border border-dashed border-line-strong px-3.5 text-[14px] font-medium text-ink-soft hover:text-ink">
                <Plus className="h-4 w-4" /> Add
              </button>
            </li>
          </ol>
        </nav>
      )}

      {/* ── Exercises ─────────────────────────────────────────────────────── */}
      <div className="mt-5 space-y-3">
        {items.map((i) => {
          const summary = summaryOf(i);
          if (i.key !== openKey)
            return (
              <section key={i.key} ref={(el) => void (sectionRefs.current[i.key] = el)} className="scroll-mt-24 rounded-2xl border border-line bg-paper">
                <button type="button" onClick={() => openItem(i.key)} aria-expanded={false} className="press flex min-h-14 w-full items-center gap-3 px-4 py-3 text-left">
                  <span className={cn("flex h-7 w-7 shrink-0 items-center justify-center rounded-full", summary ? "bg-signal/20 text-signal" : "bg-ink/10 text-ink-mute")}>
                    {summary ? <Check className="h-3.5 w-3.5" strokeWidth={3} /> : <span className="h-1.5 w-1.5 rounded-full bg-current" />}
                  </span>
                  <span className="flex min-w-0 flex-1 flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
                    <ExerciseName name={i.name} inControl className="text-[16px] font-semibold leading-snug text-ink" />
                    <span className="tnum shrink-0 text-[15px] text-ink-soft">{summary || "No sets yet"}</span>
                  </span>
                  <ChevronDown className="h-4 w-4 shrink-0 text-ink-mute" />
                </button>
              </section>
            );
          return (
          <section key={i.key} ref={(el) => void (sectionRefs.current[i.key] = el)} className="scroll-mt-24 rounded-2xl border border-line-strong bg-paper p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className="text-[17px] font-semibold leading-snug text-ink [overflow-wrap:anywhere]">
                  {i.name}
                  {i.isNew && <span className="ml-2 rounded-full bg-dusk-peach/15 px-2 py-0.5 align-middle text-[11px] font-semibold text-dusk-peach">new</span>}
                </h2>
                {i.last !== "" && (
                  <p className="mt-0.5 text-[13px] text-ink-mute">
                    {i.loading ? "Looking up last time…" : i.last ? `Last: ${i.last}` : i.exerciseId ? "First time" : "Not in the library yet"}
                  </p>
                )}
              </div>
              <button type="button" onClick={() => remove(i.key)} aria-label={`Remove ${i.name}`} className="press -mr-1 -mt-1 rounded-full p-2 text-ink-mute hover:text-ink">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-3 space-y-2">
              {i.rows.map((r, k) => (
                <div key={k} className="flex items-center gap-2">
                  <span className="w-5 shrink-0 text-center text-[13px] font-semibold text-ink-mute">{k + 1}</span>
                  {r.band ? (
                    <button
                      type="button"
                      onClick={() => setRow(i.key, k, { band: null })}
                      className="flex h-11 flex-1 items-center justify-center gap-1.5 rounded-lg border border-line bg-ink/[0.03] text-[14px] font-medium capitalize text-ink"
                      title="Tap to use a weight instead"
                    >
                      {r.band} band <X className="h-3 w-3 text-ink-mute" />
                    </button>
                  ) : (
                    <label className="relative flex-1">
                      <input
                        inputMode="decimal"
                        value={r.weight}
                        onChange={(e) => setRow(i.key, k, { weight: e.target.value })}
                        placeholder="—"
                        aria-label={`Set ${k + 1} weight`}
                        className={cn(field, "pr-9 text-right font-semibold tabular-nums")}
                      />
                      <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[13px] text-ink-mute">lb</span>
                    </label>
                  )}
                  <label className="relative flex-1">
                    {i.unit === "secs" ? (
                      <input
                        inputMode="decimal"
                        defaultValue={r.reps === "" ? "" : formatClock(Number(r.reps))}
                        key={`${i.key}-${k}-${i.rows.length}-${i.last}`}
                        onChange={(e) => {
                          const secs = parseClock(e.target.value, timedKind(i.name, "") === "steady" ? "min" : "sec");
                          if (e.target.value.trim() === "") setRow(i.key, k, { reps: "" });
                          else if (secs != null) setRow(i.key, k, { reps: String(secs) });
                        }}
                        placeholder="0:00"
                        aria-label={`Set ${k + 1} time`}
                        className={cn(field, "pr-12 text-right font-semibold tabular-nums")}
                      />
                    ) : (
                      <input
                        inputMode="numeric"
                        value={r.reps}
                        onChange={(e) => setRow(i.key, k, { reps: e.target.value.replace(/[^\d]/g, "") })}
                        placeholder="—"
                        aria-label={`Set ${k + 1} reps`}
                        className={cn(field, "pr-12 text-right font-semibold tabular-nums")}
                      />
                    )}
                    <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[13px] text-ink-mute">{i.unit === "secs" ? "min:sec" : "reps"}</span>
                  </label>
                  <button
                    type="button"
                    onClick={() => removeRow(i.key, k)}
                    disabled={i.rows.length <= 1}
                    aria-label={`Remove set ${k + 1}`}
                    className="press shrink-0 rounded-full p-1.5 text-ink-mute hover:text-ink disabled:invisible"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
            <div className="mt-2 flex items-center justify-between gap-3">
              <button type="button" onClick={() => addRow(i.key)} className="press inline-flex min-h-11 items-center gap-1 text-[15px] font-medium text-ink-soft hover:text-ink">
                <Plus className="h-4 w-4" /> set
              </button>
              <button type="button" onClick={() => setOpenKey(null)} className="press inline-flex min-h-11 items-center gap-1.5 rounded-full border border-line-strong px-4 text-[15px] font-semibold text-ink hover:border-ink/40">
                <Check className="h-4 w-4" strokeWidth={2.5} /> Done
              </button>
            </div>
          </section>
          );
        })}
      </div>

      {/* ── Add exercise ──────────────────────────────────────────────────── */}
      <div className="relative mt-4">
        <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-mute" />
        <input
          ref={searchRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={onSearchKey}
          placeholder={items.length === 0 ? "Search or type an exercise" : "Add another exercise"}
          aria-label="Add exercise"
          autoComplete="off"
          className={cn(field, "h-12 rounded-xl pl-10")}
        />
        {searching && <Loader2 className="absolute right-3.5 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-ink-mute" />}
      </div>

      {typed.length >= 2 ? (
        <ul className="mt-1 overflow-hidden rounded-xl border border-line bg-paper">
          {shownResults.map((r) => (
            <li key={r.id}>
              <button type="button" onClick={() => add(r)} className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left text-[15px] text-ink hover:bg-ink/[0.03]">
                <span className="min-w-0">
                  <ExerciseName name={r.name} inControl className="inline" />
                  {r.isNew && <span className="ml-2 rounded-full bg-dusk-peach/15 px-2 py-0.5 text-[11px] font-semibold text-dusk-peach">new</span>}
                </span>
                {r.times > 0 && <span className="shrink-0 text-[12px] text-ink-mute">done {r.times}×</span>}
              </button>
            </li>
          ))}
          {!searching && !exactExists && cleanName(typed) && (
            <li>
              <button type="button" onClick={() => add({ id: null, name: typed })} className="flex w-full items-center gap-2 px-4 py-3 text-left text-[15px] text-ink-soft hover:bg-ink/[0.03]">
                <Plus className="h-4 w-4" /> Add &ldquo;{typed}&rdquo; as typed
              </button>
            </li>
          )}
        </ul>
      ) : (
        recent.filter((r) => !added.has(r.id)).length > 0 && (
          <div className="mt-3">
            <p className="text-[12px] font-semibold uppercase tracking-[0.08em] text-ink-mute">Recent · tap to add</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {recent
                .filter((r) => !added.has(r.id))
                .map((r) => (
                  <button key={r.id} type="button" onClick={() => add(r)} className="press min-h-11 rounded-full border border-line-strong bg-paper px-3.5 py-2 text-[14px] font-medium text-ink hover:border-ink/25">
                    {r.name}
                  </button>
                ))}
            </div>
          </div>
        )
      )}

      {/* ── Optional details ──────────────────────────────────────────────── */}
      <button type="button" onClick={() => setMore((m) => !m)} className="press mt-6 inline-flex min-h-11 items-center gap-1 text-[14px] font-medium text-ink-soft hover:text-ink">
        <ChevronDown className={cn("h-4 w-4 transition-transform", more ? "" : "-rotate-90")} /> {items.length === 0 ? "Just a name and a time (walk, run, class)" : "Name, notes, duration"}
      </button>
      {more && (
        <div className="mt-3 space-y-3">
          <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={80} placeholder="Name (e.g. Hotel gym)" aria-label="Workout name" className={field} />
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={2000} rows={2} placeholder="Notes" aria-label="Notes" className={cn(field, "h-auto resize-none py-2.5")} />
          <label className="relative block w-40">
            <input inputMode="numeric" value={duration} onChange={(e) => setDuration(e.target.value.replace(/[^\d]/g, ""))} placeholder="—" aria-label="Duration in minutes" className={cn(field, "pr-12 text-right")} />
            <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[13px] text-ink-mute">min</span>
          </label>
        </div>
      )}

      {error && (
        <p role="alert" className="mt-4 text-sm text-destructive">
          {error}
        </p>
      )}

      <div className="mt-6">
        <button
          type="button"
          onClick={save}
          disabled={!canSave || saving}
          className="press flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-dusk-button text-lg font-semibold text-dusk-button-text hover:bg-dusk-button/85 disabled:bg-ink/15 disabled:text-ink-mute"
        >
          {saving && <Loader2 className="h-5 w-5 animate-spin" />}
          {initial ? "Save changes" : !canSave && items.length === 0 && !more ? "Add an exercise to save" : "Save workout"}
        </button>
      </div>
    </div>
  );
}
