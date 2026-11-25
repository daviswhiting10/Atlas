"use client";

/// <reference types="@types/dom-speech-recognition" />

import { SheetLock } from "@/components/ui/sheet-lock";
import { liveTransitionTo } from "@/lib/live-transition";
import { summaryView } from "@/lib/sessions/summary-copy";
import { setVolume, timedRx } from "@/lib/sessions/volume";
import { AthleteNote, CompareCard, Medals, NextFor } from "@/components/coach/FinishedPanels";
import type { WrapUp } from "@/lib/coach/wrap-up";
import { reconcile } from "@/lib/sessions/reconcile";
import { SupersetOutline } from "@/components/logger/SupersetOutline";
import { useEffect, useLayoutEffect, useMemo, useRef, useState, useTransition } from "react";
import { COOLDOWN, WARMUP, parts, structure } from "@/lib/workouts/structure";
import { LIVE_EVENT, clearLive, mergeDraft, readLiveFor, startLive, writeLive, type LiveSession } from "@/lib/sessions/live";
import { ExerciseThumb } from "@/components/ExercisePicture";
import { ExerciseMediaUpload } from "@/components/coach/ExerciseMediaUpload";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { bumpSeconds, durationLabel, durationRange, formatClock, parseClock, type BareUnit } from "@/lib/sessions/duration";
import { timedKind } from "@/lib/plan/timed";
import { cn } from "@/lib/utils";
import {
  ArrowLeft,
  Calendar,
  SlidersHorizontal,
  Trash2,
  Check,
  ChevronDown,
  ChevronUp,
  Loader2,
  MoreHorizontal,
  Mic,
  MicOff,
  PencilLine,
  Plus,
  Timer,
  RotateCcw,
  X,
} from "lucide-react";
import {
  logSet,
  completeSession,
  sessionWrapUp,
  freshSessionSets,
  addExerciseNote,
  updateSessionDate,
} from "@/lib/actions/workout-logger";
import { coachAddExercise, coachAddLastTime, coachKeepSuperset, coachRemoveExercise, coachSetTargets, coachSwapExercise } from "@/lib/actions/coach-plan";
import { keptMessage, supersetChange } from "@/lib/plan/superset";
import { KeepSupersetSheet } from "@/components/logger/KeepSupersetSheet";
import { AddedLastTime } from "@/components/logger/AddedLastTime";
import { addedToast } from "@/lib/sessions/added";
import type { AddedOffer } from "@/lib/sessions/added-store";
import { ExercisePicker, type PickerExercise } from "@/components/exercises/ExercisePicker";
import { PendingExercises, usePendingExercises } from "@/components/exercises/pending";
import { FOLD_DELAY_MS, STUCK_MS, UnsavedDot } from "@/components/logger/set-marks";
import { CheckAllButton, CheckAllSheet } from "@/components/logger/check-all";
import { FinishSheet } from "@/components/logger/FinishSheet";
import { finishAction } from "@/lib/sessions/finish";
import { bulkIndices, exerciseBulk, queueBulk, workoutBulk, type BulkMode } from "@/lib/sessions/check-all";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import type { LoggerExercise, PrescribedSet, ExistingSetLog } from "./page";
import { ExerciseName } from "@/components/ExerciseName";
import { DayInput } from "@/components/ui/day-input";
import { SetNote } from "@/components/logger/SetNote";
import { allDone, nextOpen } from "@/lib/sessions/flow";
import { addPending, clearPending, isNetworkError, pendingKey, readPending } from "@/lib/sessions/pending";
import { conflictMessage } from "@/lib/sessions/replay";
import { rxAt, setCount, setValues } from "@/lib/sessions/coach-sets";

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
import { canMerge, mergeWith, sessionOrder, stepOrder, type OrderEntry } from "@/lib/sessions/order";
import { useDragOrder } from "./useDragOrder";
import { DragHandle, DragStatus } from "@/components/logger/DragHandle";
import { useLongPress } from "@/hooks/use-long-press";
import { useEscape } from "@/hooks/use-escape";

// ── Types ──────────────────────────────────────────────────────────────────────

type SetEntry = {
  setLogId: string | null;
  weight: string;
  isBodyweight: boolean;
  isBand: boolean;
  bandColor: string; // "yellow"|"red"|"green"|"blue"|"black"|"purple"
  isSeconds: boolean; // true when this is a hold/time-based set
  note: string;
  reps: string;       // stores seconds when isSeconds === true
  rpe: string;
  completed: boolean;
  /** A dumbbell or kettlebell set: 2 = per hand, 1 = one bell (lib/exercises/implements.ts). Null for other equipment. */
  implements: number | null;
  /** Stable for the life of the screen: saves find their set by it, whatever moved or was deleted meanwhile. */
  uid: string;
};

let uidSeq = 0;
/** A set's screen id. */
const newUid = () => `s${Date.now().toString(36)}${(uidSeq++).toString(36)}`;

// Band colors — order = lightest → heaviest
const BAND_COLORS = [
  { id: "yellow",  label: "Yellow",  hex: "#EAB308" },
  { id: "red",     label: "Red",     hex: "#EF4444" },
  { id: "green",   label: "Green",   hex: "#22C55E" },
  { id: "blue",    label: "Blue",    hex: "#3B82F6" },
  { id: "black",   label: "Black",   hex: "#18181B" },
  { id: "purple",  label: "Purple",  hex: "#A855F7" },
] as const;

type ExerciseState = {
  sets: SetEntry[];
  noteInput: string;
  noteSaving: boolean;
  noteAdded: boolean;
  /** Phone: the note field is open. */
  noteOpen?: boolean;
};

// ── Helpers ────────────────────────────────────────────────────────────────────

/** A set's tick is ignored this long after the cards fold, open or move under the finger. */
const SETTLE_MS = 400;

function formatRest(secs: number): string {
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function initSetEntry(
  ps: PrescribedSet,
  suggestion: LoggerExercise["suggestion"],
  bells: LoggerExercise["implements"],
  existing?: ExistingSetLog
): SetEntry {
  const isSeconds = ps.unit === "secs";
  if (existing) {
    return {
      setLogId: existing.id,
      weight: existing.weight != null ? String(existing.weight) : "",
      isBodyweight: existing.weight === null && !existing.bandColor,
      isBand: !!existing.bandColor,
      bandColor: existing.bandColor ?? "green",
      isSeconds,
      note: existing.note ?? "",
      reps: existing.reps != null ? String(existing.reps) : "",
      rpe: existing.rpe != null ? String(existing.rpe) : "",
      completed: existing.completed,
      implements: bells == null ? null : existing.implements,
      uid: newUid(),
    };
  }
  const suggestedWeight =
    suggestion.type !== "first_time" && suggestion.type !== "match_last"
      ? (suggestion.weight ?? ps.weight ?? null)
      : (ps.weight ?? null);
  // For holds, pre-fill the target duration; for reps, use suggestion
  const suggestedReps = isSeconds ? ps.repMax : (suggestion.reps ?? ps.repMax);
  return {
    setLogId: null,
    weight: suggestedWeight != null ? String(suggestedWeight) : "",
    isBodyweight: false,
    isBand: false,
    bandColor: "green",
    isSeconds,
    note: "",
    reps: suggestedReps != null ? String(suggestedReps) : "",
    rpe: "",
    completed: false,
    implements: bells,
    uid: newUid(),
  };
}

function buildInitialState(
  exercises: LoggerExercise[],
  existingSetLogs: ExistingSetLog[]
): Record<string, ExerciseState> {
  const state: Record<string, ExerciseState> = {};
  for (const ex of exercises) {
    const exLogs = existingSetLogs.filter(
      (s) => s.assignedWorkoutExerciseId === ex.aweId || s.exerciseId === ex.exerciseId
    );
    // As in the athlete's logger (lib/athlete/data.ts): sets logged past the plan's count are shown too,
    // after the prescribed ones, so a coach sees (and can edit) every set the session holds.
    const sets = Array.from({ length: setCount(ex.prescribedSets.length, exLogs) }, (_, i) => {
      const rx = rxAt(ex.prescribedSets, i, { weight: null, repMin: 0, repMax: 0, rpe: null, restSeconds: null, notes: "" });
      const existing = exLogs.find((s) => s.setNumber === rx.setNumber);
      return initSetEntry(rx, ex.suggestion, ex.implements, existing);
    });
    state[ex.aweId] = { sets, noteInput: "", noteSaving: false, noteAdded: false };
  }
  return state;
}

function CompletedPill() {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-[var(--success)]/10 px-2.5 py-1 text-xs font-semibold text-[var(--success)]">
      <Check className="h-3.5 w-3.5" strokeWidth={3} /> Completed
    </span>
  );
}

/** "3 × 8–12", "1 × 15 min", "3 × 30 sec". */
function rxLabel(ex: LoggerExercise): string {
  const p = ex.prescribedSets[0];
  if (!p) return "";
  const n = ex.prescribedSets.length;
  if (p.unit === "secs") {
    return `${n} × ${durationRange(p.repMin, p.repMax)}`;
  }
  return `${n} × ${p.repMin === p.repMax ? p.repMax : `${p.repMin}–${p.repMax}`}`;
}

/** "3 × 12 @ 15 lb", "5 min", "12, 10, 8 @ Blue band": identical sets collapse into one. */
function describeSets(sets: Array<{ weight: number | null; bandColor?: string | null; reps: number | null }>, secs: boolean): string {
  if (sets.length === 0) return "";
  const amount = (r: number | null) => (r == null ? "" : secs ? durationLabel(r) : `${r}`);
  const load = (x: (typeof sets)[number]) =>
    x.bandColor ? `${x.bandColor.charAt(0).toUpperCase()}${x.bandColor.slice(1)} band` : x.weight != null ? `${x.weight} lb` : secs ? "" : "BW";
  const loads = Array.from(new Set(sets.map(load)));
  const amounts = sets.map((x) => amount(x.reps)).filter(Boolean);
  if (loads.length === 1) {
    const same = amounts.length > 0 && amounts.every((a) => a === amounts[0]);
    const work = same ? (sets.length > 1 ? `${sets.length} × ${amounts[0]}` : amounts[0]) : amounts.join(", ");
    return [work, loads[0]].filter(Boolean).join(" @ ");
  }
  return sets.map((x) => [amount(x.reps), load(x)].filter(Boolean).join(" @ ")).join(", ");
}

/**
 * What was done on this exercise last week (this same workout), or the last
 * time it was done, with any notes left then: the coach's note on the
 * exercise and notes on the sets.
 */
function LastWeek({ ex }: { ex: LoggerExercise }) {
  const fromLastWeek = ex.prevWorkoutSets.length > 0;
  const secs = ex.prescribedSets[0]?.unit === "secs";
  const sets: Array<{ weight: number | null; bandColor?: string | null; reps: number | null }> = fromLastWeek ? ex.prevWorkoutSets : ex.lastSets;
  const done = describeSets(sets, secs);
  const setNotes = fromLastWeek ? ex.prevWorkoutSets.map((x) => x.note?.trim()).filter((x): x is string => !!x) : [];
  const notes = Array.from(new Set([ex.lastNote?.trim(), ...setNotes].filter((x): x is string => !!x)));
  if (!done && notes.length === 0) return null;
  return (
    <div className="mt-1.5 ml-1 border-l-2 border-[var(--success)]/40 pl-2.5 text-xs leading-relaxed text-[var(--success)]">
      {done && (
        <p>
          <span className="font-semibold">{fromLastWeek ? "Last week" : "Last time"}:</span> {done}
        </p>
      )}
      {notes.map((n, i) => (
        <p key={i} className="italic">&ldquo;{n}&rdquo;</p>
      ))}
    </div>
  );
}

/** Set rows straight from the prescription, nothing logged yet. */
function freshState(ex: LoggerExercise): ExerciseState {
  return { sets: ex.prescribedSets.map((ps) => initSetEntry(ps, ex.suggestion, ex.implements)), noteInput: "", noteSaving: false, noteAdded: false };
}

// ── Block helpers ───────────────────────────────────────────────────────────────

/**
 * One part of the workout: Warm-up, Block n or Cool-down (lib/workouts/structure).
 * Warm-up and Cool-down are always listed, even with nothing in them.
 * `labels[k]` is the badge for exIndices[k]: "1A", "2", or "W"/"C".
 */
type ExBlock = { section: string; title: string; exIndices: number[]; labels: string[] };

/** The workout's parts, in the order they're done. Exercises keep their index. */
function groupIntoBlocks(exercises: LoggerExercise[]): ExBlock[] {
  return parts(structure(exercises, (e) => e.section)).map((p) => ({
    section: p.key,
    title: p.title,
    exIndices: p.items.map((it) => it.index),
    labels: p.items.map((it) => it.label ?? (p.key === "warmup" ? "W" : "C")),
  }));
}


// ── Types ──────────────────────────────────────────────────────────────────────

type WorkoutOption = {
  id: string;
  name: string;
  scheduledDate: string; // ISO string
  exerciseCount: number;
  status: "PLANNED" | "LOGGED" | "SKIPPED" | "RESCHEDULED";
};

// ── Main component ─────────────────────────────────────────────────────────────


