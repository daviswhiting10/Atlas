"use client";

import { COOLDOWN, WARMUP, parts, structure } from "@/lib/workouts/structure";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useTransition } from "react";
import { ExerciseThumb } from "@/components/ExercisePicture";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowLeft, ArrowRight, Check, ChevronDown, ChevronsUpDown, Loader2, MoreHorizontal, Medal, Minus, Plus, Timer, X } from "lucide-react";
import type { LoggerData, LoggerExercise, LoggerSet } from "@/lib/athlete/data";
import { finishWorkout, planAddExercise, planRemoveExercise, planSetTargets, planSwapExercise, saveSet } from "@/lib/actions/athlete";
import { ExercisePicker } from "@/components/exercises/ExercisePicker";
import { PendingExercises, usePendingExercises } from "@/components/exercises/pending";
import { TargetEditor } from "./TargetEditor";
import { isRecord } from "@/lib/plan/overload";
import { FOLD_DELAY_MS, RECORD_RING, STUCK_MS, UnsavedDot } from "@/components/logger/set-marks";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { canMerge, mergeWith, sessionOrder, stepOrder, type OrderEntry } from "@/lib/sessions/order";
// The coach logger's hold-and-drag (hold a card's header to lift it, drop between cards to reorder,
// hold over a card to superset). Imported as it is; nothing in that folder is changed.
import { useDragOrder } from "@/app/(dashboard)/clients/[id]/log/useDragOrder";
import { cn } from "@/lib/utils";
import { useLongPress } from "@/hooks/use-long-press";
import { FINISH_DELAY_MS, allDone, nextOpen } from "@/lib/sessions/flow";
import { addPending, clearPending, isNetworkError, pendingKey, readPending } from "@/lib/sessions/pending";
import { clearFinish, queueFinish, queuedFinish } from "@/lib/sessions/pending-finish";

/** Set while the page is going away: a save cut off by a reload or close isn't a failed save. */
let leaving = false;
if (typeof window !== "undefined") {
  window.addEventListener("pagehide", () => (leaving = true));
  window.addEventListener("beforeunload", () => (leaving = true));
  // Back from the back/forward cache: the page is live again.
  window.addEventListener("pageshow", () => (leaving = false));
}

/** The browser's storage, or null where there is none (private mode, the server). */
const store = () => {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
};
import { ExerciseName } from "@/components/ExerciseName";

type SetMap = Record<string, LoggerSet[]>;

/** A set's tick is ignored this long after the cards fold, open or move under the finger. */
const SETTLE_MS = 400;