/** Today on this device, as YYYY-MM-DD. */
function localToday(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default function WorkoutLogger({
  ownerId,
  clientId,
  clientName,
  assignedWorkoutId,
  assignmentId,
  workoutName,
  scheduledDate,
  assignmentStartDate,
  completed,
  uploadsEnabled,
  workspaceId,
  exercises: planExercises,
  existingWorkoutLogId,
  sessionDate,
  existingSetLogs,
  availableWorkouts,
  lastAdded,
}: {
  clientId: string;
  clientName: string;
  assignedWorkoutId: string;
  /** The plan this workout is in: changes made mid-session are saved to this one workout. */
  assignmentId: string;
  workoutName: string;
  scheduledDate: string;
  assignmentStartDate: string;
  /** This workout has already been done. */
  completed: boolean;
  /** Blob storage is connected: coaches can upload their own exercise photos and clips. */
  uploadsEnabled: boolean;
  /** The signed-in coach: the "currently logging" bar is theirs alone. */
  ownerId: string;
  workspaceId: string;
  exercises: LoggerExercise[];
  existingWorkoutLogId: string | null;
  /** The existing session's date (YYYY-MM-DD), when resuming one. */
  sessionDate: string | null;
  existingSetLogs: ExistingSetLog[];
  availableWorkouts: WorkoutOption[];
  /** "Last time you added …": the last session of this workout added these, and today's doesn't have them. */
  lastAdded?: AddedOffer | null;
}) {
  const router = useRouter();

  // ── This session's order (moved by holding a card and dragging it) ─────────────
  // Kept on this phone with the live session and cleared when the session is finished. The plan
  // is never changed, and sets follow their exercise (each set points at it, not at a place).
  const [savedOrder, setSavedOrder] = useState<OrderEntry[] | null>(null);
  const order = useMemo(
    () => sessionOrder(planExercises.map((e) => ({ aweId: e.aweId, section: e.section })), savedOrder),
    [planExercises, savedOrder]
  );
  /** The exercises in this session's order, each in the part it was moved to. */
  const exercises = useMemo(() => {
    const byId = new Map(planExercises.map((e) => [e.aweId, e]));
    return order.flatMap((o) => {
      const ex = byId.get(o.aweId);
      return ex ? [{ ...ex, section: o.section }] : [];
    });
  }, [planExercises, order]);
  // A superset made here (or one the plan has, split) can be kept in the client's plan for this workout from now on: asked once.
  const [keepAsk, setKeepAsk] = useState<null | { kind: "group"; aweIds: string[] } | { kind: "split"; aweId: string }>(null);
  const moveTo = (o: OrderEntry[]) => {
    const asked = completed ? null : supersetChange(order, o, sessionOrder(planExercises.map((e) => ({ aweId: e.aweId, section: e.section })), null));
    if (asked) setKeepAsk(asked);
    setSavedOrder(o);
  };
  const keepSuperset = async (k: NonNullable<typeof keepAsk>) => {
    setKeepAsk(null);
    try {
      const res = await coachKeepSuperset(clientId, assignmentId, k.kind === "group" ? { workoutId: assignedWorkoutId, aweIds: k.aweIds } : { workoutId: assignedWorkoutId, split: k.aweId });
      if (!res.ok) return void toast.error(res.error);
      toast.success(keptMessage(res.updated, res.skipped));
      router.refresh();
    } catch {
      toast.error("Couldn't save that change. Please try again.");
    }
  };
  // Hold a card's header to pick it up; drop between cards to reorder, hold over one to superset.
  const drag = useDragOrder({ order, enabled: !completed, onChange: moveTo });
  // The same on a desktop: its own list, so its own lift (the phone's list is not on screen there).
  const dragD = useDragOrder({ order, enabled: !completed, onChange: moveTo });
  // Back to the client: the logger shrinks into the live-session bar (when the session is still open) instead of a page swap.
  const leaveToClient = (e: React.MouseEvent) => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    liveTransitionTo(router, `/clients/${clientId}`);
  };
  /** Up, Down and "superset with the one above", for screen readers (useDragOrder's gestures, as buttons). */
  const moves = (aweId: string) => {
    const i = order.findIndex((o) => o.aweId === aweId);
    const above = order[i - 1]?.aweId;
    return {
      up: () => moveTo(stepOrder(order, aweId, -1)),
      down: () => moveTo(stepOrder(order, aweId, 1)),
      merge: above && canMerge(order, aweId, above) && order[i - 1].section !== order[i].section ? () => moveTo(mergeWith(order, aweId, above)) : undefined,
    };
  };
  const [whenOpen, setWhenOpen] = useState(false);
  useEscape(whenOpen, () => setWhenOpen(false));

  // ── Shared state ────────────────────────────────────────────────────────────
  const [workoutLogId, setWorkoutLogId] = useState<string | null>(existingWorkoutLogId);
  const [exState, setExState] = useState<Record<string, ExerciseState>>(() =>
    buildInitialState(exercises, existingSetLogs)
  );
  // The latest sets, for code that runs later than the render it was made in (a toast's Undo, a timer).
  const exStateRef = useRef(exState);
  exStateRef.current = exState;
  // The sets this opened with, to tell later whether anything has been typed or ticked since.
  const openedState = useRef(exState);
  // The page this opened from can be an old copy (the app keeps and prefetches pages), so a set logged last time may not be
  // in it. Opening the logger reads the session again: what hasn't been touched since opening takes the fresh sets.
  useEffect(() => {
    let live = true;
    freshSessionSets({ assignedWorkoutId })
      .then((log) => {
        if (!live || !log) return;
        const fresh = buildInitialState(exercises, log.sets as ExistingSetLog[]);
        // Fresh rows are what the server holds: leaving one of their fields unchanged sends nothing.
        for (const ex of Object.values(fresh)) for (const x of ex.sets) if (x.setLogId) savedValues.current?.set(x.uid, setValues(x));
        // (each entry's uid is made fresh every time, so it is left out of the comparison)
        const mine = (s: ExerciseState) => JSON.stringify(s.sets.map((x) => ({ ...x, uid: 0 })));
        setExState((cur) => reconcile(cur, openedState.current, fresh, (a, b) => mine(a) === mine(b)));
        // The session the page didn't know about yet: this is the one the next tick belongs to.
        if (log.id && !logIdRef.current) {
          logIdRef.current = log.id;
          setWorkoutLogId(log.id);
        }
      })
      .catch(() => {});
    return () => {
      live = false;
    };
    // Once, when the logger opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assignedWorkoutId]);
  const [soapOpen, setSoapOpen] = useState(false);
  const [rawInput, setRawInput] = useState("");
  const [structuredNote, setStructuredNote] = useState<Record<string, unknown> | null>(null);
  const [structuring, setStructuring] = useState(false);
  const [recording, setRecording] = useState(false);
  const [, startComplete] = useTransition();
  const [finished, setFinished] = useState(false);
  const recognitionRef = useRef<SpeechRecognition | null>(null);

  // ── Session elapsed timer (display only) ────────────────────────────────────
  // Set from the live session on mount, so leaving and coming back doesn't restart the clock.
  const [sessionStart, setSessionStart] = useState(() => Date.now());
  const [sessionNow, setSessionNow] = useState(() => Date.now());
  useEffect(() => {
    if (finished) return;
    const id = setInterval(() => setSessionNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [finished]);
  const sessionElapsedSec = Math.floor((sessionNow - sessionStart) / 1000);

  // ── Changing the workout on the spot: swap, new targets, add, drop ─────────
  // Each change is saved to this one workout; the rest of the plan stays as written.
  const [editingAweId, setEditingAweId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  /** The exercise whose swap sheet is open. */
  const [swapFor, setSwapFor] = useState<string | null>(null);
  /** Sets (by uid) whose save failed, or has waited offline a while: one small amber dot on that row. Never shown for a save that worked. */
  const [unsaved, setUnsaved] = useState<Record<string, true>>({});
  const stuckTimers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const markUnsaved = (uid: string, on: boolean) => setUnsaved((u) => (on === (uid in u) ? u : on ? { ...u, [uid]: true } : Object.fromEntries(Object.entries(u).filter(([k]) => k !== uid))));
  const clearStuck = (uid: string) => {
    clearTimeout(stuckTimers.current.get(uid));
    stuckTimers.current.delete(uid);
    markUnsaved(uid, false);
  };
  const [busy, setBusy] = useState(false);

  // ── Live session: the "currently logging" bar on other screens, and coming back to this exact place ──
  // (lib/sessions/live). The database has every ticked set; this keeps the place on the screen.
  const liveRef = useRef<LiveSession | null>(null);
  // Set while the saved draft is being put back, so the save below doesn't overwrite it with the unmerged state.
  const restoringRef = useRef(false);
  useEffect(() => {
    if (completed) return;
    let store: Storage | null = null;
    try {
      store = window.localStorage;
    } catch {
      return;
    }
    // Only this coach's own earlier session counts (another account's on this browser is ignored).
    const prev = readLiveFor(store, ownerId);
    const live: LiveSession = { ...startLive(prev, {
      assignedWorkoutId,
      clientId,
      clientName,
      workoutName,
      href: `/clients/${clientId}/log?workoutId=${assignedWorkoutId}`,
      workoutLogId: existingWorkoutLogId,
    }), owner: ownerId };
    liveRef.current = live;
    writeLive(store, live);
    window.dispatchEvent(new Event(LIVE_EVENT));
    setSessionStart(live.startedAt);
    if (prev?.assignedWorkoutId === assignedWorkoutId) {
      restoringRef.current = prev.draft != null;
      // Each set keeps the id it has on this page (the draft's ids are from the last one, and a
      // save or a restored tick may already be using this page's); a set only the draft has gets one.
      setExState((cur) => {
        const merged = mergeDraft(cur, prev, { assignedWorkoutId, workoutLogId: existingWorkoutLogId });
        return Object.fromEntries(
          Object.entries(merged).map(([k, ex]) => [k, { ...ex, sets: ex.sets.map((x, i) => ({ ...x, uid: cur[k]?.sets[i]?.uid ?? newUid() })) }])
        );
      });
      const sameSession = !prev.workoutLogId || !existingWorkoutLogId || prev.workoutLogId === existingWorkoutLogId;
      if (sameSession && prev.order?.length) setSavedOrder(prev.order);
      // After the restored sets have rendered.
      if (prev.scrollY > 0) setTimeout(() => window.scrollTo({ top: prev.scrollY }), 50);
    }
    // Saved at most every 150ms (a timer, not animation frames: those pause in background tabs).
    // The position is read as the coach scrolls, so leaving (when the next page may already be at the top) can't save 0.
    let timer: ReturnType<typeof setTimeout> | null = null;
    let lastY = prev?.assignedWorkoutId === assignedWorkoutId ? prev.scrollY : 0;
    const saveScroll = () => {
      timer = null;
      if (!liveRef.current) return;
      liveRef.current = { ...liveRef.current, scrollY: lastY, updatedAt: Date.now() };
      writeLive(store, liveRef.current);
    };
    const onScroll = () => {
      lastY = Math.round(window.scrollY);
      if (!timer) timer = setTimeout(saveScroll, 150);
    };
    // Scroll events can lag (a backgrounded tab gets none), so the position is also read on the way out.
    const readNow = () => {
      if (window.scrollY > 0) lastY = Math.round(window.scrollY);
    };
    const onLeave = () => {
      readNow();
      saveScroll();
    };
    const onHide = () => document.visibilityState === "hidden" && onLeave();
    window.addEventListener("scroll", onScroll, { passive: true });
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", onLeave);
    return () => {
      window.removeEventListener("scroll", onScroll);
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("pagehide", onLeave);
      if (timer) clearTimeout(timer);
      onLeave();
    };
    // Once per workout opened.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assignedWorkoutId, completed]);

  // Keep what's typed, the order, and the session id. (Which cards are folded is this screen's alone.)
  useEffect(() => {
    if (!liveRef.current || finished) return;
    // The restore is still on its way into exState: the next run saves the merged state.
    if (restoringRef.current) {
      restoringRef.current = false;
      return;
    }
    const draft = Object.fromEntries(
      Object.entries(exState).map(([aweId, st]) => [aweId, { ...st, noteSaving: false, sets: st.sets }])
    );
    liveRef.current = { ...liveRef.current, draft, order: savedOrder, workoutLogId: workoutLogId ?? liveRef.current.workoutLogId, updatedAt: Date.now() };
    try {
      writeLive(window.localStorage, liveRef.current);
    } catch {
      // no storage: nothing to keep
    }
  }, [exState, savedOrder, workoutLogId, finished]);

  // Done: the bar goes.
  useEffect(() => {
    if (!finished) return;
    liveRef.current = null;
    try {
      clearLive(window.localStorage, assignedWorkoutId);
    } catch {
      // ignore
    }
    window.dispatchEvent(new Event(LIVE_EVENT));
  }, [finished, assignedWorkoutId]);

  // An exercise added or swapped mid-session arrives in new props: give it fresh
  // set rows, and open its card so it's in view.
  const seenExercises = useRef(new Map(exercises.map((e) => [e.aweId, e.exerciseId])));
  useEffect(() => {
    const seen = seenExercises.current;
    const fresh = exercises.filter((e) => seen.get(e.aweId) !== e.exerciseId);
    seenExercises.current = new Map(exercises.map((e) => [e.aweId, e.exerciseId]));
    if (fresh.length === 0) return;
    setExState((prev) => {
      const next = { ...prev };
      for (const ex of fresh) next[ex.aweId] = freshState(ex);
      return next;
    });
    setFoldOverride((prev) => {
      const next = { ...prev };
      for (const ex of fresh) delete next[ex.aweId];
      return next;
    });
  }, [exercises]);

  /** An exercise's set rows; new ones before the effect above has stored them. */
  const stateFor = (ex: LoggerExercise): ExerciseState => exState[ex.aweId] ?? freshState(ex);

  // ── Mobile-specific state ────────────────────────────────────────────────────
  // Folded cards. The screen opens with every card folded except the first one with sets left (a long
  // workout is one short list, not 100+ targets); an exercise folds by itself once every set is logged, and
  // a tap on its row or chevron opens (false) or folds (true) it by hand. Kept on this screen only, never saved.
  const [foldOverride, setFoldOverride] = useState<Record<string, boolean>>(() => {
    const left = (ex: LoggerExercise) => {
      const sets = stateFor(ex).sets;
      return sets.length === 0 || sets.some((x) => !x.completed);
    };
    const first = exercises.find(left);
    return Object.fromEntries(exercises.filter((ex) => ex !== first).map((ex) => [ex.aweId, true]));
  });
  // When a card folds, opens or moves, the cards under the finger change: a set's tick right after
  // is a second tap meant for what was there (a double tap on a header, a tap just after a drop),
  // not a set logged. It's ignored until the screen has settled.
  const movedAt = useRef(0);
  const firstLayout = useRef(true);
  useLayoutEffect(() => {
    if (firstLayout.current) firstLayout.current = false;
    else movedAt.current = performance.now();
  }, [foldOverride, order]);
  const settled = () => performance.now() - movedAt.current > SETTLE_MS;
  const cardRefs = useRef<Record<string, HTMLElement | null>>({});
  const [lastSetAt, setLastSetAt] = useState<number | null>(null);
  const [restSecs, setRestSecs] = useState(0);
  const dateInputRef = useRef<HTMLInputElement>(null);

  // ── Session date: the day it was actually done (trainer can correct it) ────
  // A session already started keeps its date; a new one is today, never the scheduled day.
  const [logDate, setLogDate] = useState<string>(() => sessionDate ?? localToday());

  // ── Week / day picker ────────────────────────────────────────────────────
  const currentWorkoutWeek =
    Math.floor(
      (new Date(scheduledDate).getTime() - new Date(assignmentStartDate).getTime()) /
        (7 * 24 * 60 * 60 * 1000)
    ) + 1;
  const [pickerWeek, setPickerWeek] = useState(currentWorkoutWeek);
  const [pickerDayId, setPickerDayId] = useState(assignedWorkoutId);

  async function handleDateChange(newDate: string) {
    setLogDate(newDate);
    if (workoutLogId) {
      try {
        await updateSessionDate({ workoutLogId, date: newDate });
      } catch {
        toast.error("Couldn't update session date");
      }
    }
  }

  const dateLabel = new Date(logDate + "T12:00:00").toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });

  // ── Rest timer ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!lastSetAt) return;
    const id = setInterval(
      () => setRestSecs(Math.floor((Date.now() - lastSetAt) / 1000)),
      1000
    );
    return () => clearInterval(id);
  }, [lastSetAt]);

  // ── Set field helpers ──────────────────────────────────────────────────────
  // Load-related keys that auto-carry forward to uncompleted subsequent sets
  const CARRY_KEYS: (keyof SetEntry)[] = ["weight", "isBodyweight", "isBand", "bandColor", "reps", "isSeconds", "implements"];

  // Weights carried down into sets that had none (muted until ticked or edited). Still editable; logged only when ticked.
  const [filled, setFilled] = useState<Set<string>>(() => new Set());
  function updateSet(aweId: string, idx: number, patch: Partial<SetEntry>) {
    if (patch.weight !== undefined) {
      const cur = exStateRef.current[aweId]?.sets;
      const before = cur?.[idx];
      if (cur && before) {
        const mark = new Set(filled);
        mark.delete(before.uid);
        cur.forEach((x, j) => {
          if (j > idx && !x.completed && x.weight === before.weight && before.weight === "" && patch.weight !== "") mark.add(x.uid);
          else if (j > idx && !x.completed && x.weight === before.weight) mark.delete(x.uid);
        });
        setFilled(mark);
      }
    }
    setExState((prev) => {
      const sets = [...prev[aweId].sets];
      sets[idx] = { ...sets[idx], ...patch };

      // Auto-carry forward load changes to uncompleted subsequent sets
      const carryPatch: Partial<SetEntry> = {};
      for (const key of CARRY_KEYS) {
        if (key in patch) (carryPatch as Record<string, unknown>)[key] = patch[key as keyof typeof patch];
      }
      if (Object.keys(carryPatch).length > 0) {
        for (let i = idx + 1; i < sets.length; i++) {
          if (!sets[i].completed) {
            sets[i] = { ...sets[i], ...carryPatch };
          }
        }
      }

      return { ...prev, [aweId]: { ...prev[aweId], sets } };
    });
  }

  function addSet(aweId: string) {
    setExState((prev) => {
      const sets = prev[aweId].sets;
      const last = sets[sets.length - 1];
      const newSet: SetEntry = {
        setLogId: null,
        weight: (last?.isBodyweight || last?.isBand) ? "" : (last?.weight ?? ""),
        isBodyweight: last?.isBodyweight ?? false,
        isBand: last?.isBand ?? false,
        bandColor: last?.bandColor ?? "green",
        isSeconds: last?.isSeconds ?? false,
        note: "",
        reps: last?.reps ?? "",
        rpe: "",
        completed: false,
        implements: last?.implements ?? exercises.find((e) => e.aweId === aweId)?.implements ?? null,
        uid: newUid(),
      };
      return { ...prev, [aweId]: { ...prev[aweId], sets: [...sets, newSet] } };
    });
  }

  /** Drop a set that hasn't been logged. */
  function removeSet(aweId: string, idx: number) {
    setExState((prev) => {
      const sets = prev[aweId].sets;
      if (sets.length <= 1 || sets[idx]?.completed) return prev;
      return { ...prev, [aweId]: { ...prev[aweId], sets: sets.filter((_, i) => i !== idx) } };
    });
  }

  // ── Log set ───────────────────────────────────────────────────────────────
  // A tap changes the screen at once (no waiting, no spinner); the save follows behind it
  // (saveSet). Logging an exercise's last set moves on to the next exercise with sets left;
  // logging the session's last set finishes it a few seconds later, with an Undo (lib/sessions/flow).
  function handleComplete(aweId: string, exerciseId: string, idx: number) {
    const entry = exStateRef.current[aweId]?.sets[idx];
    if (!entry) return;
    const nowDone = !entry.completed;
    noteServer(entry);
    clearStuck(entry.uid);
    // Only this set's tick changes (nothing carried forward), and the ref changes with it, so a
    // second tap before React re-renders sees it.
    setSet(aweId, entry.uid, { completed: nowDone });
    // Kept on the phone until the server confirms it: a reload mid-save puts it back and resends it.
    addPending(store(), assignedWorkoutId, pendingKey(aweId, idx + 1), { done: nowDone });
    saveSet(aweId, exerciseId, entry.uid, { ...entry, completed: nowDone }, idx);
    if (!nowDone) return;
    lastAwe.current = aweId;
    setLastSetAt(Date.now());
    setRestSecs(0);
    const lists = doneLists();
    afterExerciseChange(aweId, lists);
  }

  /** Change one set by its id, in state and in the ref at once. */
  function setSet(aweId: string, uid: string, patch: Partial<SetEntry>) {
    const cur = exStateRef.current[aweId];
    if (!cur) return;
    exStateRef.current = { ...exStateRef.current, [aweId]: { ...cur, sets: cur.sets.map((x) => (x.uid === uid ? { ...x, ...patch } : x)) } };
    setExState((prev) => {
      const ex = prev[aweId];
      return ex ? { ...prev, [aweId]: { ...ex, sets: ex.sets.map((x) => (x.uid === uid ? { ...x, ...patch } : x)) } } : prev;
    });
  }

  // ── Saving sets: one at a time, in the order they were tapped, behind the screen ──────
  const saveChain = useRef<Promise<void>>(Promise.resolve());
  const logIdRef = useRef<string | null>(existingWorkoutLogId);
  /** What the server has for each set (by uid): its row, and whether it's logged there. */
  const serverSets = useRef(new Map<string, { setLogId: string | null; completed: boolean }>());
  /** Saves still to run for each set: a failed one only rolls back when nothing newer is coming. */
  const pendingSaves = useRef(new Map<string, number>());
  /** Sets whose save is being sent again after a dropped connection (or a reload): they say what the server had, so a change made meanwhile on another device isn't overwritten. */
  const replay = useRef(new Set<string>());
  /** The values last saved for each set (by uid), so leaving a field without changing anything sends nothing. */
  const savedValues = useRef<Map<string, string> | null>(null);
  if (savedValues.current === null) {
    savedValues.current = new Map();
    for (const ex of Object.values(exState)) for (const x of ex.sets) if (x.setLogId) savedValues.current.set(x.uid, setValues(x));
  }
  /** The values of the save queued last for each set, while one is still on its way. */
  const queuedValues = useRef(new Map<string, string>());
  /** Remember a set's server state before the screen first changes it. */
  function noteServer(entry: SetEntry) {
    if (!serverSets.current.has(entry.uid)) serverSets.current.set(entry.uid, { setLogId: entry.setLogId, completed: entry.setLogId ? entry.completed : false });
  }
  function saveSet(aweId: string, exerciseId: string, uid: string, want: SetEntry, idx: number) {
    pendingSaves.current.set(uid, (pendingSaves.current.get(uid) ?? 0) + 1);
    queuedValues.current.set(uid, setValues(want));
    saveChain.current = saveChain.current.then(async () => {
      const left = (pendingSaves.current.get(uid) ?? 1) - 1;
      pendingSaves.current.set(uid, left);
      const server = serverSets.current.get(uid) ?? { setLogId: want.setLogId, completed: false };
      // Never saved, and not logged: nothing to tell the server.
      if (!server.setLogId && !want.completed) return;
      try {
        const result = await logSet({
          workoutLogId: logIdRef.current ?? undefined,
          assignedWorkoutId,
          clientId,
          exerciseId,
          assignedWorkoutExerciseId: aweId,
          setLogId: server.setLogId ?? undefined,
          setNumber: idx + 1,
          weight: want.isBodyweight || want.isBand ? null : want.weight ? parseFloat(want.weight) : null,
          bandColor: want.isBand ? want.bandColor : null,
          reps: want.reps ? parseInt(want.reps, 10) : null,
          rpe: want.rpe ? parseFloat(want.rpe) : null,
          note: want.note.trim() || null,
          completed: want.completed,
          implements: want.implements,
          date: logIdRef.current ? undefined : logDate, // only when this save creates the session
          expectDone: replay.current.has(uid) ? server.completed : undefined,
        });
        // A failed answer can come back as nothing rather than an error: that's a refusal too.
        if (!result?.setLogId || !result.workoutLogId) throw new Error("The set wasn't saved");
        replay.current.delete(uid);
        // Changed on another device while this one was offline: theirs stands, and this screen shows it.
        if (result.conflict) {
          const c = result.conflict;
          logIdRef.current = result.workoutLogId;
          serverSets.current.set(uid, { setLogId: result.setLogId, completed: c.done });
          savedValues.current?.delete(uid);
          clearStuck(uid);
          clearPending(store(), assignedWorkoutId, pendingKey(aweId, idx + 1));
          setSet(aweId, uid, { completed: c.done, setLogId: result.setLogId, ...(c.weight != null && !want.isBodyweight && !want.isBand ? { weight: String(c.weight) } : {}), ...(c.reps != null ? { reps: String(c.reps) } : {}) });
          toast(conflictMessage(idx + 1));
          return;
        }
        logIdRef.current = result.workoutLogId;
        serverSets.current.set(uid, { setLogId: result.setLogId, completed: want.completed });
        savedValues.current?.set(uid, setValues(want));
        clearStuck(uid);
        // Confirmed while the page is closing: the next page may have read the server before this
        // landed, so it stays pending there (that page clears it, or resends it harmlessly).
        if (!leaving) clearPending(store(), assignedWorkoutId, pendingKey(aweId, idx + 1), want.completed);
        setWorkoutLogId(result.workoutLogId);
        setSet(aweId, uid, { setLogId: result.setLogId });
      } catch (e) {
        // Cut off by a reload or close: it stays pending and is sent again when the page opens.
        if (leaving) return;
        // No connection: the tick stays (it's the truth on this phone) and is sent when the
        // connection is back. Only a refusal from the server puts the set back.
        if (isNetworkError(e)) {
          replay.current.add(uid);
          if (!stuckTimers.current.has(uid)) stuckTimers.current.set(uid, setTimeout(() => markUnsaved(uid, true), STUCK_MS));
          return;
        }
        // Refused: put the set back the way the server has it, unless a newer tap for it is still on its way.
        if (left > 0) return;
        clearPending(store(), assignedWorkoutId, pendingKey(aweId, idx + 1));
        setSet(aweId, uid, { completed: server.completed });
        savedValues.current?.delete(uid);
        markUnsaved(uid, true);
      }
    });
  }

  // ── Check all / Uncheck all (one exercise, or the whole workout) ──────────────
  // Each set goes through what a single tick does: on screen at once, kept on the phone until the server
  // confirms it, saved in set order. The rest timer restarts once. No toast, no flash.
  const [confirmAll, setConfirmAll] = useState<{ mode: BulkMode; count: number } | null>(null);
  function applyBulk(groups: Array<{ ex: LoggerExercise; idx: number[] }>, mode: BulkMode) {
    const done = mode === "check";
    const calls: Array<{ aweId: string; exerciseId: string; entry: SetEntry; idx: number }> = [];
    const uids = new Set<string>();
    for (const { ex, idx } of groups) {
      const sets = exStateRef.current[ex.aweId]?.sets ?? [];
      for (const i of idx) {
        const entry = sets[i];
        if (!entry) continue;
        noteServer(entry);
        clearStuck(entry.uid);
        uids.add(entry.uid);
        calls.push({ aweId: ex.aweId, exerciseId: ex.exerciseId, entry, idx: i });
      }
    }
    if (calls.length === 0) return;
    const mark = (m: Record<string, ExerciseState>) =>
      Object.fromEntries(Object.entries(m).map(([k, v]) => [k, v.sets.some((x) => uids.has(x.uid)) ? { ...v, sets: v.sets.map((x) => (uids.has(x.uid) ? { ...x, completed: done } : x)) } : v]));
    exStateRef.current = mark(exStateRef.current);
    setExState((prev) => mark(prev));
    queueBulk(store(), assignedWorkoutId, calls.map((c) => ({ aweId: c.aweId, setNumber: c.idx + 1, done })));
    for (const c of calls) saveSet(c.aweId, c.exerciseId, c.entry.uid, { ...c.entry, completed: done }, c.idx);
    if (!done) return;
    lastAwe.current = calls[calls.length - 1].aweId;
    setLastSetAt(Date.now());
    setRestSecs(0);
    const lists = doneLists();
    afterExerciseChange(calls[calls.length - 1].aweId, lists);
  }
  function bulkOne(ex: LoggerExercise, mode: BulkMode) {
    if (!settled()) return;
    const sets = exStateRef.current[ex.aweId]?.sets ?? [];
    applyBulk([{ ex, idx: bulkIndices(sets.map((x) => x.completed), mode) }], mode);
  }
  function bulkAll(mode: BulkMode) {
    if (!settled()) return;
    const groups = exercises
      .map((ex) => ({ ex, idx: bulkIndices((exStateRef.current[ex.aweId]?.sets ?? []).map((x) => x.completed), mode) }))
      .filter((g) => g.idx.length > 0);
    if (groups.length) applyBulk(groups, mode);
  }
  // ── Finish button: nothing logged does nothing; all logged finishes now; some unlogged asks once ──
  const [confirmFinish, setConfirmFinish] = useState<number | null>(null);
  function tapFinish() {
    const act = finishAction(exercises.map((e) => (exStateRef.current[e.aweId] ?? freshState(e)).sets.map((x) => x.completed)));
    if (act.kind === "none") return;
    if (act.kind === "confirm") return void setConfirmFinish(act.unlogged);
    void handleCompleteSession(true);
  }
  /** Every unlogged set is logged as it stands (its prescribed weight and reps; blank if it has none), then the session finishes. */
  function markRemainingAndFinish() {
    const groups = exercises
      .map((ex) => ({ ex, idx: bulkIndices((exStateRef.current[ex.aweId]?.sets ?? []).map((x) => x.completed), "check") }))
      .filter((g) => g.idx.length > 0);
    if (groups.length) applyBulk(groups, "check");
    void handleCompleteSession(true);
  }
  const anyLogged = exercises.some((e) => (exState[e.aweId] ?? freshState(e)).sets.some((x) => x.completed));
  const finishButton = (
    <button type="button" onClick={tapFinish} disabled={!anyLogged} className="press h-11 shrink-0 rounded-full px-3 text-[15px] font-semibold text-signal disabled:text-ink-mute disabled:opacity-60">
      Finish
    </button>
  );
  const wb = workoutBulk(exercises.map((e) => (exState[e.aweId] ?? freshState(e)).sets.map((x) => x.completed)));
  const workoutMenu = wb ? (
    <DropdownMenu>
      <DropdownMenuTrigger aria-label="More" className="flex h-11 w-11 items-center justify-center rounded-full text-ink-soft hover:bg-ink/5">
        <MoreHorizontal className="h-5 w-5" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[180px]">
        <DropdownMenuItem className="min-h-11" onClick={() => {
                    setConfirmAll({ mode: wb.mode, count: wb.count });
                  }}>
          {wb.mode === "check" ? "Check all sets" : "Uncheck all"}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  ) : null;
  // The rest pill floats at the bottom: when it starts, the next set to log is moved above it if it would sit under it.
  const pillRef = useRef<HTMLDivElement>(null);
  const lastAwe = useRef<string | null>(null);
  useEffect(() => {
    if (!lastSetAt) return;
    const id = requestAnimationFrame(() => {
      const pill = pillRef.current;
      const tick =
        document.querySelector<HTMLElement>(`section[data-exercise="${lastAwe.current}"] button[aria-label^="Log set"]`) ?? document.querySelector<HTMLElement>('button[aria-label^="Log set"]');
      if (!pill || !tick) return;
      const row = (tick.closest('[role="group"]') as HTMLElement | null) ?? tick;
      const over = row.getBoundingClientRect().bottom - (pill.getBoundingClientRect().top - 12);
      if (over > 0) window.scrollBy({ top: over, behavior: "instant" });
    });
    return () => cancelAnimationFrame(id);
  }, [lastSetAt]);

  /** Every exercise's sets as done flags, from the latest state, with one set (or one change) applied. */
  function doneLists(change?: { aweId: string; idx: number; removed?: boolean }): boolean[][] {
    return exercises.map((e) => {
      const sets = (exStateRef.current[e.aweId] ?? freshState(e)).sets.map((x) => x.completed);
      if (!change || change.aweId !== e.aweId) return sets;
      return change.removed ? sets.filter((_, i) => i !== change.idx) : sets.map((x, i) => (i === change.idx ? true : x));
    });
  }

  /**
   * An exercise just finished: its card stays open for a moment, so the check that finished it is seen (the
   * athlete logger waits the same 450 ms), then it folds and the next one with sets left opens.
   */
  function afterExerciseChange(aweId: string, lists: boolean[][]) {
    const i = exercises.findIndex((e) => e.aweId === aweId);
    const done = lists.map((l) => l.length > 0 && l.every(Boolean));
    if (i === -1 || !done[i]) return;
    setFoldOverride((prev) => ({ ...prev, [aweId]: false }));
    const n = nextOpen(done, i);
    setTimeout(() => {
      setFoldOverride((prev) => {
        const next = { ...prev };
        delete next[aweId];
        return next;
      });
      if (n != null) setTimeout(() => jumpTo(exercises[n]), 0);
    }, FOLD_DELAY_MS);
  }

  /** Delete a set that isn't logged (a long-press on its row, or Delete in its details), with an Undo. */
  function deleteSet(aweId: string, idx: number) {
    const sets = exStateRef.current[aweId].sets;
    const entry = sets[idx];
    if (!entry) return;
    if (entry.completed) return void toast("Untick the set first to delete it");
    if (sets.length <= 1) return void toast("An exercise keeps at least one set");
    removeSet(aweId, idx);
    const lists = doneLists({ aweId, idx, removed: true });
    toast(`Set ${idx + 1} deleted`, {
      action: {
        label: "Undo",
        onClick: () => {
          setExState((prev) => {
            const next = [...prev[aweId].sets];
            next.splice(idx, 0, entry);
            return { ...prev, [aweId]: { ...prev[aweId], sets: next } };
          });
        },
      },
    });
    // The sets left were all logged: that was the exercise's (or the session's) last one.
    afterExerciseChange(aweId, lists);
  }

  // Ticks the server hasn't confirmed (the page reloaded or the app closed mid-save, or the
  // connection dropped): on the screen as tapped, and sent again. On opening (before the finish
  // check below, so a restored last tick counts) and whenever the connection comes back.
  function resendPending() {
    for (const [key, tick] of Object.entries(readPending(store(), assignedWorkoutId))) {
      const [aweId, n] = key.split(":");
      const idx = Number(n) - 1;
      const entry = exStateRef.current[aweId]?.sets[idx];
      const ex = exercises.find((e) => e.aweId === aweId);
      if (!entry || !ex) continue;
      const known = serverSets.current.get(entry.uid);
      const serverHasIt = known ? known.completed === tick.done && !!known.setLogId : entry.completed === tick.done && !!entry.setLogId;
      if (serverHasIt) {
        clearPending(store(), assignedWorkoutId, key, tick.done);
        continue;
      }
      noteServer(entry);
      if (entry.completed !== tick.done) setSet(aweId, entry.uid, { completed: tick.done });
      replay.current.add(entry.uid); // sent again after a reload or a dropped connection
      saveSet(aweId, ex.exerciseId, entry.uid, { ...entry, completed: tick.done }, idx);
    }
  }
  const finishedRef = useRef(false);
  finishedRef.current = finished;
  const onOnline = useRef(() => {});
  onOnline.current = () => {
    resendPending();
  };
  useEffect(() => {
    const t = setTimeout(resendPending, 0);
    const online = () => onOnline.current();
    window.addEventListener("online", online);
    return () => {
      clearTimeout(t);
      window.removeEventListener("online", online);
    };
    // Once, on opening.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // ── An edit to a logged set (a field left): saved behind the screen, like a tick ──
  function handleUpdateCompletedSet(aweId: string, exerciseId: string, idx: number) {
    const entry = exStateRef.current[aweId]?.sets[idx];
    if (!entry || !entry.completed) return;
    // Only a real change is saved: compared with the save still on its way, or else the last one the server confirmed.
    const against = (pendingSaves.current.get(entry.uid) ?? 0) > 0 ? queuedValues.current.get(entry.uid) : savedValues.current?.get(entry.uid);
    if (against === setValues(entry)) return;
    noteServer(entry);
    saveSet(aweId, exerciseId, entry.uid, entry, idx);
  }
  /** Per hand on or off (a dumbbell or kettlebell): the sets still to do follow; a logged set saves like any edit. */
  function togglePerHand(aweId: string, exerciseId: string, idx: number) {
    const entry = exStateRef.current[aweId]?.sets[idx];
    if (!entry || !settled()) return;
    const bells = entry.implements === 2 ? 1 : 2;
    updateSet(aweId, idx, { implements: bells });
    if (!entry.completed) return;
    noteServer(entry);
    saveSet(aweId, exerciseId, entry.uid, { ...entry, implements: bells }, idx);
  }

  // ── Save coach note ───────────────────────────────────────────────────────
  async function saveNote(aweId: string, exerciseId: string) {
    const note = exState[aweId].noteInput.trim();
    if (!note) return;
    setExState((prev) => ({ ...prev, [aweId]: { ...prev[aweId], noteSaving: true } }));
    try {
      await addExerciseNote({ clientId, exerciseId, note });
      setExState((prev) => ({
        ...prev,
        [aweId]: { ...prev[aweId], noteSaving: false, noteInput: "", noteAdded: true },
      }));
      toast.success("Note saved");
    } catch {
      setExState((prev) => ({ ...prev, [aweId]: { ...prev[aweId], noteSaving: false } }));
      toast.error("Failed to save note");
    }
  }

  // ── Changing the workout on the spot ──────────────────────────────────────
  async function change(run: () => Promise<{ ok: true } | { ok: false; error: string }>, done: string, after?: () => void) {
    setBusy(true);
    try {
      const res = await run();
      if (!res.ok) {
        toast.error(res.error);
        return false;
      }
      after?.();
      toast.success(done);
      setEditingAweId(null);
      router.refresh();
      return true;
    } catch {
      toast.error("Couldn't save that change. Please try again.");
      return false;
    } finally {
      setBusy(false);
    }
  }

  /** Swap for another exercise. Sets already logged stay with the one they were done on. */
  function handleSwapExercise(aweId: string, newEx: PickerExercise) {
    return change(
      () => coachSwapExercise(clientId, assignmentId, { aweId, workoutId: assignedWorkoutId, exerciseId: newEx.id }),
      `Switched to ${newEx.name}`
    );
  }

  /** Today's sets and rep range for one exercise. Rows already logged are kept. */
  function handleSetTargets(ex: LoggerExercise, t: { sets: number; repMin: number; repMax: number }) {
    return change(
      () => coachSetTargets(clientId, assignmentId, { aweId: ex.aweId, workoutId: assignedWorkoutId, ...t }),
      `${ex.name}: ${t.sets} × ${ex.prescribedSets[0]?.unit === "secs" ? durationRange(t.repMin, t.repMax) : t.repMin === t.repMax ? t.repMax : `${t.repMin}–${t.repMax}`} today`,
      () =>
        setExState((prev) => {
          const cur = prev[ex.aweId] ?? freshState(ex);
          let sets = cur.sets.map((set) => (set.completed ? set : { ...set, reps: String(t.repMax) }));
          // Fewer sets: drop unlogged rows from the end. Never a logged one.
          for (let i = sets.length - 1; i >= 0 && sets.length > t.sets; i--) if (!sets[i].completed) sets = sets.filter((_, j) => j !== i);
          const last = sets[sets.length - 1];
          while (sets.length < t.sets) {
            sets = [...sets, { ...(last ?? initSetEntry(ex.prescribedSets[0], ex.suggestion, ex.implements)), setLogId: null, reps: String(t.repMax), rpe: "", note: "", completed: false, uid: newUid() }];
          }
          return { ...prev, [ex.aweId]: { ...cur, sets } };
        })
    );
  }

  function handleRemoveExercise(ex: LoggerExercise) {
    return change(() => coachRemoveExercise(clientId, assignmentId, { aweId: ex.aweId, workoutId: assignedWorkoutId }), `Dropped ${ex.name} from today`);
  }

  /** Added mid-session: it goes on the session's list too, which starts the session (on the day shown) if need be. */
  const addToSession = async (exerciseId: string) => {
    const res = await coachAddExercise(clientId, assignmentId, { workoutId: assignedWorkoutId, exerciseId, sets: 3, session: true, date: logIdRef.current ? undefined : logDate });
    if (res.ok) adoptLog(res.workoutLogId);
    return res;
  };
  /** The session the add started: the next tick (and a date change) belongs to it. */
  function adoptLog(id: string | undefined) {
    if (id && !logIdRef.current) {
      logIdRef.current = id;
      setWorkoutLogId(id);
    }
  }

  async function handleAddExercise(newEx: PickerExercise) {
    const ok = await change(() => addToSession(newEx.id), `Added ${newEx.name}`);
    if (ok) setAdding(false);
  }

  /** The "Last time you added …" card: today only, or the plan from now on. */
  async function handleAddLastTime(fromNowOn: boolean): Promise<boolean> {
    if (!lastAdded) return false;
    setBusy(true);
    try {
      const res = await coachAddLastTime(clientId, assignmentId, {
        workoutId: assignedWorkoutId,
        fromNowOn,
        exerciseIds: lastAdded.exercises.map((e) => e.exerciseId),
        date: logIdRef.current ? undefined : logDate,
      });
      if (!res.ok) {
        toast.error(res.error);
        return false;
      }
      adoptLog(res.workoutLogId ?? undefined);
      toast.success(addedToast(res));
      router.refresh();
      return true;
    } catch {
      toast.error("Couldn't save that change. Please try again.");
      return false;
    } finally {
      setBusy(false);
    }
  }

  // An exercise typed with no connection is put in (or swapped in) when it's back.
  const offline = usePendingExercises(assignedWorkoutId, async (op, newEx) => {
    if (exercises.some((e) => e.exerciseId === newEx.id)) return true; // already in: an earlier send got through
    return op.target.mode === "swap"
      ? change(() => coachSwapExercise(clientId, assignmentId, { aweId: op.target.mode === "swap" ? op.target.aweId : "", workoutId: assignedWorkoutId, exerciseId: newEx.id }), `Switched to ${newEx.name}`)
      : change(() => addToSession(newEx.id), `Added ${newEx.name}`);
  });

  // ── Structure SOAP note ───────────────────────────────────────────────────
  async function structureNote() {
    if (!rawInput.trim()) { toast.error("Add some notes first"); return; }
    setStructuring(true);
    try {
      const res = await fetch("/api/ai/session-structure", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId, rawInput }),
      });
      // The server's own reason when it gives one ("Not available in the demo").
      if (!res.ok) throw new Error((await res.json().catch(() => null))?.error ?? "Failed to structure notes");
      const data = await res.json();
      setStructuredNote(data.structuredNote);
      toast.success("Notes structured");
    } catch (e) {
      toast.error(e instanceof Error && e.message ? e.message : "Failed to structure notes");
    } finally {
      setStructuring(false);
    }
  }

  // ── Voice input ───────────────────────────────────────────────────────────
  function toggleRecording() {
    const SR =
      (window as Window & { SpeechRecognition?: typeof SpeechRecognition }).SpeechRecognition ||
      (window as Window & { webkitSpeechRecognition?: typeof SpeechRecognition }).webkitSpeechRecognition;
    if (!SR) { toast.error("Speech recognition not supported"); return; }
    if (recording) { recognitionRef.current?.stop(); setRecording(false); return; }
    const r = new SR();
    r.continuous = true;
    r.interimResults = true;
    r.onresult = (e: SpeechRecognitionEvent) => {
      setRawInput(Array.from(e.results).map((r) => r[0].transcript).join(" "));
    };
    r.onend = () => setRecording(false);
    r.start();
    recognitionRef.current = r;
    setRecording(true);
  }

  // ── Session notes: typed any time, before or after the session finishes ───
  // completeSession saves them again on a finished session (it keeps when it was first finished).
  // A structured (AI) note is sent once, so saving again never makes a second SessionNote.
  const [savedNotes, setSavedNotes] = useState("");
  // What the finished screen adds beyond the totals (against last time, new bests, the athlete's note, what is next). Empty until it arrives.
  const [wrap, setWrap] = useState<WrapUp | null>(null);
  const [savingNotes, setSavingNotes] = useState(false);
  const sentStructured = useRef<Record<string, unknown> | null>(null);
  async function saveNotes() {
    if (!workoutLogId || savingNotes) return;
    setSavingNotes(true);
    const fresh = structuredNote && structuredNote !== sentStructured.current ? structuredNote : undefined;
    try {
      await completeSession({
        workoutLogId,
        assignedWorkoutId,
        clientId,
        clientNotes: rawInput,
        rawInput: fresh ? rawInput : undefined,
        structuredNote: fresh,
      });
      sentStructured.current = structuredNote;
      setSavedNotes(rawInput);
      toast.success("Notes saved");
    } catch {
      toast.error("Couldn't save the notes. Please try again.");
    } finally {
      setSavingNotes(false);
    }
  }

  // ── Complete session ──────────────────────────────────────────────────────
  /** `partial`: the Finish button's "only what I logged". The automatic finish still needs every set. */
  async function handleCompleteSession(partial = false) {
    if (!partial && !allDone(doneLists())) return;
    // The finished screen shows at once, from what is on the phone; the saves and the finish go on behind it, and if
    // they don't go through it goes back to the logger with a message. (Waiting for them first took up to 2.3 s.)
    const before = { soap: soapOpen };
    setSoapOpen(true);
    setFinished(true);
    const back = (message: string) => {
      setFinished(false);
      setSoapOpen(before.soap);
      toast.error(message);
    };
    startComplete(async () => {
      // The last ticks may still be saving: wait for them, and finish only if they all stuck.
      await saveChain.current;
      const workoutLogId = logIdRef.current;
      if (!workoutLogId || (!partial && !allDone(doneLists()))) return void back("Couldn't finish the session. Please try again.");
      try {
        await completeSession({
          workoutLogId,
          assignedWorkoutId,
          clientId,
          clientNotes: rawInput.trim() ? rawInput : undefined,
          rawInput: rawInput && structuredNote ? rawInput : undefined,
          structuredNote: structuredNote ?? undefined,
        });
        sentStructured.current = structuredNote;
        setSavedNotes(rawInput);
        toast.dismiss("finish");
        // Never in the way: if it can't be worked out, the screen is just the totals and the notes.
        void sessionWrapUp({ workoutLogId }).then(setWrap).catch(() => {});
      } catch (e) {
        // No connection: the sets are kept on the phone (they're sent when it's back); only the finish needs a second tap.
        back(isNetworkError(e) ? "No connection. Your sets are saved on this phone. Tap Finish when you're back." : "Failed to complete session");
      }
    });
  }


  // ── Phone: folding and jumping ───────────────────────────────────────────
  const isDone = (ex: LoggerExercise) => {
    const sets = stateFor(ex).sets;
    return sets.length > 0 && sets.every((x) => x.completed);
  };
  const isFolded = (ex: LoggerExercise) => foldOverride[ex.aweId] ?? isDone(ex);
  const setFolded = (aweId: string, folded: boolean) => setFoldOverride((prev) => ({ ...prev, [aweId]: folded }));
  /** Open an exercise and bring it under the top bar. */
  function jumpTo(ex: LoggerExercise) {
    setFolded(ex.aweId, false);
    window.requestAnimationFrame(() =>
      window.requestAnimationFrame(() => cardRefs.current[ex.aweId]?.scrollIntoView({ behavior: "smooth", block: "start" }))
    );
  }

  // ── Week / day picker helpers ─────────────────────────────────────────────

  function getWeekNum(w: { scheduledDate: string }): number {
    return (
      Math.floor(
        (new Date(w.scheduledDate).getTime() - new Date(assignmentStartDate).getTime()) /
          (7 * 24 * 60 * 60 * 1000)
      ) + 1
    );
  }

  const allWeeks = Array.from(new Set(availableWorkouts.map(getWeekNum))).sort((a, b) => a - b);

  const workoutsInPickerWeek = [...availableWorkouts]
    .filter((w) => getWeekNum(w) === pickerWeek)
    .sort((a, b) => a.name.localeCompare(b.name));

  function handlePickerWeekChange(newWeek: number) {
    setPickerWeek(newWeek);
    const days = [...availableWorkouts]
      .filter((w) => getWeekNum(w) === newWeek)
      .sort((a, b) => a.name.localeCompare(b.name));
    const keep = days.find((w) => w.id === assignedWorkoutId);
    const next = keep ?? days.find((w) => w.status === "PLANNED") ?? days[0];
    if (next) {
      setPickerDayId(next.id);
      // Navigate immediately — week change always targets a specific workout
      if (next.id !== assignedWorkoutId) {
        router.push(`/clients/${clientId}/log?workoutId=${next.id}`);
      }
    }
  }

  function handlePickerDayChange(workoutId: string) {
    // Navigate first — don't let the state update cause a stutter before push
    if (workoutId !== assignedWorkoutId) {
      router.push(`/clients/${clientId}/log?workoutId=${workoutId}`);
    }
    setPickerDayId(workoutId);
  }

  // ── Shared day picker — native <select> triggers iOS wheel on mobile ──────
  const renderDayPicker = (lead?: React.ReactNode) => availableWorkouts.length > 1 ? (
    <div className="flex gap-2 mb-3">
      {lead}
      {/* Week selector — hidden when there's only one week */}
      {allWeeks.length > 1 && (
        <div className="relative min-w-0 flex-1">
          <select
            value={pickerWeek}
            onChange={(e) => handlePickerWeekChange(Number(e.target.value))}
            className="w-full h-11 rounded-xl border-2 border-border bg-background px-3 pr-9 text-sm font-medium appearance-none focus:outline-none focus:border-primary touch-manipulation"
            style={{ fontSize: "16px" }}
          >
            {allWeeks.map((wk) => (
              <option key={wk} value={wk}>
                Week {wk}
                {availableWorkouts.filter((w) => getWeekNum(w) === wk).every((w) => w.status === "LOGGED") ? " ✓" : ""}
              </option>
            ))}
          </select>
          <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
        </div>
      )}
      {/* Day selector */}
      <div className="relative min-w-0 flex-1">
        <select
          value={pickerDayId}
          onChange={(e) => handlePickerDayChange(e.target.value)}
          className="w-full h-11 rounded-xl border-2 border-border bg-background px-3 pr-9 text-sm font-medium appearance-none focus:outline-none focus:border-primary touch-manipulation"
          style={{ fontSize: "16px" }}
        >
          {workoutsInPickerWeek.map((w) => (
            <option key={w.id} value={w.id}>
              {w.name}
              {w.status === "LOGGED" ? " ✓" : w.status === "SKIPPED" ? " –" : ""}
            </option>
          ))}
        </select>
        <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
      </div>
    </div>
  ) : lead ? <div className="mb-3 flex">{lead}</div> : null;
  const dayPicker = renderDayPicker();

  // ── Add an exercise that isn't in the plan (both layouts) ─────────────────
  const addExercise = (
    <div className="mt-4">
      <PendingExercises pending={offline.pending} />
      <button
        type="button"
        onClick={() => setAdding(true)}
        disabled={busy}
        className="mt-2 flex h-11 w-full items-center justify-center gap-1.5 rounded-[18px] border border-dashed border-ink/20 text-sm font-medium text-muted-foreground hover:border-ink/40 hover:text-foreground disabled:opacity-50 touch-manipulation"
      >
        <Plus className="h-4 w-4" /> Add exercise
      </button>
    </div>
  );

  // The one picker sheet: adding to today, or swapping one exercise.
  const swapping = swapFor ? exercises.find((e) => e.aweId === swapFor) ?? null : null;
  const pickerSheet =
    adding || swapping ? (
      <ExercisePicker
        title={swapping ? `Swap ${swapping.name}` : "Add an exercise to today"}
        exclude={exercises.map((e) => e.exerciseId)}
        suggestLike={null}
        onClose={() => {
          setAdding(false);
          setSwapFor(null);
        }}
        onPick={(newEx) => {
          if (swapping) {
            setSwapFor(null);
            void handleSwapExercise(swapping.aweId, newEx);
          } else void handleAddExercise(newEx);
        }}
        onOffline={(name) => offline.add(name, swapping ? { mode: "swap", aweId: swapping.aweId } : { mode: "add" })}
      />
    ) : null;

  // ── Shared SOAP panel (used in both layouts) ──────────────────────────────
  const soapPanel = (
    <div className="mt-4 rounded-[18px] overflow-hidden" style={{ border: "1px solid var(--line)" }}>
      <button
        type="button"
        onClick={() => setSoapOpen((o) => !o)}
        className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium hover:bg-muted/50 transition-colors"
      >
        <span>Session Notes (SOAP)</span>
        {soapOpen ? (
          <ChevronUp className="w-4 h-4 text-muted-foreground" />
        ) : (
          <ChevronDown className="w-4 h-4 text-muted-foreground" />
        )}
      </button>
      {soapOpen && (
        <div className="px-4 pb-4 pt-1 space-y-3 border-t">
          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground">Speak or type post-session narrative.</p>
            <Button
              variant={recording ? "destructive" : "outline"}
              size="sm"
              onClick={toggleRecording}
              className="gap-1.5 h-7 text-xs"
            >
              {recording ? <><MicOff className="w-3 h-3" />Stop</> : <><Mic className="w-3 h-3" />Voice</>}
            </Button>
          </div>
          {recording && (
            <div className="flex items-center gap-2 text-xs text-[var(--destructive)]">
              <span className="w-1.5 h-1.5 rounded-full bg-[var(--destructive)] animate-pulse" />
              Recording…
            </div>
          )}
          <Textarea
            value={rawInput}
            onChange={(e) => setRawInput(e.target.value)}
            placeholder="She crushed it today — hit 95 lb on bench for the first time…"
            rows={4}
            className="text-sm resize-none font-mono"
          />
          {rawInput.trim() && !structuredNote && (
            <Button variant="outline" size="sm" onClick={structureNote} disabled={structuring} className="w-full">
              {structuring ? <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />Structuring…</> : "Structure with AI →"}
            </Button>
          )}
          {structuredNote && (
            <div className="space-y-2">
              {(["subjective", "objective", "assessment", "plan"] as const).map((key) =>
                structuredNote[key] ? (
                  <div key={key} className="text-xs">
                    <span className="font-semibold uppercase tracking-wider text-muted-foreground">{key}: </span>
                    <span>{String(structuredNote[key])}</span>
                  </div>
                ) : null
              )}
              <Button variant="ghost" size="sm" className="text-xs h-6" onClick={() => setStructuredNote(null)}>Clear</Button>
            </div>
          )}
        </div>
      )}
    </div>
  );

  // Guard — crash-safe for workouts that have no exercises yet
  if (exercises.length === 0) {
    return (
      <div className="px-5 pt-12 text-center space-y-3">
        <p className="text-muted-foreground text-sm">
          This workout has no exercises. Add exercises in the program builder first.
        </p>
        <Link
          href={`/clients/${clientId}`}
          className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
        >
          <ArrowLeft className="w-3.5 h-3.5 mr-1.5" />
          Back to {clientName}
        </Link>
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // SESSION COMPLETE
  // ═══════════════════════════════════════════════════════════════════════════

  if (finished) {
    const notesUnsaved = rawInput.trim() !== savedNotes.trim();
    let doneSetsAll = 0;
    let totalVolumeAll = 0;
    for (const ex of exercises) {
      // A timed or cardio exercise's reps are seconds: it adds no weight lifted.
      const timed = timedRx(ex.prescribedSets);
      for (const entry of stateFor(ex).sets) {
        if (entry.completed) {
          doneSetsAll++;
          const w = entry.isBodyweight || entry.isBand ? 0 : parseFloat(entry.weight) || 0;
          totalVolumeAll += setVolume({ weight: w, reps: parseInt(entry.reps, 10) || 0, timed, implements: entry.implements });
        }
      }
    }

    // Session complete (coach): the totals as a sentence, new bests, against last time, the athlete's note, the coach's own, Back.
    const first = clientName.split(" ")[0];
    const view = summaryView({ sets: doneSetsAll, volume: totalVolumeAll, minutes: Math.round(sessionElapsedSec / 60), who: first });
    return (
      <div className="rise-intro mx-auto flex max-w-lg flex-col px-5 pb-16 pt-10 text-center md:pt-14">
        <span className="pop mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-signal text-bone shadow-[0_0_0_8px_rgb(124_199_189/0.14),0_0_0_18px_rgb(124_199_189/0.06)]">
          <Check className="h-8 w-8" strokeWidth={3} />
        </span>
        <h1 className="mt-7 font-display text-4xl leading-tight text-ink">{workoutName}, done.</h1>
        <p className="mt-1 text-[15px] text-ink-mute">{clientName}</p>

        {view.kind === "sentence" ? (
          <p className="mx-auto mt-4 max-w-sm text-[22px] leading-snug text-ink-soft">
            {view.parts.map((p, i) => (p.strong ? <strong key={i} className="tnum font-semibold text-ink">{p.text}</strong> : <span key={i}>{p.text}</span>))}
          </p>
        ) : (
          <div className="mt-6 flex justify-center gap-10">
            {view.tiles.map((t) => (
              <div key={t.label}>
                <p className="tnum text-[44px] font-semibold leading-none tracking-[-0.04em] text-ink">
                  {t.value}
                  {t.unit && <span className="ml-1.5 text-[18px] font-medium tracking-normal text-ink-mute">{t.unit}</span>}
                </p>
                <p className="mt-2 text-[12px] font-semibold uppercase tracking-[0.1em] text-ink-mute">{t.label}</p>
              </div>
            ))}
          </div>
        )}

        {/* All of these come a moment after the screen itself, and any of them can be missing: they only add. */}
        <Medals medals={wrap?.medals ?? []} />
        <CompareCard compare={wrap?.compare ?? null} />
        {/* The athlete's note first (what the coach wants to read), the coach's own under it. */}
        <AthleteNote name={first} text={wrap?.athleteNote ?? null} />

        {/* Notes can still be written: the session is finished, the notes aren't. While there is typed text that isn't
            saved, Save notes is the main button. With nothing unsaved (saved, or never written) the main button is Done. */}
        <div className="mb-6 mt-3 w-full text-left">
          {soapPanel}
          {notesUnsaved ? (
            <Button className="mt-3 w-full" disabled={savingNotes} onClick={saveNotes}>
              {savingNotes ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : null}
              Save notes
            </Button>
          ) : savedNotes.trim() ? (
            <p className="mt-3 text-center text-sm text-muted-foreground" aria-live="polite">Notes saved</p>
          ) : null}
        </div>

        {notesUnsaved ? (
          <Button className="mx-auto h-12 w-full max-w-sm" variant="outline" onClick={() => router.push(`/clients/${clientId}`)}>
            Back to {clientName}
          </Button>
        ) : (
          <Button size="lg" className="mx-auto h-14 w-full max-w-sm text-[17px] font-semibold" onClick={() => router.push(`/clients/${clientId}`)}>
            Done — back to {clientName}
          </Button>
        )}
        <NextFor name={first} next={wrap?.next ?? null} />
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // MOBILE LAYOUT  (hidden on md+) — full scrollable workout view
  // ═══════════════════════════════════════════════════════════════════════════

  const mobileView = (
    <div data-live-root className="md:hidden -mt-3 pb-28">
      {/* ── Top bar ───────────────────────────────────────────────── */}
      <div className="sticky top-0 z-10 -mx-4 px-4 py-2 mb-2 bg-background/95 backdrop-blur border-b">
        <div className="flex items-center justify-between">
        <Link
          href={`/clients/${clientId}`}
          onClick={leaveToClient}
          className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "-ml-2")}
        >
          <ArrowLeft className="w-4 h-4 mr-1" />
          <span className="max-w-[100px] truncate">{clientName}</span>
        </Link>
        <div className="flex items-center gap-2">
          <div
            className="text-xs font-semibold tabular-nums px-2.5 py-1 rounded-full"
            style={{ border: "1px solid var(--line)", color: "var(--ink)" }}
          >
            {formatRest(sessionElapsedSec)}
          </div>
          {finishButton}
          {workoutMenu}
        </div>
        </div>
      </div>

      {/* ── Session date, then week and day, on one row ───────────── */}
      {completed && (
        <div className="mb-2 flex justify-center">
          <CompletedPill />
        </div>
      )}
      <button
        type="button"
        onClick={() => setWhenOpen(true)}
        aria-haspopup="dialog"
        className="mb-3 flex min-h-11 w-full items-center gap-2 rounded-xl border border-line-strong px-3 py-2 text-left text-[15px] font-medium leading-snug text-ink touch-manipulation"
      >
        <Calendar className="h-4 w-4 shrink-0 text-ink-mute" />
        <span className="min-w-0 flex-1 [overflow-wrap:anywhere]">
          {dateLabel} · Week {currentWorkoutWeek} · {workoutName}
        </span>
        <ChevronDown className="h-4 w-4 shrink-0 text-ink-mute" />
      </button>

      {lastAdded && !completed && (
        <div className="mb-3">
          <AddedLastTime workoutId={assignedWorkoutId} names={lastAdded.exercises.map((e) => e.name)} canPlan busy={busy} onAdd={handleAddLastTime} />
        </div>
      )}

      {/* ── The exercises: tap a header to fold or open; hold it to move the card ───── */}
      <div ref={drag.listRef} className="relative space-y-4">
        <SupersetOutline box={drag.groupBox} />
        {drag.lineTop != null && (
          <div aria-hidden className="pointer-events-none absolute -left-1 -right-1 z-20 flex items-center" style={{ top: drag.lineTop - 1.5 }}>
            <span className="h-2 w-2 shrink-0 rounded-full bg-dusk-teal" />
            <span className="h-[3px] flex-1 rounded-full bg-dusk-teal" />
            <span className="h-2 w-2 shrink-0 rounded-full bg-dusk-teal" />
          </div>
        )}
        {groupIntoBlocks(exercises).map((block, bi) => {
          if (block.exIndices.length === 0) return null;
          // A thin divider over Warm-up, Cool-down, and a superset ("Block 2" over 2A/2B; it goes
          // when the group splits back to singles). A single needs none: its label says it all.
          const isPart = block.section === WARMUP || block.section === COOLDOWN;
          return (
            <div key={bi} className="space-y-2">
              {(isPart || block.exIndices.length > 1) && (
                // Slides with the block's first card still in place while one is carried.
                <PartDivider title={block.title} style={drag.headingStyle(block.exIndices.map((i) => exercises[i].aweId).find((id) => id !== drag.lifted) ?? "")} />
              )}
              {block.exIndices.map((exI, k) => {
                const ex = exercises[exI];
                const state = stateFor(ex);
                const secs = ex.prescribedSets[0]?.unit === "secs";
                if (isFolded(ex)) {
                  return (
                    <section key={ex.aweId} data-exercise={ex.aweId} ref={(el) => void (cardRefs.current[ex.aweId] = el)} style={drag.styleFor(ex.aweId)} className="scroll-mt-28 rounded-2xl border border-line bg-paper">
                      <FoldedRow label={block.labels[k]} name={ex.name} sets={state.sets} unsaved={state.sets.some((x) => x.uid in unsaved)} onOpen={() => setFolded(ex.aweId, false)} hold={drag.bind(ex.aweId)} />
                      {!completed && <MoveButtons name={ex.name} {...moves(ex.aweId)} />}
                    </section>
                  );
                }
                return (
                  <section key={ex.aweId} data-exercise={ex.aweId} ref={(el) => void (cardRefs.current[ex.aweId] = el)} style={drag.styleFor(ex.aweId)} className="scroll-mt-28 rounded-2xl border border-line bg-paper px-3 pb-1 pt-2">
                    <CompactHeader ex={ex} index={block.labels[k]} onFold={() => setFolded(ex.aweId, true)} hold={drag.bind(ex.aweId)} />
                    {!completed && <MoveButtons name={ex.name} {...moves(ex.aweId)} />}

                    <SetTable
                      secs={secs}
                      bare={timedKind(ex.name, ex.notes ?? "") === "steady" ? "min" : "sec"}
                      sets={state.sets}
                      last={ex.lastSets}
                      prescribed={ex.prescribedSets}
                      onChange={(idx, patch) => updateSet(ex.aweId, idx, patch)}
                      unsaved={unsaved}
                      filled={filled}
                      onComplete={(idx) => settled() && handleComplete(ex.aweId, ex.exerciseId, idx)}
                      onBlurPersist={(idx) => handleUpdateCompletedSet(ex.aweId, ex.exerciseId, idx)}
                      onRemove={(idx) => deleteSet(ex.aweId, idx)}
                      onPerHand={ex.implements == null ? undefined : (idx) => togglePerHand(ex.aweId, ex.exerciseId, idx)}
                    />

                    <div className="flex items-center justify-between gap-2">
                      <button
                        type="button"
                        onClick={() => addSet(ex.aweId)}
                        className="logger-quiet inline-flex whitespace-nowrap items-center gap-1 px-1 py-1 text-[13px] font-medium text-ink-soft hover:text-ink"
                      >
                        <Plus className="h-3.5 w-3.5 max-[400px]:hidden" /> Add set
                      </button>
                      {exerciseBulk(state.sets.map((x) => x.completed)) && (
                        <CheckAllButton mode={exerciseBulk(state.sets.map((x) => x.completed))!} name={ex.name} onClick={() => bulkOne(ex, exerciseBulk(state.sets.map((x) => x.completed))!)} />
                      )}
                      <span className="flex-1" />
                      {state.noteAdded ? (
                        <span className="px-1 text-[13px] text-[var(--success)]">Note saved ✓</span>
                      ) : (
                        <button
                          type="button"
                          aria-expanded={state.noteOpen}
                          onClick={() => setExState((prev) => ({ ...prev, [ex.aweId]: { ...prev[ex.aweId], noteOpen: !prev[ex.aweId].noteOpen } }))}
                          className="logger-quiet inline-flex whitespace-nowrap items-center gap-1 px-1 py-1 text-[13px] font-medium text-ink-soft hover:text-ink"
                        >
                          <PencilLine className="h-3.5 w-3.5 max-[380px]:hidden" /> Note
                        </button>
                      )}
                      <ChangeButton open={editingAweId === ex.aweId} busy={busy} onClick={() => setEditingAweId((cur) => (cur === ex.aweId ? null : ex.aweId))} />
                    </div>
                    {editingAweId === ex.aweId && (
                      <div className="pb-2">
                        <ChangePanel
                          ex={ex}
                          setCount={state.sets.length}
                          busy={busy}
                          onSwap={() => setSwapFor(ex.aweId)}
                          onTargets={(t) => handleSetTargets(ex, t)}
                          onRemove={() => handleRemoveExercise(ex)}
                          media={uploadsEnabled ? <ExerciseMediaUpload workspaceId={workspaceId} exerciseId={ex.exerciseId} picture={ex.picture} /> : null}
                        />
                      </div>
                    )}
                    {state.noteOpen && !state.noteAdded && (
                      <div className="mt-1 flex gap-1.5 pb-1">
                        <Input
                          value={state.noteInput}
                          onChange={(e) =>
                            setExState((prev) => ({
                              ...prev,
                              [ex.aweId]: { ...prev[ex.aweId], noteInput: e.target.value },
                            }))
                          }
                          placeholder="Pain, adaptation, form cue…"
                          aria-label={`Note on ${ex.name}`}
                          className="h-10"
                          style={{ fontSize: "16px" }}
                          autoFocus
                          onKeyDown={(e) => {
                            if (e.key === "Enter") saveNote(ex.aweId, ex.exerciseId);
                          }}
                        />
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-10 shrink-0 px-3 text-xs"
                          disabled={!state.noteInput.trim() || state.noteSaving}
                          onClick={() => saveNote(ex.aweId, ex.exerciseId)}
                        >
                          {state.noteSaving ? <Loader2 className="h-3 w-3 animate-spin" /> : "Save"}
                        </Button>
                      </div>
                    )}
                  </section>
                );
              })}
            </div>
          );
        })}
      </div>

      {addExercise}

      {soapPanel}


      {/* ── Date, week and day: one sheet ───────────────────────────── */}
      {whenOpen && (
        <div className="fixed inset-0 z-50 flex items-end bg-black/50" onClick={() => setWhenOpen(false)}>
          <SheetLock />
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Date, week and day"
            className="w-full rounded-t-[24px] border-t border-line bg-background px-4 pt-3"
            style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 16px)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-ink">Date, week and day</h2>
              <button type="button" onClick={() => setWhenOpen(false)} aria-label="Close" className="flex h-11 w-11 items-center justify-center rounded-full text-ink-soft">
                <X className="h-5 w-5" />
              </button>
            </div>
            <label className="mb-3 block">
              <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-ink-mute">Done on</span>
              <DayInput
                value={logDate}
                max={localToday()}
                onDay={(d) => d && handleDateChange(d)}
                className="h-11 w-full rounded-xl border-2 border-border bg-background px-3 text-[16px] text-ink"
              />
            </label>
            {dayPicker}
          </div>
        </div>
      )}

      {/* ── Floating rest timer ──────────────────────────────────── */}
      {lastSetAt && (
        <div ref={pillRef} className="fixed bottom-[calc(env(safe-area-inset-bottom,0px)+80px)] left-1/2 -translate-x-1/2 z-20 flex items-center gap-3 rounded-full border bg-background/95 backdrop-blur px-4 py-2 shadow-lg">
          <Timer className="w-4 h-4 text-muted-foreground" />
          <span className="font-mono text-lg tabular-nums">{formatRest(restSecs)}</span>
          <button
            type="button"
            onClick={() => {
              setLastSetAt(Date.now());
              setRestSecs(0);
            }}
            className="text-muted-foreground touch-manipulation"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
    </div>
  );

  // ═══════════════════════════════════════════════════════════════════════════
  // DESKTOP LAYOUT  (hidden on < md)
  // ═══════════════════════════════════════════════════════════════════════════

  const desktopView = (
    <div data-live-root className="hidden md:block p-6 max-w-2xl pb-16">
      {/* Header */}
      <Link
        href={`/clients/${clientId}`}
        onClick={leaveToClient}
        className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "-ml-2 mb-4")}
      >
        <ArrowLeft className="w-4 h-4 mr-1" />
        {clientName}
      </Link>

      <div className="flex items-start justify-between mb-4 gap-3">
        <div>
          <h1 className="text-[30px] leading-[1.08] text-ink">
            {workoutName}
          </h1>
          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
            {completed && <CompletedPill />}
            <button
              type="button"
              onClick={() => dateInputRef.current?.showPicker()}
              className="inline-flex items-center gap-1 text-sm font-medium cursor-pointer hover:text-foreground transition-colors underline-offset-2 hover:underline"
              style={{ color: "var(--ink-mute)" }}
            >
              <Calendar className="w-3.5 h-3.5 shrink-0" />
              <span>{dateLabel}</span>
            </button>
            <input
              ref={dateInputRef}
              type="date"
              value={logDate}
              onChange={(e) => { if (e.target.value) handleDateChange(e.target.value); }}
              className="sr-only"
            />
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <div
            className="text-xs font-semibold tabular-nums px-2.5 py-1 rounded-full"
            style={{ border: "1px solid var(--line)", color: "var(--ink)" }}
          >
            {formatRest(sessionElapsedSec)}
          </div>
          {finishButton}
          {workoutMenu}
        </div>
      </div>

      {/* Day picker (desktop) */}
      {dayPicker}

      {/* Exercise cards — grouped by block. Drag a card by its grip (or hold its header), or use the keyboard on the grip. */}
      <div ref={dragD.listRef} className="relative space-y-4">
        <DragStatus message={dragD.status} />
        <SupersetOutline box={dragD.groupBox} />
        {dragD.lineTop != null && (
          <div aria-hidden className="pointer-events-none absolute -left-1 -right-1 z-20 flex items-center" style={{ top: dragD.lineTop - 1.5 }}>
            <span className="h-2 w-2 shrink-0 rounded-full bg-dusk-teal" />
            <span className="h-[3px] flex-1 rounded-full bg-dusk-teal" />
            <span className="h-2 w-2 shrink-0 rounded-full bg-dusk-teal" />
          </div>
        )}
        {groupIntoBlocks(exercises).map((block) =>
          block.exIndices.length === 0 ? null : (
            block.exIndices.map((exI, k) => {
          const ex = exercises[exI];
          const state = stateFor(ex);
          // A thin divider before the Warm-up and the Cool-down; blocks show through the labels.
          const showBlockHeader = k === 0 && (block.section === WARMUP || block.section === COOLDOWN);
          const blockHeaderLabel = block.title;

          return (
            <div key={ex.aweId} data-exercise={ex.aweId} style={dragD.styleFor(ex.aweId)}>
              {showBlockHeader && (
                <div className="flex items-center gap-3 pt-1 pb-0">
                  <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                    {blockHeaderLabel}
                  </span>
                  <div className="flex-1 h-px bg-border" />
                </div>
              )}
            {isFolded(ex) ? (
              <div className="mt-2 flex items-center rounded-xl border border-line bg-paper pl-1" data-drag-header="">
                {!completed && <DragHandle props={dragD.handle(ex.aweId, ex.name)} />}
                <div className="min-w-0 flex-1">
                  <FoldedRow label={block.labels[k]} name={ex.name} sets={state.sets} unsaved={state.sets.some((x) => x.uid in unsaved)} onOpen={() => setFolded(ex.aweId, false)} hold={dragD.bind(ex.aweId)} />
                </div>
              </div>
            ) : (
            <Card>
              <CardHeader className="no-select pb-2 pt-4 px-4" data-drag-header="" {...dragD.bind(ex.aweId)}>
                <div className="min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      {!completed && <DragHandle props={dragD.handle(ex.aweId, ex.name)} className="-ml-2" />}
                      <ExerciseThumb picture={ex.picture} name={ex.name} className="h-9 w-9" />
                      <CardTitle className="text-base font-semibold leading-tight min-w-0"><ExerciseName name={labelled(block.labels[k], ex.name)} /></CardTitle>
                    </div>
                    <div className="-mr-1.5 shrink-0">
                      <CollapseButton name={ex.name} onClick={() => setFolded(ex.aweId, true)} />
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">{rxLabel(ex)}</p>
                </div>
                <LastWeek ex={ex} />
              </CardHeader>

              <CardContent className="px-4 pb-4 space-y-1.5">
                {state.sets.map((entry, idx) => {
                  return (
                    <DesktopSetRow
                      key={idx}
                      idx={idx}
                      entry={entry}
                      onChange={(patch) => updateSet(ex.aweId, idx, patch)}
                      unsaved={entry.uid in unsaved}
                      bare={timedKind(ex.name, ex.notes ?? "") === "steady" ? "min" : "sec"}
                      onComplete={() => handleComplete(ex.aweId, ex.exerciseId, idx)}
                      onRemove={state.sets.length > 1 && !entry.completed ? () => removeSet(ex.aweId, idx) : undefined}
                      onPerHand={ex.implements == null ? undefined : () => togglePerHand(ex.aweId, ex.exerciseId, idx)}
                    />
                  );
                })}

                <div className="mt-1 flex items-center justify-between">
                  <button
                    type="button"
                    onClick={() => addSet(ex.aweId)}
                    className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 px-1"
                  >
                    <Plus className="w-3 h-3" />
                    Add set
                  </button>
                  {exerciseBulk(state.sets.map((x) => x.completed)) && (
                    <CheckAllButton mode={exerciseBulk(state.sets.map((x) => x.completed))!} name={ex.name} onClick={() => bulkOne(ex, exerciseBulk(state.sets.map((x) => x.completed))!)} />
                  )}
                  <ChangeButton open={editingAweId === ex.aweId} busy={busy} onClick={() => setEditingAweId((cur) => (cur === ex.aweId ? null : ex.aweId))} />
                </div>
                {editingAweId === ex.aweId && (
                  <ChangePanel
                    ex={ex}
                    setCount={state.sets.length}
                    busy={busy}
                    onSwap={() => setSwapFor(ex.aweId)}
                    onTargets={(t) => handleSetTargets(ex, t)}
                    onRemove={() => handleRemoveExercise(ex)}
                    media={uploadsEnabled ? <ExerciseMediaUpload workspaceId={workspaceId} exerciseId={ex.exerciseId} picture={ex.picture} /> : null}
                  />
                )}

                <div className="pt-2 border-t mt-2">
                  {state.noteAdded ? (
                    <p className="text-xs text-[var(--success)]">Note saved ✓</p>
                  ) : (
                    <div className="flex gap-1.5">
                      <Input
                        value={state.noteInput}
                        onChange={(e) =>
                          setExState((prev) => ({
                            ...prev,
                            [ex.aweId]: { ...prev[ex.aweId], noteInput: e.target.value },
                          }))
                        }
                        placeholder="Pain, adaptation, form cue…"
                        className="h-7 text-xs"
                        onKeyDown={(e) => { if (e.key === "Enter") saveNote(ex.aweId, ex.exerciseId); }}
                      />
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs px-2 shrink-0"
                        disabled={!state.noteInput.trim() || state.noteSaving}
                        onClick={() => saveNote(ex.aweId, ex.exerciseId)}
                      >
                        {state.noteSaving ? <Loader2 className="w-3 h-3 animate-spin" /> : "Save"}
                      </Button>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
            )}
            </div>
          );
            })
          )
        )}
      </div>

      {addExercise}

      {soapPanel}

    </div>
  );

  return (
    <>
      {mobileView}
      {desktopView}
      {confirmFinish != null && (
        <FinishSheet
          unlogged={confirmFinish}
          onCancel={() => setConfirmFinish(null)}
          onPartial={() => {
            setConfirmFinish(null);
            void handleCompleteSession(true);
          }}
          onMark={() => {
            setConfirmFinish(null);
            markRemainingAndFinish();
          }}
        />
      )}

      {keepAsk != null && <KeepSupersetSheet split={keepAsk.kind === "split"} onToday={() => setKeepAsk(null)} onKeep={() => keepSuperset(keepAsk)} />}

      {confirmAll != null && (
        <CheckAllSheet
          mode={confirmAll.mode}
          count={confirmAll.count}
          onCancel={() => setConfirmAll(null)}
          onConfirm={() => {
            const mode = confirmAll.mode;
            setConfirmAll(null);
            bulkAll(mode);
          }}
        />
      )}
      {pickerSheet}
    </>
  );
}

// ── Exercise header (phone): number, picture, name, today's target ─────────────

function CompactHeader({
  ex,
  index,
  onFold,
  hold,
}: {
  ex: LoggerExercise;
  index: number | string;
  /** Fold the card to one row (a tap on the header). */
  onFold: () => void;
  /** Holding the header picks the card up (useDragOrder). */
  hold: React.HTMLAttributes<HTMLElement>;
}) {
  const notes = Array.from(
    new Set([ex.lastNote?.trim(), ...ex.prevWorkoutSets.map((x) => x.note?.trim())].filter((x): x is string => !!x))
  );
  return (
    <div className="mb-1 min-w-0">
      <div
        {...hold}
        onClick={(e) => {
          // A tap folds the card; its own buttons (the picture, the chevron) do their own thing.
          if (!(e.target as HTMLElement).closest("button")) onFold();
        }}
        className="no-select -mr-1.5 flex cursor-pointer items-center gap-2"
      >
        <ExerciseThumb picture={ex.picture} name={ex.name} className="h-8 w-8" />
        <div className="min-w-0 flex-1">
          <ExerciseName as="h3" name={labelled(String(index), ex.name)} className="text-[17px] font-semibold leading-tight text-ink" />
          <p className="mt-0.5 text-[12px] leading-tight text-ink-mute">{rxLabel(ex)}</p>
        </div>
        <CollapseButton name={ex.name} onClick={onFold} />
      </div>
      {notes.length > 0 && (
        <p className="mt-1 line-clamp-2 border-l-2 border-[var(--success)]/40 pl-2 text-[12px] italic leading-snug text-[var(--success)]">
          {notes.map((n) => `“${n}”`).join(" ")}
        </p>
      )}
    </div>
  );
}

/** "1A: Bench Press". Warm-up and cool-down exercises are just their name (the divider says which). */
function labelled(label: string, name: string): string {
  return label === "W" || label === "C" || !label ? name : `${label}: ${name}`;
}

/** The thin divider above the Warm-up and the Cool-down. */
function PartDivider({ title, style }: { title: string; style?: React.CSSProperties }) {
  return (
    <div className="flex items-center gap-2 pt-1" style={style}>
      <span className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">{title}</span>
      <div className="h-px flex-1 bg-border" />
    </div>
  );
}

/**
 * Up, Down and "superset with the one above" for a screen reader or a keyboard: what holding and
 * dragging the card does, as buttons. Hidden until focused.
 */
function MoveButtons({ name, up, down, merge }: { name: string; up: () => void; down: () => void; merge?: () => void }) {
  const cls = "logger-quiet rounded-lg border border-line-strong px-3 py-2 text-[13px] font-medium text-ink";
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

/** The chevron in a card's top-right corner: folds the card to one row. */
function CollapseButton({ name, onClick }: { name: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-expanded
      aria-label={`Collapse ${name}`}
      className="logger-quiet flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-ink-mute hover:bg-ink/5 hover:text-ink"
    >
      <ChevronUp className="h-4 w-4" />
    </button>
  );
}

/**
 * A folded exercise: one skinny row with its badge and name, then a tick when every set is
 * logged or "3/4" when some are. Tapping anywhere on it opens the card again.
 */
function FoldedRow({ label, name, sets, unsaved, onOpen, hold = {} }: { label: string; name: string; sets: SetEntry[]; /** A set inside it hasn't saved. */ unsaved: boolean; onOpen: () => void; /** Holding the row picks the card up (useDragOrder). */ hold?: React.HTMLAttributes<HTMLElement> }) {
  const logged = sets.filter((x) => x.completed).length;
  const done = sets.length > 0 && logged === sets.length;
  return (
    <button
      type="button"
      {...hold}
      onClick={onOpen}
      aria-expanded={false}
      aria-label={`Expand ${name}`}
      className="logger-quiet no-select flex w-full items-center gap-2 py-1.5 pl-3 pr-1.5 text-left"
    >
      <ExerciseName name={labelled(label, name)} inControl className="min-w-0 flex-1 text-[16px] font-semibold leading-snug text-ink" />
      {done ? (
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--success)]/20 text-[var(--success)]" title="Every set logged">
          <Check className="h-3.5 w-3.5" strokeWidth={3} />
          <span className="sr-only">Every set logged</span>
        </span>
      ) : logged > 0 ? (
        <span className="shrink-0 text-[13px] font-semibold tabular-nums text-ink-soft">
          {logged}/{sets.length}
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

// ── Set table (phone): one thin row per set ────────────────────────────────────

/** What a number field may hold while typing: digits and one decimal point. */
function cleanNumber(v: string, decimal: boolean): string {
  const t = v.replace(",", ".").replace(decimal ? /[^\d.]/g : /\D/g, "");
  const [whole, ...rest] = t.split(".");
  return (rest.length ? `${whole}.${rest.join("")}` : whole).slice(0, 6);
}

/** A compact number field: one rounded outline, room for "102.5", the decimal keypad on phones. */
function NumField({
  value,
  onChange,
  onBlur,
  label,
  decimal,
  placeholder,
  muted = false,
}: {
  value: string;
  onChange: (v: string) => void;
  onBlur?: () => void;
  label: string;
  decimal: boolean;
  placeholder?: string;
  /** A weight carried down from an earlier set: shown muted until it is ticked or edited. */
  muted?: boolean;
}) {
  return (
    <input
      type="text"
      inputMode={decimal ? "decimal" : "numeric"}
      enterKeyHint="done"
      autoComplete="off"
      value={value}
      onChange={(e) => onChange(cleanNumber(e.target.value, decimal))}
      onFocus={(e) => e.target.select()}
      onBlur={onBlur}
      aria-label={label}
      placeholder={placeholder}
      className={cn("logger-cell h-10 w-full min-w-0 rounded-lg border border-line-strong bg-dusk-raised px-1 text-center text-[16px] tabular-nums outline-none placeholder:font-normal placeholder:text-ink-mute focus:border-ink/70", muted ? "font-normal text-ink-mute" : "font-semibold text-ink")}
    />
  );
}

/** A timed set's time as m:ss (the set keeps seconds): 15:00, 0:45. Typed entry reads as in the athlete logger; Up/Down step 30 s (1 min above 10:00). */
function TimeField({ value, onChange, onBlur, label, bare }: { value: string; onChange: (v: string) => void; onBlur?: () => void; label: string; bare: BareUnit }) {
  const [draft, setDraft] = useState<string | null>(null);
  const n = value === "" ? null : Number(value);
  const shown = draft ?? (n != null && Number.isFinite(n) && n > 0 ? formatClock(n) : "");
  return (
    <input
      type="text"
      inputMode="decimal"
      enterKeyHint="done"
      autoComplete="off"
      value={shown}
      placeholder="0:00"
      onFocus={(e) => {
        setDraft(shown);
        e.target.select();
      }}
      onChange={(e) => {
        setDraft(e.target.value);
        if (e.target.value.trim() === "") return onChange("");
        const secs = parseClock(e.target.value, bare);
        if (secs != null) onChange(String(secs));
      }}
      onKeyDown={(e) => {
        if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
        e.preventDefault();
        const next = bumpSeconds(n != null && Number.isFinite(n) ? n : null, e.key === "ArrowUp" ? 1 : -1);
        setDraft(formatClock(next));
        onChange(String(next));
      }}
      onBlur={() => {
        setDraft(null);
        onBlur?.();
      }}
      aria-label={label}
      className="logger-cell h-10 w-full min-w-0 rounded-lg border border-line-strong bg-dusk-raised px-1 text-center text-[16px] font-semibold tabular-nums text-ink outline-none placeholder:font-normal placeholder:text-ink-mute focus:border-ink/70"
    />
  );
}

/** A dumbbell or kettlebell set: ×2 when per hand (the weight is one bell, two were held), ×1 for one bell. Tap to switch. */
function PerHand({ idx, on, onToggle, className }: { idx: number; on: boolean; onToggle: () => void; className?: string }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={on}
      aria-label={on ? `Set ${idx + 1}: per hand, two bells (tap for one)` : `Set ${idx + 1}: one bell (tap for per hand)`}
      className={cn("logger-cell rounded-md px-1 py-0.5 text-[11px] font-semibold tabular-nums", on ? "bg-signal/20 text-signal" : "text-ink-mute", className)}
    >
      {on ? "×2" : "×1"}
    </button>
  );
}

const SET_GRID = "grid grid-cols-[1.5rem_2.75rem_minmax(0,1fr)_minmax(0,1fr)_2.75rem] items-center gap-1.5";

function SetTable({
  secs,
  bare,
  sets,
  last,
  prescribed,
  unsaved,
  filled,
  onChange,
  onComplete,
  onBlurPersist,
  onRemove,
  onPerHand,
}: {
  secs: boolean;
  bare: BareUnit;
  unsaved: Record<string, true>;
  /** Sets whose weight was carried down from an earlier set (by uid). */
  filled: Set<string>;
  sets: SetEntry[];
  last: LoggerExercise["lastSets"];
  prescribed: PrescribedSet[];
  onChange: (idx: number, patch: Partial<SetEntry>) => void;
  onComplete: (idx: number) => void;
  onBlurPersist: (idx: number) => void;
  onRemove: (idx: number) => void;
  /** A dumbbell or kettlebell: the ×2 / ×1 switch in the weight cell (per hand, or one bell). */
  onPerHand?: (idx: number) => void;
}) {
  const [detail, setDetail] = useState<number | null>(null);
  return (
    <div className="text-ink">
      <div aria-hidden className={cn(SET_GRID, "px-0.5 pb-0.5 text-[11px] font-semibold uppercase leading-4 tracking-wide text-ink-mute")}>
        <span className="text-center">Set</span>
        <span>Last</span>
        <span className="text-center">lb</span>
        <span className="text-center">{secs ? "Time" : "Reps"}</span>
        <span />
      </div>
      <div className="space-y-1">
        {sets.map((entry, idx) => {
          const prev = last[idx];
          // "102.5×10": breaks only before the ×, never inside a number.
          const prevLabel =
            prev && (prev.weight != null || prev.reps != null) ? (
              <>
                {prev.weight != null ? prev.weight : "BW"}
                {prev.reps != null && <span className="whitespace-nowrap">×{secs ? formatClock(prev.reps) : prev.reps}</span>}
              </>
            ) : (
              "—"
            );
          const band = BAND_COLORS.find((b) => b.id === entry.bandColor);
          const extra = Boolean(entry.note.trim() || entry.rpe);
          const persist = () => entry.completed && onBlurPersist(idx);
          const open = detail === idx;
          const showDetails = open || extra || entry.completed || entry.isBand || entry.isBodyweight || idx === sets.findIndex((x) => !x.completed);
          return (
            <div key={idx} role="group" aria-label={`Set ${idx + 1}`}>
              <HoldRow
                onHold={() => {
                  if (detail === idx) setDetail(null);
                  onRemove(idx);
                }}
                className={cn(SET_GRID, "rounded-lg px-0.5", entry.completed && "bg-[var(--success)]/[0.07]")}
              >
                {showDetails ? (
                  <button
                    type="button"
                    onClick={() => setDetail(open ? null : idx)}
                    aria-expanded={open}
                    aria-label={`Set ${idx + 1}: load type, RPE and note`}
                    className="logger-cell relative flex h-10 items-center justify-center rounded-md text-[13px] font-semibold tabular-nums text-ink-soft"
                  >
                    {idx + 1}
                    {extra && <span className="absolute right-0.5 top-2 h-1.5 w-1.5 rounded-full bg-[var(--success)]" />}
                  </button>
                ) : (
                  // A set still to do, and not the next one: just its number. (The button is on the next set, on logged sets and on any with a note.)
                  <span className="flex h-10 items-center justify-center text-[13px] font-semibold tabular-nums text-ink-mute">{idx + 1}</span>
                )}
                <span className="text-[12px] leading-tight tabular-nums text-ink-mute">{prevLabel}</span>
                <span className="min-w-0">
                  {entry.isBand || entry.isBodyweight ? (
                    <button
                      type="button"
                      onClick={() => setDetail(open ? null : idx)}
                      className="logger-cell flex h-10 w-full min-w-0 items-center justify-center gap-1.5 rounded-lg border border-line-strong bg-dusk-raised px-1 text-[13px] font-semibold"
                    >
                      {entry.isBand ? (
                        <>
                          <span className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: band?.hex }} />
                          {band?.label}
                        </>
                      ) : (
                        "BW"
                      )}
                    </button>
                  ) : (
                    <span className="relative block">
                      <NumField
                        value={entry.weight}
                        onChange={(v) => onChange(idx, { weight: v })}
                        onBlur={persist}
                        label={`Set ${idx + 1} weight in pounds`}
                        decimal
                        muted={!entry.completed && filled.has(entry.uid)}
                        placeholder={prescribed[idx]?.weight != null ? String(prescribed[idx].weight) : "lb"}
                      />
                      {onPerHand && <PerHand idx={idx} on={entry.implements === 2} onToggle={() => onPerHand(idx)} className="absolute right-0.5 top-1/2 -translate-y-1/2" />}
                    </span>
                  )}
                </span>
                <span className="min-w-0">
                  {entry.isSeconds ? (
                    <TimeField value={entry.reps} onChange={(v) => onChange(idx, { reps: v })} onBlur={persist} label={`Set ${idx + 1} time`} bare={bare} />
                  ) : (
                    <NumField
                      value={entry.reps}
                      onChange={(v) => onChange(idx, { reps: v })}
                      onBlur={persist}
                      label={`Set ${idx + 1} reps`}
                      decimal={false}
                      placeholder="reps"
                    />
                  )}
                </span>
                <button
                  type="button"
                 
                  onClick={() => onComplete(idx)}
                  aria-pressed={entry.completed}
                  aria-label={entry.completed ? `Set ${idx + 1} logged — tap to undo` : `Log set ${idx + 1}`}
                  className={cn(
                    "logger-cell relative flex h-10 w-10 items-center justify-center rounded-lg border",
                    entry.completed ? "border-[var(--success)] bg-[var(--success)] text-dusk-button-text" : "border-line-strong text-ink-mute"
                  )}
                >
                  <Check className="h-4 w-4" strokeWidth={2.5} />
                  <UnsavedDot show={entry.uid in unsaved} />
                </button>
              </HoldRow>
              {open && (
                <SetDetails
                  idx={idx}
                  entry={entry}
                  onChange={(patch) => onChange(idx, patch)}
                  onBlur={persist}
                  onDelete={() => {
                    setDetail(null);
                    onRemove(idx);
                  }}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** The rarer parts of a set, opened from its number: load type, time, RPE, a note. */
function SetDetails({
  idx,
  entry,
  onChange,
  onBlur,
  onDelete,
}: {
  idx: number;
  entry: SetEntry;
  onChange: (patch: Partial<SetEntry>) => void;
  onBlur: () => void;
  /** The same as holding the row: here for anyone who can't long-press. */
  onDelete: () => void;
}) {
  const mode = entry.isBand ? "band" : entry.isBodyweight ? "bw" : "weight";
  const seg = (on: boolean) =>
    cn("logger-cell h-8 rounded-md px-2.5 text-[13px] font-medium", on ? "bg-dusk-selected text-dusk-selected-text" : "text-ink-soft");
  return (
    <div className="my-1 ml-7 space-y-2 rounded-xl bg-ink/[0.04] p-2">
      <div className="flex flex-wrap items-center gap-1.5">
        <div className="flex rounded-lg border border-line p-0.5" role="group" aria-label={`Set ${idx + 1} load`}>
          <button type="button" className={seg(mode === "weight")} aria-pressed={mode === "weight"} onClick={() => onChange({ isBodyweight: false, isBand: false })}>Weight</button>
          <button type="button" className={seg(mode === "bw")} aria-pressed={mode === "bw"} onClick={() => onChange({ isBodyweight: true, isBand: false, weight: "" })}>BW</button>
          <button type="button" className={seg(mode === "band")} aria-pressed={mode === "band"} onClick={() => onChange({ isBodyweight: false, isBand: true })}>Band</button>
        </div>
        <div className="flex rounded-lg border border-line p-0.5" role="group" aria-label={`Set ${idx + 1} counted in`}>
          <button type="button" className={seg(!entry.isSeconds)} aria-pressed={!entry.isSeconds} onClick={() => onChange({ isSeconds: false })}>Reps</button>
          <button type="button" className={seg(entry.isSeconds)} aria-pressed={entry.isSeconds} onClick={() => onChange({ isSeconds: true })}>Time</button>
        </div>
      </div>
      {entry.isBand && (
        <div className="flex gap-1.5" role="group" aria-label="Band colour">
          {BAND_COLORS.map(({ id, label, hex }) => (
            <button
              key={id}
              type="button"
              title={label}
              aria-label={`${label} band`}
              aria-pressed={entry.bandColor === id}
              onClick={() => onChange({ bandColor: id })}
              className={cn("logger-cell flex h-8 flex-1 items-center justify-center rounded-lg border-2", entry.bandColor === id ? "border-ink" : "border-transparent opacity-70")}
              style={{ backgroundColor: hex }}
            >
              {entry.bandColor === id && <Check className="h-3.5 w-3.5 text-white drop-shadow" strokeWidth={3} />}
            </button>
          ))}
        </div>
      )}
      <div className="flex flex-wrap items-start gap-1.5">
        <label className="flex h-10 shrink-0 items-center gap-1.5 text-[12px] font-semibold uppercase tracking-wide text-ink-mute">
          RPE
          <span className="w-14">
            <NumField value={entry.rpe} onChange={(v) => onChange({ rpe: v })} onBlur={onBlur} label={`Set ${idx + 1} RPE`} decimal placeholder="–" />
          </span>
        </label>
        <SetNote
          value={entry.note}
          onChange={(note) => onChange({ note })}
          onBlur={onBlur}
          label={`Set ${idx + 1} note`}
          // Beside RPE at rest; while it is being written it takes the whole row (a 190 px box wraps five short lines into eight).
          className="logger-cell min-w-0 flex-1 basis-0 rounded-md border border-input bg-transparent px-2 py-[9px] text-ink outline-none placeholder:text-muted-foreground focus:basis-full focus:border-ring"
          fontSize="16px"
        />
      </div>
      {!entry.completed && (
        <button type="button" onClick={onDelete} className="logger-quiet inline-flex items-center gap-1 py-1 text-[13px] font-medium text-[var(--destructive)]">
          <Trash2 className="h-3.5 w-3.5" /> Delete set
        </button>
      )}
    </div>
  );
}

/**
 * A set's row. Holding it (anywhere but a number field or the check) deletes the set; the tap that ends
 * a hold is swallowed, so the set number's own tap doesn't also open its details.
 */
function HoldRow({ onHold, className, children }: { onHold: () => void; className: string; children: React.ReactNode }) {
  const press = useLongPress(onHold);
  return (
    <div
      className={cn(className, "select-none [-webkit-touch-callout:none]")}
      onPointerDown={(e) => {
        // Not in a number field, and not on the check (a slow tap on it must still log the set).
        if ((e.target as HTMLElement).closest("input, [aria-pressed]")) return;
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

// ── Changing one exercise on the spot ──────────────────────────────────────────

function ChangeButton({ open, busy, onClick }: { open: boolean; busy: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      aria-expanded={open}
      className={cn(
        "logger-quiet inline-flex whitespace-nowrap items-center gap-1 px-1 py-1 text-[13px] font-medium disabled:opacity-50",
        open ? "text-ink" : "text-ink-soft hover:text-ink"
      )}
    >
      {open ? <X className="h-3.5 w-3.5 max-[380px]:hidden" /> : <SlidersHorizontal className="h-3.5 w-3.5 max-[380px]:hidden" />}
      {open ? "Close" : "Change"}
    </button>
  );
}

/**
 * Swap the exercise, change today's sets and reps, or drop it from today.
 * Saved to this one workout; the rest of the plan stays as written.
 */
function ChangePanel({
  ex,
  setCount,
  busy,
  onSwap,
  onTargets,
  onRemove,
  media,
}: {
  /** The coach's own photo or clip for this exercise (when uploads are set up). */
  media?: React.ReactNode;
  ex: LoggerExercise;
  setCount: number;
  busy: boolean;
  onSwap: () => void;
  onTargets: (t: { sets: number; repMin: number; repMax: number }) => void;
  onRemove: () => void;
}) {
  const ps0 = ex.prescribedSets[0];
  const secs = ps0?.unit === "secs";
  const [sets, setSets] = useState(String(setCount || ex.prescribedSets.length || 3));
  const bare: BareUnit = timedKind(ex.name, ex.notes ?? "") === "steady" ? "min" : "sec";
  const [lo, setLo] = useState(secs ? formatClock(ps0?.repMin ?? 30) : String(ps0?.repMin ?? 8));
  const [hi, setHi] = useState(secs ? formatClock(ps0?.repMax ?? ps0?.repMin ?? 60) : String(ps0?.repMax ?? ps0?.repMin ?? 10));
  const [confirmRemove, setConfirmRemove] = useState(false);

  const n = (v: string) => (secs ? (parseClock(v, bare) ?? NaN) : parseInt(v, 10));
  const valid = n(sets) >= 1 && n(sets) <= 12 && n(lo) >= 1 && n(hi) >= 1;
  const box = "h-10 w-16 rounded-lg border border-border bg-background text-center text-base tabular-nums focus:outline-none focus:border-primary";

  return (
    <div className="mt-2 space-y-4 rounded-xl bg-muted/40 p-3">
      <div>
        <button type="button" onClick={onSwap} className="press flex min-h-11 items-center rounded-lg border border-line px-3.5 text-sm font-medium text-ink hover:border-ink/25">
          Swap for another exercise
        </button>
      </div>

      <div>
        <p className="mb-1.5 text-xs font-semibold text-muted-foreground">Today&rsquo;s sets &amp; {secs ? "time (min:sec)" : "reps"}</p>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <input aria-label="Sets" inputMode="numeric" value={sets} onChange={(e) => setSets(e.target.value.replace(/\D/g, ""))} className={box} />
          <span className="text-muted-foreground">×</span>
          <input aria-label={secs ? "Time from" : "Reps from"} inputMode={secs ? "decimal" : "numeric"} value={lo} onChange={(e) => setLo(secs ? e.target.value : e.target.value.replace(/\D/g, ""))} className={box} />
          <span className="text-muted-foreground">–</span>
          <input aria-label={secs ? "Time to" : "Reps to"} inputMode={secs ? "decimal" : "numeric"} value={hi} onChange={(e) => setHi(secs ? e.target.value : e.target.value.replace(/\D/g, ""))} className={box} />
          <Button
            size="sm"
            className="h-10"
            disabled={busy || !valid}
            onClick={() => onTargets({ sets: n(sets), repMin: Math.min(n(lo), n(hi)), repMax: Math.max(n(lo), n(hi)) })}
          >
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Save"}
          </Button>
        </div>
        <p className="mt-1 text-[11px] text-muted-foreground">Just this session. The rest of the plan stays as written.</p>
      </div>

      {media && (
        <div>
          <p className="mb-1.5 text-xs font-semibold text-muted-foreground">Picture</p>
          {media}
        </div>
      )}

      <div className="border-t pt-3">
        <button
          type="button"
          disabled={busy}
          onClick={() => (confirmRemove ? onRemove() : setConfirmRemove(true))}
          className="inline-flex items-center gap-1.5 text-xs font-medium text-[var(--destructive)] disabled:opacity-50"
        >
          <Trash2 className="h-3.5 w-3.5" />
          {confirmRemove ? `Tap again to drop ${ex.name} from today` : "Skip this exercise today"}
        </button>
      </div>
    </div>
  );
}

// ── Mobile SetRow ─────────────────────────────────────────────────────────────

// ── Desktop SetRow ──────────────────────────────────────────────────────────────

function DesktopSetRow({
  idx,
  entry,
  unsaved,
  onChange,
  onComplete,
  onRemove,
  onPerHand,
  bare = "sec",
}: {
  unsaved: boolean;
  onRemove?: () => void;
  /** A dumbbell or kettlebell: the ×2 / ×1 switch (per hand, or one bell). */
  onPerHand?: () => void;
  bare?: BareUnit;
  idx: number;
  entry: SetEntry;
  onChange: (patch: Partial<SetEntry>) => void;
  onComplete: () => void;
}) {

  return (
    <div className="space-y-0.5">
      <div className={cn("flex items-center gap-1.5", entry.completed && "opacity-60")}>
        <span className="text-xs text-muted-foreground w-5 shrink-0 text-right">{idx + 1}</span>

        {/* Load type: weight / BW / band */}
        {entry.isBand ? (
          <div className="flex items-center gap-1 shrink-0">
            {BAND_COLORS.map(({ id, hex }) => (
              <button
                key={id}
                type="button"
                title={id}
                onClick={() => onChange({ bandColor: id })}
                className={cn(
                  "w-5 h-5 rounded-full border-2 transition-all",
                  entry.bandColor === id ? "border-foreground scale-110" : "border-transparent opacity-60"
                )}
                style={{ backgroundColor: hex }}
              />
            ))}
          </div>
        ) : entry.isBodyweight ? (
          <button
            type="button"
            onClick={() => onChange({ isBodyweight: false, weight: "" })}
            className="h-7 w-16 text-xs text-center rounded-md border border-border bg-muted font-medium hover:bg-muted/70 shrink-0"
          >
            BW
          </button>
        ) : (
          <Input
            value={entry.weight}
            onChange={(e) => onChange({ weight: e.target.value })}
            placeholder="lb"
            className="h-7 w-16 text-xs text-center px-1"
            type="number"
            step="2.5"
          />
        )}
        {onPerHand && !entry.isBand && !entry.isBodyweight && <PerHand idx={idx} on={entry.implements === 2} onToggle={onPerHand} className="shrink-0" />}

        {/* Load mode toggle: BW / Band / N/A */}
        <button
          type="button"
          onClick={() => {
            if (!entry.isBodyweight && !entry.isBand) onChange({ isBodyweight: true, isBand: false, weight: "" });
            else if (entry.isBodyweight) onChange({ isBodyweight: false, isBand: true });
            else onChange({ isBodyweight: false, isBand: false });
          }}
          className={cn(
            "text-xs px-1.5 h-7 rounded border shrink-0 transition-colors",
            entry.isBodyweight ? "border-[color-mix(in_srgb,var(--dusk-teal)_30%,transparent)] text-[var(--success)] bg-[color-mix(in_srgb,var(--dusk-teal)_7%,transparent)]" :
            entry.isBand ? "border-[color-mix(in_srgb,var(--dusk-teal)_30%,transparent)] text-[var(--blue-deep)] bg-[color-mix(in_srgb,var(--dusk-teal)_7%,transparent)]" :
            "border-border text-muted-foreground hover:border-muted-foreground"
          )}
        >
          {entry.isBodyweight ? "BW" : entry.isBand ? "Band" : "N/A"}
        </button>

        {/* Reps/Secs toggle — click to switch unit */}
        <button
          type="button"
          title={entry.isSeconds ? "Switch to reps" : "Switch to time"}
          onClick={() => onChange({ isSeconds: !entry.isSeconds })}
          className={cn(
            "text-xs px-1.5 h-7 rounded border shrink-0 transition-colors font-medium",
            entry.isSeconds
              ? "border-[color-mix(in_srgb,var(--dusk-teal)_30%,transparent)] text-[var(--blue-deep)] bg-[color-mix(in_srgb,var(--dusk-teal)_7%,transparent)] hover:bg-[color-mix(in_srgb,var(--dusk-teal)_12%,transparent)]"
              : "border-border text-muted-foreground hover:border-muted-foreground"
          )}
        >
          {entry.isSeconds ? "s" : "×"}
        </button>
        {entry.isSeconds ? (
          <input
            type="text"
            inputMode="decimal"
            value={entry.reps === "" ? "" : formatClock(Number(entry.reps))}
            onChange={(e) => {
              const secs = parseClock(e.target.value, bare);
              if (e.target.value.trim() === "") onChange({ reps: "" });
              else if (secs != null) onChange({ reps: String(secs) });
            }}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); onComplete(); } }}
            placeholder="0:00"
            aria-label={`Set ${idx + 1} time`}
            className="h-7 w-16 rounded-md border border-input bg-background text-xs text-center px-1"
          />
        ) : (
          <Input
            value={entry.reps}
            onChange={(e) => onChange({ reps: e.target.value })}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); onComplete(); } }}
            placeholder="reps"
            className="h-7 w-14 text-xs text-center px-1"
            type="number"
          />
        )}

        <span className="text-xs text-muted-foreground shrink-0">RPE</span>
        <Input
          value={entry.rpe}
          onChange={(e) => onChange({ rpe: e.target.value })}
          placeholder="—"
          className="h-7 w-12 text-xs text-center px-1"
          type="number"
          step="0.5"
          min="1"
          max="10"
        />

        <button
          type="button"
          onClick={onComplete}
          className={cn(
            "relative ml-1 w-7 h-7 rounded flex items-center justify-center shrink-0 border",
            entry.completed
              ? "bg-[var(--success)] border-[var(--success)] text-dusk-button-text"
              : "border-border text-muted-foreground hover:border-[color-mix(in_srgb,var(--dusk-teal)_30%,transparent)] hover:text-[var(--success)]"
          )}
        >
          <Check className="w-3 h-3" />
          <UnsavedDot show={unsaved} />
        </button>
        {onRemove ? (
          <button type="button" onClick={onRemove} title="Remove set" aria-label={`Remove set ${idx + 1}`} className="w-6 h-7 flex items-center justify-center shrink-0 text-muted-foreground hover:text-[var(--destructive)]">
            <X className="w-3.5 h-3.5" />
          </button>
        ) : (
          <span className="w-6 shrink-0" />
        )}
      </div>

      {/* Per-set note (desktop) */}
      <div className="pl-7">
        <SetNote
          value={entry.note}
          onChange={(note) => onChange({ note })}
          label="Set note"
          className="rounded-md border border-transparent bg-transparent px-2 py-[3px] text-xs text-muted-foreground outline-none hover:border-border focus:border-border"
        />
      </div>
    </div>
  );
}