/** Heaviest load the logger accepts. Above any real lift, low enough to catch a typo like 1450 for 145. */
const MAX_WEIGHT_LB = 1000;

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
  settled,
}: {
  value: number | null;
  step: number;
  unit: string;
  label: string;
  onChange: (v: number | null) => void;
  dim: boolean;
  /** False just after cards fold, open or move: a +/− tapped now was meant for what was there (it would change a logged set). */
  settled: () => boolean;
}) {
  const bump = (dir: 1 | -1) => {
    if (!settled()) return;
    const next = value == null ? (dir === 1 ? step : 0) : Math.max(0, Math.round((value + dir * step) * 100) / 100);
    onChange(unit === "lb" ? Math.min(next, MAX_WEIGHT_LB) : next);
  };
  return (
    <div className={cn("flex h-[52px] min-w-0 flex-1 items-center rounded-2xl border bg-dusk-raised", dim ? "border-signal/25 bg-signal/[0.04]" : "border-line-strong")}>
      <button type="button" onClick={() => bump(-1)} aria-label={`Decrease ${label}`} className="press relative flex h-full w-9 shrink-0 items-center justify-center text-ink-mute before:absolute before:-inset-x-1 before:inset-y-0 hover:text-ink">
        <Minus className="h-4 w-4" />
      </button>
      <label className="flex min-w-0 flex-1 flex-col items-center justify-center self-stretch">
        <input
          type="number"
          inputMode="decimal"
          min={0}
          max={unit === "lb" ? MAX_WEIGHT_LB : undefined}
          step={step}
          value={value ?? ""}
          placeholder="–"
          aria-label={label}
          onChange={(e) => onChange(e.target.value === "" ? null : Math.min(Math.max(0, Number(e.target.value)), unit === "lb" ? MAX_WEIGHT_LB : 999))}
          onFocus={(e) => e.target.select()}
          className="tnum w-full bg-transparent text-center text-[17px] font-semibold leading-none text-ink outline-none [appearance:textfield] placeholder:text-ink-mute [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
        />
        <span className="mt-0.5 text-[10px] font-medium uppercase tracking-wide text-ink-mute">{unit}</span>
      </label>
      <button type="button" onClick={() => bump(1)} aria-label={`Increase ${label}`} className="press relative flex h-full w-9 shrink-0 items-center justify-center text-ink-mute before:absolute before:-inset-x-1 before:inset-y-0 hover:text-ink">
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
  // Cards that are open: the first exercise with sets left to log. Tap a header to fold or open.
  const [open, setOpen] = useState<Set<string>>(() => {
    const first = data.exercises.find((e) => e.sets.some((s) => !s.done)) ?? data.exercises[0];
    return new Set(first ? [first.aweId] : []);
  });
  // When a card folds, opens or moves, the cards under the finger change: a tick right after is a
  // second tap meant for what was there (a double tap on a header, a tap just after a drop), not a
  // set logged. It's ignored until the screen has settled. (The click after a lift is swallowed
  // wherever it lands by useDragOrder.)
  const movedAt = useRef(0);
  const firstLayout = useRef(true);
  const settled = () => performance.now() - movedAt.current > SETTLE_MS;
  const setOpenFor = (aweId: string, on: boolean) =>
    setOpen((cur) => {
      const next = new Set(cur);
      if (on) next.add(aweId);
      else next.delete(aweId);
      return next;
    });
  const [rest, setRest] = useState<{ endsAt: number; total: number } | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [records, setRecords] = useState<Record<string, string>>({});
  /** Sets whose save failed, or has waited offline a while: one small amber dot on that row. Never shown for a save that worked. */
  const [unsaved, setUnsaved] = useState<Record<string, true>>({});
  const stuckTimers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const markUnsaved = useCallback((key: string, on: boolean) => setUnsaved((u) => (on === (key in u) ? u : on ? { ...u, [key]: true } : Object.fromEntries(Object.entries(u).filter(([k]) => k !== key)))), []);
  const clearStuck = useCallback(
    (key: string) => {
      clearTimeout(stuckTimers.current.get(key));
      stuckTimers.current.delete(key);
      markUnsaved(key, false);
    },
    [markUnsaved]
  );
  const [switching, setSwitching] = useState(false);
  const [summary, setSummary] = useState<null | { minutes: number }>(null);
  const [finishing, startFinish] = useTransition();
  const startedAt = useRef(Date.now());
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  const debounce = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  // ── This session's order (hold a card's header and drag it) ─────────────────────
  // Kept on this phone for the session; the plan is never changed, and sets follow their exercise.
  const orderKey = `atlas:order:${data.id}`;
  const [savedOrder, setSavedOrderState] = useState<OrderEntry[] | null>(null);
  const setSavedOrder = (o: OrderEntry[] | null) => {
    setSavedOrderState(o);
    try {
      if (o) store()?.setItem(orderKey, JSON.stringify(o));
    } catch {}
  };
  useEffect(() => {
    try {
      const raw = store()?.getItem(orderKey);
      if (raw) setSavedOrderState(JSON.parse(raw));
    } catch {}
  }, [orderKey]);
  const order = useMemo(() => sessionOrder(data.exercises.map((e) => ({ aweId: e.aweId, section: e.role })), savedOrder), [data.exercises, savedOrder]);
  /** The exercises in this session's order, each in the part it was moved to. */
  const exercises = useMemo(() => {
    const byId = new Map(data.exercises.map((e) => [e.aweId, e]));
    return order.flatMap((o) => {
      const ex = byId.get(o.aweId);
      return ex ? [{ ...ex, role: o.section }] : [];
    });
  }, [data.exercises, order]);
  useLayoutEffect(() => {
    if (firstLayout.current) firstLayout.current = false;
    else movedAt.current = performance.now();
  }, [open, order]);
  const drag = useDragOrder({ order, enabled: data.status !== "LOGGED", onChange: setSavedOrder });
  /** Up, Down and "superset with the one above", for screen readers (the drag gestures, as buttons). */
  const moves = (aweId: string) => {
    const i = order.findIndex((o) => o.aweId === aweId);
    const above = order[i - 1]?.aweId;
    return {
      up: () => setSavedOrder(stepOrder(order, aweId, -1)),
      down: () => setSavedOrder(stepOrder(order, aweId, 1)),
      merge: above && canMerge(order, aweId, above) && order[i - 1].section !== order[i].section ? () => setSavedOrder(mergeWith(order, aweId, above)) : undefined,
    };
  };

  const apply = useCallback((next: SetMap) => {
    setsRef.current = next;
    setSetsState(next);
  }, []);

  /** Sets for an exercise: what's been edited here, or the server's list for one that just arrived. */
  const listOf = (e: LoggerExercise) => sets[e.aweId] ?? e.sets;

  // ── Changing the workout mid-session ──────────────────────────────────────
  // Swaps, new targets and added exercises are saved to the plan, then the
  // page re-reads it. This merges the new plan in without losing a single set
  // already logged here.
  const signature = (e: LoggerExercise) => [e.exerciseId, e.sets.length, e.repMin, e.repMax, e.target.weight, e.target.reps].join("|");
  const signatures = useRef<Record<string, string>>(Object.fromEntries(data.exercises.map((e) => [e.aweId, signature(e)])));
  const jumpTo = useRef<string | null>(null);
  const swapped = useRef(new Set<string>());
  const [busy, startBusy] = useTransition();
  /** The picker: adding an exercise, or swapping this one. */
  const [picker, setPicker] = useState<null | { mode: "add" } | { mode: "swap"; aweId: string }>(null);
  const [editingTarget, setEditingTarget] = useState<string | null>(null);
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);

  useEffect(() => {
    const prev = setsRef.current;
    const next: SetMap = {};
    for (const e of data.exercises) {
      const local = prev[e.aweId];
      const sig = signature(e);
      const changed = signatures.current[e.aweId] !== sig;
      signatures.current[e.aweId] = sig;
      if (!local) next[e.aweId] = e.sets;
      else if (!changed) next[e.aweId] = local;
      else if (swapped.current.has(e.aweId)) {
        // A swapped exercise starts clean. Sets logged before the swap stay with
        // the exercise they were actually done on, in its history and charts.
        swapped.current.delete(e.aweId);
        next[e.aweId] = e.sets;
      } else {
        // Same exercise, new target: keep every set already saved, re-target the rest.
        const merged = e.sets.map((server) => {
          const mine = local.find((x) => x.setNumber === server.setNumber);
          return mine && (mine.done || mine.setLogId) ? mine : server;
        });
        const extra = local.filter((x) => x.setNumber > e.sets.length && (x.done || x.setLogId));
        next[e.aweId] = [...merged, ...extra];
      }
    }
    apply(next);
    if (jumpTo.current) {
      // A new exercise opens; one that's gone from the plan drops out of the open cards.
      const id = jumpTo.current;
      jumpTo.current = null;
      setOpen((cur) => new Set([...Array.from(cur).filter((x) => data.exercises.some((e) => e.aweId === x)), id]));
    } else {
      setOpen((cur) => new Set(Array.from(cur).filter((x) => data.exercises.some((e) => e.aweId === x))));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.exercises, apply]);

  /** Save a change to the plan, say why if it was refused, and re-read the workout. */
  function change(run: () => Promise<{ ok: true } | { ok: false; error: string }>, done?: string) {
    startBusy(async () => {
      await queue.current; // sets already tapped are saved first
      const res = await run();
      if (!res.ok) return void toast.error(res.error);
      if (done) toast.success(done);
      router.refresh();
    });
  }

  // An exercise typed with no connection is put in (or swapped in) when it's back.
  const offline = usePendingExercises(data.id, async (op, exercise) => {
    if (data.exercises.some((e) => e.exerciseId === exercise.id)) return true; // already in: an earlier send got through
    await queue.current;
    const res = op.target.mode === "swap" ? await planSwapExercise({ aweId: op.target.aweId, workoutId: data.id, exerciseId: exercise.id }) : await planAddExercise({ workoutId: data.id, exerciseId: exercise.id });
    if (!res.ok) {
      toast.error(res.error);
      return false;
    }
    if ("aweId" in res && typeof res.aweId === "string") jumpTo.current = res.aweId;
    toast.success(op.target.mode === "swap" ? `Swapped for ${exercise.name}` : `${exercise.name} added`);
    router.refresh();
    return true;
  });

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

  // Saves run one at a time, in order, so the first set of a workout always
  // creates the log before the second one looks for it.
  // Ticks show at once (toggle changes setsRef first); saves run one at a time behind the screen.
  // What the server has for each set, and how many saves for it are still to run: a failed save
  // only rolls the set back to the server's state when no newer one is coming (that one sends the
  // latest state anyway).
  const serverDone = useRef(new Map<string, boolean>());
  // No connection: said in the header, not in a toast (a toast sits over the title and the ⋯).
  const [noSignal, setNoSignal] = useState(false);
  const [finishQueued, setFinishQueued] = useState(() => false);
  const pending = useRef(new Map<string, number>());
  const persist = useCallback(
    (aweId: string, setNumber: number) => {
      const key = `${aweId}:${setNumber}`;
      pending.current.set(key, (pending.current.get(key) ?? 0) + 1);
      queue.current = queue.current.then(async () => {
        const left = (pending.current.get(key) ?? 1) - 1;
        pending.current.set(key, left);
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
          // A failed answer can come back as nothing rather than an error: that's a refusal too.
          if (!res?.setLogId) throw new Error("The set wasn't saved");
          serverDone.current.set(key, s.done);
          clearStuck(key);
          // Confirmed while the page is closing: the next page may have read the server before this
          // landed, so it stays pending there (that page clears it, or resends it harmlessly).
          if (!leaving) clearPending(store(), data.id, key, s.done);
          apply({
            ...setsRef.current,
            [aweId]: (setsRef.current[aweId] ?? []).map((x) => (x.setNumber === setNumber ? { ...x, setLogId: res.setLogId } : x)),
          });
        } catch (e) {
          // Cut off by a reload or close: it stays pending and is sent again when the page opens.
          if (leaving) return;
          // No connection: the tick stays and is sent when the connection is back. Only a refusal
          // from the server puts the set back.
          if (isNetworkError(e)) {
            setNoSignal(true);
            if (!stuckTimers.current.has(key)) stuckTimers.current.set(key, setTimeout(() => markUnsaved(key, true), STUCK_MS));
            return;
          }
          if (left > 0) return;
          clearPending(store(), data.id, key);
          // Back to the way the server has it: unticked if it never got there, ticked if an un-tick didn't.
          const back = serverDone.current.get(key) ?? false;
          apply({
            ...setsRef.current,
            [aweId]: (setsRef.current[aweId] ?? []).map((x) => (x.setNumber === setNumber ? { ...x, done: back } : x)),
          });
          if (!back) {
            setRecords((r) => Object.fromEntries(Object.entries(r).filter(([k]) => k !== key)));
            cancelFinish();
          }
          markUnsaved(key, true);
        }
      });
    },
    [apply, data.id, clearStuck, markUnsaved]
  );

  const deloadWeek = data.deloadWeek;

  function edit(ex: LoggerExercise, i: number, patch: Partial<Pick<LoggerSet, "weight" | "reps">>) {
    const list = setsRef.current[ex.aweId] ?? ex.sets;
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
    if (!settled()) return;
    const list = setsRef.current[ex.aweId] ?? ex.sets;
    const s = list[i];
    const done = !s.done;
    if (done && (s.reps == null || s.reps <= 0)) {
      toast(`Enter your ${ex.unit === "secs" ? "time" : "reps"} first`);
      return;
    }
    // The server's state before the screen first changes it (for a rollback if a save fails).
    const key0 = `${ex.aweId}:${s.setNumber}`;
    clearStuck(key0);
    if (!serverDone.current.has(key0)) serverDone.current.set(key0, s.setLogId ? s.done : false);
    // The weight starts at the target when there is one; with none (a new lift), a blank is fine.
    const next = list.map((x, j) => (j === i ? { ...x, done } : x));
    apply({ ...setsRef.current, [ex.aweId]: next });
    // Kept on the phone until the server confirms it: a reload mid-save puts it back and resends it.
    addPending(store(), data.id, pendingKey(ex.aweId, s.setNumber), { done, weight: s.weight, reps: s.reps });
    persist(ex.aweId, s.setNumber);

    const key = `${ex.aweId}:${s.setNumber}`;
    if (!done) {
      // A set un-ticked: the workout isn't over after all.
      cancelFinish();
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
      const timed = ex.unit === "secs";
      const label = mine.weight != null ? `${mine.weight} lb` : `${mine.reps} ${timed ? "sec" : "reps"}`;
      setRecords((r) => ({ ...r, [key]: label }));
    }

    afterChange(ex, s.plan?.rest ?? undefined);
  }

  /**
   * After a set is logged or deleted: the workout's last set finishes it (a few seconds later,
   * with an Undo); an exercise's last set moves on to the next exercise with sets left.
   */
  function afterChange(ex: LoggerExercise, restSeconds = ex.restSeconds) {
    const lists = data.exercises.map((e) => (setsRef.current[e.aweId] ?? e.sets).map((x) => x.done));
    if (allDone(lists)) {
      setRest(null);
      scheduleFinish();
      return;
    }
    setRest({ endsAt: Date.now() + restSeconds * 1000, total: restSeconds });
    // An exercise's last set folds it and opens the next one with sets left (in the order on screen).
    const shown = exercises.map((e) => (setsRef.current[e.aweId] ?? e.sets).length > 0 && (setsRef.current[e.aweId] ?? e.sets).every((x) => x.done));
    const at = exercises.findIndex((e) => e.aweId === ex.aweId);
    if (at === -1 || !shown[at]) return;
    const n = nextOpen(shown, at);
    setTimeout(() => {
      setOpenFor(ex.aweId, false);
      if (n != null) setOpenFor(exercises[n].aweId, true);
    }, FOLD_DELAY_MS);
  }

  /** Delete a set that isn't logged (hold its row), with an Undo. Later sets close up. */
  function deleteSet(ex: LoggerExercise, i: number) {
    const list = setsRef.current[ex.aweId] ?? ex.sets;
    const s = list[i];
    if (!s) return;
    if (s.done || s.setLogId) return void toast("Untick the set first to delete it");
    if (list.length <= 1) return void toast("An exercise keeps at least one set");
    // A saved set after it keeps its number, so only the unsaved ones after it can close up.
    if (list.slice(i + 1).some((x) => x.done || x.setLogId)) return void toast("Delete the sets after it first");
    const renumber = (l: LoggerSet[]) => l.map((x, j) => ({ ...x, setNumber: j + 1 }));
    apply({ ...setsRef.current, [ex.aweId]: renumber(list.filter((_, j) => j !== i)) });
    toast(`Set ${s.setNumber} deleted`, {
      action: {
        label: "Undo",
        onClick: () => {
          cancelFinish();
          const cur = setsRef.current[ex.aweId] ?? ex.sets;
          apply({ ...setsRef.current, [ex.aweId]: renumber([...cur.slice(0, i), s, ...cur.slice(i)]) });
        },
      },
    });
    afterChange(ex);
  }

  // ── Finishing: by itself, FINISH_DELAY_MS after the last set, unless Undo is tapped ─────
  const finishTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // The countdown bar at the bottom (not a toast: a toast sits over the title and the back arrow).
  const [countdown, setCountdown] = useState<{ message: string; key: number } | null>(null);
  const finishRef = useRef<() => void>(() => {});
  function cancelFinish() {
    if (!finishTimer.current) return;
    clearTimeout(finishTimer.current);
    finishTimer.current = null;
    setCountdown(null);
  }
  function scheduleFinish(message = "All sets logged · finishing") {
    cancelFinish();
    setCountdown({ message, key: Date.now() });
    finishTimer.current = setTimeout(() => {
      finishTimer.current = null;
      finishRef.current();
    }, FINISH_DELAY_MS);
  }
  // Leaving the screen inside those seconds still finishes the workout.
  useEffect(
    () => () => {
      if (finishTimer.current) {
        clearTimeout(finishTimer.current);
        finishRef.current();
      }
    },
    []
  );
  // Ticks the server hasn't confirmed (the page reloaded or the app closed mid-save, or the
  // connection dropped): on the screen as tapped, with the values they were ticked with, and sent
  // again. On opening (before the finish check below) and whenever the connection comes back.
  function resendPending() {
    for (const [key, tick] of Object.entries(readPending(store(), data.id))) {
      const [aweId, n] = key.split(":");
      const setNumber = Number(n);
      const list = setsRef.current[aweId];
      const s = list?.find((x) => x.setNumber === setNumber);
      if (!list || !s) continue;
      const serverHasIt = serverDone.current.has(key) ? serverDone.current.get(key) === tick.done && !!s.setLogId : s.done === tick.done && !!s.setLogId;
      if (serverHasIt) {
        clearPending(store(), data.id, key, tick.done);
        continue;
      }
      if (!serverDone.current.has(key)) serverDone.current.set(key, s.setLogId ? s.done : false);
      if (s.done !== tick.done) {
        apply({
          ...setsRef.current,
          [aweId]: list.map((x) => (x.setNumber === setNumber ? { ...x, done: tick.done, weight: tick.weight !== undefined ? tick.weight : x.weight, reps: tick.reps !== undefined ? tick.reps : x.reps } : x)),
        });
      }
      persist(aweId, setNumber);
    }
  }
  const summaryRef = useRef(false);
  summaryRef.current = summary != null;
  const onOnline = useRef(() => {});
  onOnline.current = () => {
    setNoSignal(false);
    resendPending();
    // A finish tapped while offline goes through now; otherwise, everything logged while offline finishes if it was all of it.
    queue.current.then(() => {
      if (!summaryRef.current && queuedFinish(store(), data.id)) return void finishRef.current();
      if (!summaryRef.current && data.status !== "LOGGED" && !finishTimer.current && allDone(data.exercises.map((e) => (setsRef.current[e.aweId] ?? e.sets).map((x) => x.done)))) scheduleFinish();
    });
  };
  useEffect(() => {
    const t = setTimeout(() => {
      resendPending();
      // A finish queued while offline, and the page opened again (or the app reloaded on reconnect): send it.
      if (queuedFinish(store(), data.id) && navigator.onLine) queue.current.then(() => finishRef.current());
    }, 0);
    const online = () => onOnline.current();
    window.addEventListener("online", online);
    return () => {
      clearTimeout(t);
      window.removeEventListener("online", online);
    };
    // Once, on opening.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // Coming back to a workout whose sets are all logged but that never finished (the app was
  // closed mid-countdown): the countdown starts again, with its Undo. (A tick later, so React's
  // development double-mount doesn't read it as leaving.)
  useEffect(() => {
    if (data.status === "LOGGED") return;
    const t = setTimeout(() => {
      if (allDone(data.exercises.map((e) => (setsRef.current[e.aweId] ?? e.sets).map((x) => x.done)))) scheduleFinish();
    }, 0);
    return () => clearTimeout(t);
    // Once, on opening.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function addSet(ex: LoggerExercise) {
    const list = setsRef.current[ex.aweId] ?? ex.sets;
    const last = list[list.length - 1];
    apply({
      ...setsRef.current,
      [ex.aweId]: [...list, { setNumber: list.length + 1, weight: last?.weight ?? null, reps: last?.reps ?? ex.repMin, done: false, setLogId: null }],
    });
  }

  function finish() {
    setCountdown(null);
    startFinish(async () => {
      try {
        // The last ticks may still be saving: wait for them, and finish only if they all stuck.
        await queue.current;
        // Everything logged, or finished early with at least one set logged.
        if (!data.exercises.some((e) => (setsRef.current[e.aweId] ?? e.sets).some((x) => x.done))) return;
        const minutes = Math.max(1, Math.round((Date.now() - startedAt.current) / 60000));
        // Offline, the finish is queued (with its length) and goes through when the connection is back.
        const queued = queuedFinish(store(), data.id)?.minutes;
        const length = queued ?? minutes;
        await finishWorkout({ assignedWorkoutId: data.id, durationMin: data.status === "LOGGED" ? undefined : length });
        clearFinish(store(), data.id);
        setFinishQueued(false);
        setRest(null);
        setSummary({ minutes: length });
      } catch (e) {
        if (isNetworkError(e)) {
          if (!queuedFinish(store(), data.id)) queueFinish(store(), data.id, Math.max(1, Math.round((Date.now() - startedAt.current) / 60000)));
          setNoSignal(true);
          setFinishQueued(true);
          return;
        }
        toast.error("Couldn't finish the workout. Please try again.");
      }
    });
  }

  finishRef.current = finish;

  // ── Derived numbers ───────────────────────────────────────────────────────
  const all = data.exercises.flatMap((e) => listOf(e));
  const doneCount = all.filter((s) => s.done).length;
  const totalCount = all.length;
  const volume = Math.round(all.reduce((sum, s) => (s.done && s.reps ? sum + (s.weight ?? 0) * s.reps : sum), 0));
  /** The workout's parts in the order they're done, each exercise with its badge ("1A", "2", "W", "C"). */
  const blocks = useMemo(
    () =>
      parts(structure(exercises, (e) => e.role)).map((p) => ({
        section: p.key,
        title: p.title,
        items: p.items.map((it) => ({ ex: exercises[it.index], label: it.label ?? (p.key === WARMUP ? "W" : "C") })),
      })),
    [exercises]
  );
  const swapping = picker?.mode === "swap" ? data.exercises.find((e) => e.aweId === picker.aweId) ?? null : null;

  const restLeft = rest ? (rest.endsAt - now) / 1000 : 0;
  const elapsed = (now - startedAt.current) / 1000;


  // ── Done ──────────────────────────────────────────────────────────────────
  if (summary) {
    const recordList = Object.entries(records);
    const tiles = [
      [String(doneCount), "sets"],
      ...(volume > 0 ? [[volume >= 10000 ? `${(volume / 1000).toFixed(1)}k` : volume.toLocaleString(), "lb"]] : []),
      [String(summary.minutes), "min"],
    ];
    return (
      <div className="rise mx-auto flex min-h-[calc(100dvh-8rem)] max-w-xl flex-col pt-6 text-center md:pt-12">
        <span className="pop mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-signal text-bone">
          <Check className="h-8 w-8" strokeWidth={3} />
        </span>
        <h1 className="mt-6 font-display text-4xl leading-tight text-ink sm:text-5xl">{data.name}, done.</h1>

        <div className="mt-10 flex justify-center gap-12">
          {tiles.map(([value, label]) => (
            <div key={label}>
              <p className="tnum text-[56px] font-semibold leading-none tracking-[-0.04em] text-ink">{value}</p>
              <p className="mt-2 text-[13px] font-semibold uppercase tracking-[0.1em] text-ink-mute">{label}</p>
            </div>
          ))}
        </div>

        {recordList.length > 0 && (
          <ul className="mt-10 divide-y divide-line border-y border-line text-left">
            {recordList.map(([key, label]) => {
              const ex = data.exercises.find((e) => key.startsWith(e.aweId));
              return (
                <li key={key} className="flex items-baseline justify-between gap-3 py-3 text-[15px]">
                  <span className="flex min-w-0 items-center gap-2">
                    <Medal className="h-4 w-4 shrink-0 text-gold" />
                    <ExerciseName name={ex?.name ?? ""} className="font-medium text-ink" />
                  </span>
                  <span className="tnum shrink-0 text-ink-soft">{label}</span>
                </li>
              );
            })}
          </ul>
        )}

        <div className="mt-auto pt-10">
          <Link href="/today" className="press flex h-14 w-full items-center justify-center rounded-2xl bg-dusk-button text-[17px] font-semibold text-dusk-button-text hover:bg-dusk-button/90">
            Back to Today
          </Link>
        </div>
      </div>
    );
  }

  const section = "scroll-mt-28 rounded-2xl border border-line bg-paper";
  return (
    <div className="-mt-5 md:mt-0">
      {/* ── Header ───────────────────────────────────────────────────── */}
      <div className="sticky top-0 z-20 -mx-4 border-b border-line bg-bone/90 px-4 pb-3 pt-3 backdrop-blur-xl sm:-mx-8 sm:px-8 md:top-16">
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => router.push("/today")} aria-label="Back to Today" className="press -ml-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-ink-soft hover:bg-ink/5">
            <ArrowLeft className="h-5 w-5" />
          </button>
          <button type="button" onClick={() => setSwitching(true)} className="press flex min-w-0 flex-1 items-center gap-1.5 rounded-xl py-1 text-left">
            <span className="min-w-0">
              <span className="block truncate font-display text-2xl leading-tight text-ink">{data.name}</span>
              <span className="tnum block text-xs text-ink-mute">
                Week {data.week}
                {data.deloadWeek ? " · Lighter week" : ""} · {doneCount}/{totalCount} sets{data.status === "LOGGED" ? " · logged" : ` · ${clock(elapsed)}`}
              </span>
            </span>
            <ChevronsUpDown className="h-4 w-4 shrink-0 text-ink-mute" />
          </button>
          {finishing && <Loader2 className="h-5 w-5 shrink-0 animate-spin text-ink-mute" aria-label="Finishing" />}
          {data.status !== "LOGGED" && (
            <DropdownMenu>
              <DropdownMenuTrigger aria-label="More" className="press -mr-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-ink-soft hover:bg-ink/5">
                <MoreHorizontal className="h-5 w-5" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="min-w-[180px]">
                {/* Finishing early: whatever is logged is the workout. The countdown's Undo is the way back. */}
                <DropdownMenuItem className="min-h-11" disabled={doneCount === 0} onClick={() => scheduleFinish("Finishing workout")}>
                  Finish
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-ink/10">
          <div className="h-full rounded-full bg-signal transition-[width] duration-500 ease-out" style={{ width: `${totalCount ? (doneCount / totalCount) * 100 : 0}%` }} />
        </div>
        {noSignal && (
          <p role="status" className="mt-2 text-[12px] leading-tight text-ink-mute">
            {finishQueued ? "Offline. Finishes when you're back." : "Offline. Sets save when you're back."}
          </p>
        )}
      </div>

      {/* ── The exercises: tap a header to fold or open; hold it to move the card ───── */}
      <div className="mt-4 space-y-4">
        {data.note && <p className="rounded-xl border border-line bg-paper px-4 py-3 text-sm leading-relaxed text-ink-soft">{data.note}</p>}

        <div ref={drag.listRef} className="relative space-y-4">
          {drag.lineTop != null && (
            <div aria-hidden className="pointer-events-none absolute -left-1 -right-1 z-20 flex items-center" style={{ top: drag.lineTop - 1.5 }}>
              <span className="h-2 w-2 shrink-0 rounded-full bg-dusk-teal" />
              <span className="h-[3px] flex-1 rounded-full bg-dusk-teal" />
              <span className="h-2 w-2 shrink-0 rounded-full bg-dusk-teal" />
            </div>
          )}
          {blocks.map((block, bi) => {
            if (block.items.length === 0) return null;
            // No block headings: each card's label ("1A: Bench Press") shows the grouping.
            const isPart = block.section === WARMUP || block.section === COOLDOWN;
            return (
              <div key={bi} className="space-y-2">
                {isPart && <PartDivider title={block.title} />}
                {block.items.map(({ ex, label }) => {
                  const list = listOf(ex);
                  const timed = ex.unit === "secs";
                  const unit = timed ? "sec" : "reps";
                  if (!open.has(ex.aweId)) {
                    const logged = list.filter((x) => x.done).length;
                    return (
                      <section key={ex.aweId} data-exercise={ex.aweId} style={drag.styleFor(ex.aweId)} className={section}>
                        <FoldedRow label={label} name={ex.name} logged={logged} total={list.length} unsaved={list.some((s) => `${ex.aweId}:${s.setNumber}` in unsaved)} onOpen={() => setOpenFor(ex.aweId, true)} hold={drag.bind(ex.aweId)} />
                        <MoveButtons name={ex.name} {...moves(ex.aweId)} />
                      </section>
                    );
                  }
                  return (
                    <section key={ex.aweId} data-exercise={ex.aweId} style={drag.styleFor(ex.aweId)} className={cn(section, "px-3 pb-3 pt-2")}>
                      <div
                        {...drag.bind(ex.aweId)}
                        onClick={(e) => {
                          // A tap folds the card; its own buttons (the picture, the ⋯) do their own thing.
                          if (!(e.target as HTMLElement).closest("button, [role=menu], [role=menuitem]")) setOpenFor(ex.aweId, false);
                        }}
                        className="mb-1 flex cursor-pointer select-none items-center gap-2 [-webkit-touch-callout:none]"
                      >
                        <ExerciseThumb picture={ex.picture} name={ex.name} />
                        <div className="min-w-0 flex-1">
                          <ExerciseName as="h3" name={labelled(label, ex.name)} className="text-[17px] font-semibold leading-tight text-ink" />
                          <p className="mt-0.5 text-[12px] leading-tight text-ink-mute">
                            {list.length} × {ex.repMin === ex.repMax ? ex.repMax : `${ex.repMin}–${ex.repMax}`} {unit}
                          </p>
                          {/* Only a first time (nothing to go on) gets a word of guidance; a hold is timed, so it never asks for "N reps". */}
                          {ex.target.kind === "first" && <p className="mt-0.5 text-[12px] leading-snug text-ink-mute">{ex.target.reason}</p>}
                          {/* The coach's note on the exercise, as written. */}
                          {ex.note && <p className="mt-1 text-[13px] leading-snug text-ink-soft">{ex.note}</p>}
                        </div>
                        <DropdownMenu>
                          <DropdownMenuTrigger aria-label={`More for ${ex.name}`} disabled={busy} className="press flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-ink-soft hover:bg-ink/5">
                            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <MoreHorizontal className="h-5 w-5" />}
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="min-w-[180px]">
                            <DropdownMenuItem className="min-h-11" onClick={() => setPicker({ mode: "swap", aweId: ex.aweId })}>Swap</DropdownMenuItem>
                            {/* A coach's plan stays the coach's: swap, but no retargeting or removing. */}
                            {!data.coachPlan && <DropdownMenuItem className="min-h-11" onClick={() => setEditingTarget(ex.aweId)}>Change target</DropdownMenuItem>}
                            {!data.coachPlan && data.exercises.length > 1 && (
                              <DropdownMenuItem onClick={() => setConfirmRemove(ex.aweId)} className="min-h-11 text-destructive focus:text-destructive">
                                Remove
                              </DropdownMenuItem>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                      <MoveButtons name={ex.name} {...moves(ex.aweId)} />

                      {confirmRemove === ex.aweId && (
                        <div className="mb-2 flex flex-wrap items-center gap-2 text-sm">
                          <span className="text-ink-soft">{list.some((x) => x.done) ? "Remove? Logged sets stay in your history." : "Remove from this workout?"}</span>
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => {
                              setConfirmRemove(null);
                              change(() => planRemoveExercise({ aweId: ex.aweId, workoutId: data.id }), `${ex.name} removed`);
                            }}
                            className="press min-h-11 rounded-lg bg-dusk-button px-3 font-semibold text-dusk-button-text"
                          >
                            Remove
                          </button>
                          <button type="button" onClick={() => setConfirmRemove(null)} className="press min-h-11 rounded-lg px-3 font-medium text-ink-soft">
                            Keep
                          </button>
                        </div>
                      )}
                      {editingTarget === ex.aweId && (
                        <div className="mb-2">
                          <TargetEditor
                            initial={{ sets: list.length, repMin: ex.repMin, repMax: ex.repMax, weight: ex.target.kind === "custom" ? ex.target.weight : null }}
                            unit={ex.unit}
                            loaded={ex.loaded}
                            onCancel={() => setEditingTarget(null)}
                            onSave={async (values) => {
                              setEditingTarget(null);
                              change(() => planSetTargets({ aweId: ex.aweId, workoutId: data.id, ...values }), "Target updated for this session");
                            }}
                          />
                        </div>
                      )}

                      <ul className="space-y-2">
                        {list.map((s, i) => {
                          const record = records[`${ex.aweId}:${s.setNumber}`];
                          return (
                            <li key={s.setNumber}>
                              <HoldRow onHold={() => deleteSet(ex, i)} className="flex items-center gap-1.5">
                                <span className={cn("tnum w-4 shrink-0 text-center text-sm font-semibold", s.done ? "text-signal" : "text-ink-mute")}>{s.setNumber}</span>
                                {ex.loaded && <Stepper value={s.weight} step={ex.increment || 5} unit="lb" label={`Set ${s.setNumber} weight`} dim={s.done} settled={settled} onChange={(v) => edit(ex, i, { weight: v })} />}
                                <Stepper
                                  value={s.reps}
                                  step={timed ? 5 : 1}
                                  unit={unit}
                                  label={`Set ${s.setNumber} ${timed ? "seconds" : "reps"}`}
                                  dim={s.done}
                                  settled={settled}
                                  onChange={(v) => edit(ex, i, { reps: v == null ? null : Math.round(v) })}
                                />
                                <button
                                  type="button"
                                  onClick={() => toggle(ex, i)}
                                  aria-pressed={s.done}
                                  aria-label={s.done ? `Set ${s.setNumber} done — tap to undo` : `Mark set ${s.setNumber} done`}
                                  style={{ transition: "none", ...(s.done && record != null ? RECORD_RING : null) }}
                                  className={cn(
                                    "press relative flex h-[52px] w-[52px] shrink-0 items-center justify-center rounded-2xl border",
                                    s.done ? "border-signal bg-signal text-bone" : "border-line bg-paper text-ink-mute hover:border-signal hover:text-signal"
                                  )}
                                >
                                  <Check className="h-6 w-6" strokeWidth={3} />
                                  <UnsavedDot show={`${ex.aweId}:${s.setNumber}` in unsaved} />
                                </button>
                              </HoldRow>
                              {/* What the coach wrote for this set beyond weight and reps: the target RPE, the rest after it, a note. */}
                              {s.plan && (
                                <p className="tnum ml-[26px] mt-1 text-[12px] leading-snug text-ink-mute">
                                  {[s.plan.rpe != null && `RPE ${s.plan.rpe}`, s.plan.rest != null && clock(s.plan.rest)].filter(Boolean).join(" · ")}
                                  {s.plan.note && <span className="text-ink-soft">{s.plan.rpe != null || s.plan.rest != null ? " · " : ""}{s.plan.note}</span>}
                                </p>
                              )}
                              {!s.done && list.length > 1 && (
                                <button type="button" onClick={() => deleteSet(ex, i)} className="sr-only focus:not-sr-only focus:mt-1 focus:inline-flex focus:rounded-lg focus:px-3 focus:py-2 focus:text-sm">
                                  Delete set {s.setNumber}
                                </button>
                              )}
                            </li>
                          );
                        })}
                      </ul>
                      <button type="button" onClick={() => addSet(ex)} className="press logger-quiet mt-2 inline-flex min-h-11 items-center gap-1 px-1 text-[13px] font-medium text-ink-soft hover:text-ink">
                        <Plus className="h-3.5 w-3.5" /> Add set
                      </button>
                    </section>
                  );
                })}
              </div>
            );
          })}
        </div>

        <PendingExercises pending={offline.pending} />

        <button
          type="button"
          onClick={() => setPicker({ mode: "add" })}
          disabled={busy}
          className="press flex min-h-11 w-full items-center justify-center gap-1.5 rounded-2xl border border-dashed border-ink/15 text-sm font-medium text-ink-mute hover:border-ink/30 hover:text-ink"
        >
          <Plus className="h-4 w-4" /> Add an exercise
        </button>
      </div>

      {/* ── Finishing countdown: the bar empties over FINISH_DELAY_MS; Undo cancels it ── */}
      {countdown && (
        <div className="sheet-up fixed inset-x-0 bottom-0 z-40 flex justify-center px-4" style={{ paddingBottom: `calc(env(safe-area-inset-bottom, 0px) + ${rest ? 84 : 16}px)` }}>
          <div className="relative flex w-full max-w-sm items-center gap-3 overflow-hidden rounded-full border border-line-strong bg-dusk-raised py-2 pl-5 pr-2 shadow-[0_20px_40px_-16px_rgba(0,0,0,0.7)]">
            <div key={countdown.key} className="finish-bar absolute inset-y-0 left-0 bg-signal/35" style={{ animationDuration: `${FINISH_DELAY_MS}ms` }} />
            <p className="relative flex-1 text-sm font-medium text-ink">{countdown.message}</p>
            <button type="button" onClick={cancelFinish} className="press relative h-11 rounded-full bg-dusk-button px-5 text-sm font-semibold text-dusk-button-text">
              Undo
            </button>
          </div>
        </div>
      )}

      {/* ── Rest timer ───────────────────────────────────────────────── */}
      {rest && (
        <div className="sheet-up fixed inset-x-0 bottom-0 z-40 flex justify-center px-4" style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 16px)" }}>
          <div className="relative flex w-full max-w-sm items-center gap-3 overflow-hidden rounded-full border border-line-strong bg-dusk-raised py-2 pl-5 pr-2 text-ink shadow-[0_20px_40px_-16px_rgba(0,0,0,0.7)]">
            <div className="absolute inset-y-0 left-0 bg-signal/35 transition-[width] duration-500 ease-linear" style={{ width: `${Math.max(0, Math.min(100, (restLeft / rest.total) * 100))}%` }} />
            <Timer className="relative h-4 w-4 text-ink-soft" />
            <p className="relative flex-1 text-sm text-ink-soft">
              Rest <span className="tnum ml-1 text-xl font-semibold text-ink">{clock(restLeft)}</span>
            </p>
            <button type="button" onClick={() => setRest({ endsAt: rest.endsAt + 15000, total: rest.total + 15 })} className="press tnum relative h-11 rounded-full bg-ink/10 px-3.5 text-sm font-semibold hover:bg-ink/20">
              +15s
            </button>
            <button type="button" onClick={() => setRest(null)} className="press relative h-11 rounded-full bg-dusk-button px-4 text-sm font-semibold text-dusk-button-text">
              Skip
            </button>
          </div>
        </div>
      )}

      {picker && (
        <ExercisePicker
          title={picker.mode === "add" ? "Add an exercise" : `Swap ${swapping?.name ?? ""}`}
          exclude={data.exercises.map((e) => e.exerciseId)}
          suggestLike={swapping?.slug ?? null}
          onClose={() => setPicker(null)}
          onOffline={(name) => offline.add(name, picker.mode === "swap" ? { mode: "swap", aweId: picker.aweId } : { mode: "add" })}
          onPick={(chosen) => {
            const at = picker;
            setPicker(null);
            if (at.mode === "add") {
              change(async () => {
                const res = await planAddExercise({ workoutId: data.id, exerciseId: chosen.id });
                if (res.ok) jumpTo.current = res.aweId;
                return res;
              }, `${chosen.name} added`);
            } else {
              swapped.current.add(at.aweId);
              change(() => planSwapExercise({ aweId: at.aweId, workoutId: data.id, exerciseId: chosen.id }), `Swapped for ${chosen.name}`);
            }
          }}
        />
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
              <button type="button" onClick={() => setSwitching(false)} aria-label="Close" className="press flex h-11 w-11 items-center justify-center rounded-full bg-ink/5 text-ink-soft">
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
                      className={cn("press flex items-center gap-3 rounded-2xl border bg-paper p-3.5", here ? "border-ink" : "border-line hover:border-ink/20")}
                    >
                      <span className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-full", w.status === "LOGGED" ? "bg-signal text-bone" : "bg-ink/5 text-ink-mute")}>
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

/**
 * A set's row. Holding it deletes the set (not on a field, a +/− or the check, so a slow tap on
 * those still does its own thing). The tap that ends a hold is swallowed.
 */
function HoldRow({ onHold, className, children }: { onHold: () => void; className: string; children: React.ReactNode }) {
  const press = useLongPress(onHold);
  return (
    <div
      className={cn(className, "select-none [-webkit-touch-callout:none]")}
      onPointerDown={(e) => {
        if ((e.target as HTMLElement).closest("input, button")) return;
        press.onPointerDown(e);
      }}
      onPointerUp={press.onPointerUp}
      onPointerLeave={press.onPointerLeave}
      onPointerCancel={press.onPointerCancel}
      onContextMenu={press.onContextMenu}
      onClickCapture={(e) => {
        press.onClick(e);
        if (e.defaultPrevented) e.stopPropagation();
      }}
    >
      {children}
    </div>
  );
}


/** "1A: Bench Press". Warm-up and cool-down exercises are just their name (the divider says which). */
function labelled(label: string, name: string): string {
  return label === "W" || label === "C" || !label ? name : `${label}: ${name}`;
}

/** The thin divider above the Warm-up and the Cool-down. */
function PartDivider({ title }: { title: string }) {
  return (
    <div className="flex items-center gap-2 pt-1">
      <span className="text-[11px] font-semibold uppercase tracking-widest text-ink-mute">{title}</span>
      <div className="h-px flex-1 bg-line" />
    </div>
  );
}

/** Up, Down and "superset with the one above" for a screen reader or keyboard: the drag, as buttons. Hidden until focused. */
function MoveButtons({ name, up, down, merge }: { name: string; up: () => void; down: () => void; merge?: () => void }) {
  const cls = "rounded-lg border border-line-strong px-3 py-2 text-[13px] font-medium text-ink";
  return (
    <div className="sr-only flex gap-2 px-3 pb-2 focus-within:not-sr-only">
      <button type="button" onClick={up} className={cls}>
        Move {name} up
      </button>
      <button type="button" onClick={down} className={cls}>
        Move {name} down
      </button>
      {merge && (
        <button type="button" onClick={merge} className={cls}>
          Superset {name} with the one above
        </button>
      )}
    </div>
  );
}

/** A folded exercise: one row with its name, a tick when every set is logged or "2/3" when some are. Tap to open; hold to move. */
function FoldedRow({ label, name, logged, total, unsaved, onOpen, hold }: { label: string; name: string; logged: number; total: number; /** A set inside it hasn't saved. */ unsaved: boolean; onOpen: () => void; hold: React.HTMLAttributes<HTMLElement> }) {
  const done = total > 0 && logged === total;
  return (
    <button type="button" {...hold} onClick={onOpen} aria-expanded={false} aria-label={`Open ${name}`} className="press flex min-h-12 w-full select-none items-center gap-2 py-1.5 pl-3.5 pr-1.5 text-left [-webkit-touch-callout:none]">
      <ExerciseName name={labelled(label, name)} inControl className="min-w-0 flex-1 text-[16px] font-semibold leading-snug text-ink" />
      {done ? (
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-signal/20 text-signal">
          <Check className="h-3.5 w-3.5" strokeWidth={3} />
          <span className="sr-only">Every set logged</span>
        </span>
      ) : logged > 0 ? (
        <span className="tnum shrink-0 text-[13px] font-semibold text-ink-soft">
          {logged}/{total}
          <span className="sr-only"> sets logged</span>
        </span>
      ) : null}
      <span className="relative flex h-8 w-8 shrink-0 items-center justify-center text-ink-mute">
        <ChevronDown className="h-4 w-4" />
        <UnsavedDot show={unsaved} />
      </span>
    </button>
  );
}
