"use client";

/// <reference types="@types/dom-speech-recognition" />

import { useEffect, useRef, useState, useTransition } from "react";
import { parts, structure } from "@/lib/workouts/structure";
import { LIVE_EVENT, clearLive, mergeDraft, readLive, startLive, writeLive, type LiveSession } from "@/lib/sessions/live";
import { ExerciseThumb } from "@/components/ExercisePicture";
import { ExerciseMediaUpload } from "@/components/coach/ExerciseMediaUpload";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  ArrowLeft,
  Calendar,
  SlidersHorizontal,
  Trash2,
  Check,
  ChevronDown,
  ChevronUp,
  ChevronsDownUp,
  ChevronsUpDown,
  Loader2,
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
  addExerciseNote,
  updateSessionDate,
} from "@/lib/actions/workout-logger";
import { coachAddExercise, coachRemoveExercise, coachSetTargets, coachSwapExercise } from "@/lib/actions/coach-plan";
import { ExercisePicker, type ExerciseOption } from "@/app/(dashboard)/programs/_components/ExercisePicker";
import type { LoggerExercise, PrescribedSet, ExistingSetLog } from "./page";
import { ExerciseName } from "@/components/ExerciseName";

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
  saving: boolean;
};

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

function formatRest(secs: number): string {
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function initSetEntry(
  ps: PrescribedSet,
  suggestion: LoggerExercise["suggestion"],
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
      saving: false,
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
    saving: false,
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
    const sets = ex.prescribedSets.map((ps) => {
      const existing = exLogs.find((s) => s.setNumber === ps.setNumber);
      return initSetEntry(ps, ex.suggestion, existing);
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

/** "3 × 8–12", "1 × 5 min", "3 × 30s". */
function rxLabel(ex: LoggerExercise): string {
  const p = ex.prescribedSets[0];
  if (!p) return "";
  const n = ex.prescribedSets.length;
  if (p.unit === "secs") {
    if (p.repMax >= 60 && p.repMax % 60 === 0 && p.repMin % 60 === 0) {
      return `${n} × ${p.repMin === p.repMax ? p.repMax / 60 : `${p.repMin / 60}–${p.repMax / 60}`} min`;
    }
    return `${n} × ${p.repMin === p.repMax ? p.repMax : `${p.repMin}–${p.repMax}`}s`;
  }
  return `${n} × ${p.repMin === p.repMax ? p.repMax : `${p.repMin}–${p.repMax}`}`;
}

/** "3 × 12 @ 15 lb", "5 min", "12, 10, 8 @ Blue band": identical sets collapse into one. */
function describeSets(sets: Array<{ weight: number | null; bandColor?: string | null; reps: number | null }>, secs: boolean): string {
  if (sets.length === 0) return "";
  const amount = (r: number | null) => (r == null ? "" : secs ? (r >= 60 && r % 60 === 0 ? `${r / 60} min` : `${r}s`) : `${r}`);
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
  return { sets: ex.prescribedSets.map((ps) => initSetEntry(ps, ex.suggestion)), noteInput: "", noteSaving: false, noteAdded: false };
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

/** An exercise's badge by its index: "1A", "2", "W" or "C". */
function exerciseLabel(exercises: LoggerExercise[], index: number): string {
  for (const b of groupIntoBlocks(exercises)) {
    const k = b.exIndices.indexOf(index);
    if (k >= 0) return b.labels[k];
  }
  return String(index + 1);
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
  exercises,
  existingWorkoutLogId,
  sessionDate,
  existingSetLogs,
  availableWorkouts,
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
  workspaceId: string;
  exercises: LoggerExercise[];
  existingWorkoutLogId: string | null;
  /** The existing session's date (YYYY-MM-DD), when resuming one. */
  sessionDate: string | null;
  existingSetLogs: ExistingSetLog[];
  availableWorkouts: WorkoutOption[];
}) {
  const router = useRouter();

  // ── Shared state ────────────────────────────────────────────────────────────
  const [workoutLogId, setWorkoutLogId] = useState<string | null>(existingWorkoutLogId);
  const [exState, setExState] = useState<Record<string, ExerciseState>>(() =>
    buildInitialState(exercises, existingSetLogs)
  );
  const [soapOpen, setSoapOpen] = useState(false);
  const [rawInput, setRawInput] = useState("");
  const [structuredNote, setStructuredNote] = useState<Record<string, unknown> | null>(null);
  const [structuring, setStructuring] = useState(false);
  const [recording, setRecording] = useState(false);
  const [completing, startComplete] = useTransition();
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
    const prev = readLive(store);
    const live = startLive(prev, {
      assignedWorkoutId,
      clientId,
      clientName,
      workoutName,
      href: `/clients/${clientId}/log?workoutId=${assignedWorkoutId}`,
      workoutLogId: existingWorkoutLogId,
    });
    liveRef.current = live;
    writeLive(store, live);
    window.dispatchEvent(new Event(LIVE_EVENT));
    setSessionStart(live.startedAt);
    if (prev?.assignedWorkoutId === assignedWorkoutId) {
      restoringRef.current = prev.draft != null;
      setExState((cur) => mergeDraft(cur, prev, { assignedWorkoutId, workoutLogId: existingWorkoutLogId }));
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

  // Keep what's typed and the session id. (Which cards are folded is this screen's alone.)
  useEffect(() => {
    if (!liveRef.current || finished) return;
    // The restore is still on its way into exState: the next run saves the merged state.
    if (restoringRef.current) {
      restoringRef.current = false;
      return;
    }
    const draft = Object.fromEntries(
      Object.entries(exState).map(([aweId, st]) => [aweId, { ...st, noteSaving: false, sets: st.sets.map((x) => ({ ...x, saving: false })) }])
    );
    liveRef.current = { ...liveRef.current, draft, openBlocks: [], workoutLogId: workoutLogId ?? liveRef.current.workoutLogId, updatedAt: Date.now() };
    try {
      writeLive(window.localStorage, liveRef.current);
    } catch {
      // no storage: nothing to keep
    }
  }, [exState, workoutLogId, finished]);

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
  // Folded cards. An exercise folds by itself once every set is logged; a tap on its chevron
  // folds (true) or opens (false) it by hand. Kept on this screen only, never saved.
  const [foldOverride, setFoldOverride] = useState<Record<string, boolean>>({});
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

  const isResuming = existingWorkoutLogId != null;
  const dateLabel = new Date(logDate + "T12:00:00").toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
  const anyCompleted = Object.values(exState).some((ex) => ex.sets.some((s) => s.completed));

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
  const CARRY_KEYS: (keyof SetEntry)[] = ["weight", "isBodyweight", "isBand", "bandColor", "reps", "isSeconds"];

  function updateSet(aweId: string, idx: number, patch: Partial<SetEntry>) {
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
        saving: false,
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
  async function handleComplete(aweId: string, exerciseId: string, idx: number) {
    const entry = exState[aweId].sets[idx];
    if (entry.saving) return;
    updateSet(aweId, idx, { saving: true });
    try {
      const result = await logSet({
        workoutLogId: workoutLogId ?? undefined,
        assignedWorkoutId,
        clientId,
        exerciseId,
        assignedWorkoutExerciseId: aweId,
        setLogId: entry.setLogId ?? undefined,
        setNumber: idx + 1,
        weight: (entry.isBodyweight || entry.isBand) ? null : (entry.weight ? parseFloat(entry.weight) : null),
        bandColor: entry.isBand ? entry.bandColor : null,
        reps: entry.reps ? parseInt(entry.reps, 10) : null,
        rpe: entry.rpe ? parseFloat(entry.rpe) : null,
        note: entry.note.trim() || null,
        completed: !entry.completed,
        date: workoutLogId ? undefined : logDate, // pass override only on first create
      });
      if (!workoutLogId) setWorkoutLogId(result.workoutLogId);
      updateSet(aweId, idx, {
        saving: false,
        completed: !entry.completed,
        setLogId: result.setLogId,
      });
      // Logging the last open set folds the exercise to one row (whatever was set by hand before).
      if (!entry.completed && exState[aweId].sets.every((x, i) => i === idx || x.completed)) {
        setFoldOverride((prev) => {
          const next = { ...prev };
          delete next[aweId];
          return next;
        });
      }
      // Mobile: start rest timer + show an "Undo" toast
      if (!entry.completed) {
        setLastSetAt(Date.now());
        setRestSecs(0);
        toast.success(`Set ${idx + 1} logged`, {
          action: { label: "Undo", onClick: () => handleUndo(aweId, idx) },
        });
      }
    } catch {
      toast.error("Failed to save set");
      updateSet(aweId, idx, { saving: false });
    }
  }

  // ── Update an already-completed set (keeps completed = true) ─────────────
  async function handleUpdateCompletedSet(aweId: string, exerciseId: string, idx: number) {
    const entry = exState[aweId].sets[idx];
    if (entry.saving) return;
    updateSet(aweId, idx, { saving: true });
    try {
      const result = await logSet({
        workoutLogId: workoutLogId ?? undefined,
        assignedWorkoutId,
        clientId,
        exerciseId,
        assignedWorkoutExerciseId: aweId,
        setLogId: entry.setLogId ?? undefined,
        setNumber: idx + 1,
        weight: (entry.isBodyweight || entry.isBand) ? null : (entry.weight ? parseFloat(entry.weight) : null),
        bandColor: entry.isBand ? entry.bandColor : null,
        reps: entry.reps ? parseInt(entry.reps, 10) : null,
        rpe: entry.rpe ? parseFloat(entry.rpe) : null,
        note: entry.note.trim() || null,
        completed: true,
        date: workoutLogId ? undefined : logDate,
      });
      if (!workoutLogId) setWorkoutLogId(result.workoutLogId);
      updateSet(aweId, idx, { saving: false, setLogId: result.setLogId });
      toast.success(`Set ${idx + 1} updated`);
    } catch {
      toast.error("Failed to update set");
      updateSet(aweId, idx, { saving: false });
    }
  }

  // ── Undo last set ─────────────────────────────────────────────────────────
  function handleUndo(aweId: string, idx: number) {
    updateSet(aweId, idx, { completed: false, setLogId: null });
    toast("Set undone");
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
  function handleSwapExercise(aweId: string, newEx: ExerciseOption) {
    return change(
      () => coachSwapExercise(clientId, assignmentId, { aweId, workoutId: assignedWorkoutId, exerciseId: newEx.id }),
      `Switched to ${newEx.name}`
    );
  }

  /** Today's sets and rep range for one exercise. Rows already logged are kept. */
  function handleSetTargets(ex: LoggerExercise, t: { sets: number; repMin: number; repMax: number }) {
    return change(
      () => coachSetTargets(clientId, assignmentId, { aweId: ex.aweId, workoutId: assignedWorkoutId, ...t }),
      `${ex.name}: ${t.sets} × ${t.repMin === t.repMax ? t.repMax : `${t.repMin}–${t.repMax}`}${ex.prescribedSets[0]?.unit === "secs" ? "s" : ""} today`,
      () =>
        setExState((prev) => {
          const cur = prev[ex.aweId] ?? freshState(ex);
          let sets = cur.sets.map((set) => (set.completed ? set : { ...set, reps: String(t.repMax) }));
          // Fewer sets: drop unlogged rows from the end. Never a logged one.
          for (let i = sets.length - 1; i >= 0 && sets.length > t.sets; i--) if (!sets[i].completed) sets = sets.filter((_, j) => j !== i);
          const last = sets[sets.length - 1];
          while (sets.length < t.sets) {
            sets = [...sets, { ...(last ?? initSetEntry(ex.prescribedSets[0], ex.suggestion)), setLogId: null, reps: String(t.repMax), rpe: "", note: "", completed: false, saving: false }];
          }
          return { ...prev, [ex.aweId]: { ...cur, sets } };
        })
    );
  }

  function handleRemoveExercise(ex: LoggerExercise) {
    return change(() => coachRemoveExercise(clientId, assignmentId, { aweId: ex.aweId, workoutId: assignedWorkoutId }), `Dropped ${ex.name} from today`);
  }

  async function handleAddExercise(newEx: ExerciseOption) {
    const ok = await change(
      () => coachAddExercise(clientId, assignmentId, { workoutId: assignedWorkoutId, exerciseId: newEx.id, sets: 3 }),
      `Added ${newEx.name}`
    );
    if (ok) setAdding(false);
  }

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
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setStructuredNote(data.structuredNote);
      toast.success("Notes structured");
    } catch {
      toast.error("Failed to structure notes");
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

  // ── Complete session ──────────────────────────────────────────────────────
  async function handleCompleteSession() {
    if (!workoutLogId) { toast.error("Log at least one set before completing"); return; }
    startComplete(async () => {
      try {
        await completeSession({
          workoutLogId,
          assignedWorkoutId,
          clientId,
          clientNotes: rawInput || undefined,
          rawInput: rawInput && structuredNote ? rawInput : undefined,
          structuredNote: structuredNote ?? undefined,
        });
        toast.success("Session complete");
        setFinished(true);
      } catch {
        toast.error("Failed to complete session");
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
  /** Any card open? Decides whether the jump bar offers "Collapse all" or "Expand all". */
  const anyOpen = exercises.some((e) => !isFolded(e));
  function foldAll(folded: boolean) {
    setFoldOverride(Object.fromEntries(exercises.map((e) => [e.aweId, folded])));
  }
  /** Open an exercise and bring it under the top bar. */
  function jumpTo(ex: LoggerExercise) {
    setFolded(ex.aweId, false);
    window.requestAnimationFrame(() =>
      window.requestAnimationFrame(() => cardRefs.current[ex.aweId]?.scrollIntoView({ behavior: "smooth", block: "start" }))
    );
  }
  /** The exercise to do next: the first with a set still to log. */
  const upNext = exercises.find((e) => !isDone(e))?.aweId ?? null;

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
      {adding ? (
        <div className="rounded-[18px] p-3" style={{ border: "1px solid var(--line)" }}>
          <div className="mb-2 flex items-center justify-between">
            <p className="text-sm font-medium">Add an exercise to today</p>
            <button type="button" onClick={() => setAdding(false)} aria-label="Cancel" className="text-muted-foreground hover:text-foreground">
              <X className="h-4 w-4" />
            </button>
          </div>
          <ExercisePicker onSelect={(newEx) => handleAddExercise(newEx)} placeholder="Search exercises…" />
          {busy && <p className="mt-2 text-xs text-muted-foreground">Adding…</p>}
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setAdding(true)}
          disabled={busy}
          className="flex h-11 w-full items-center justify-center gap-1.5 rounded-[18px] border border-dashed border-ink/20 text-sm font-medium text-muted-foreground hover:border-ink/40 hover:text-foreground disabled:opacity-50 touch-manipulation"
        >
          <Plus className="h-4 w-4" /> Add exercise
        </button>
      )}
    </div>
  );

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
    let doneSetsAll = 0;
    let totalVolumeAll = 0;
    for (const ex of exercises) {
      for (const entry of stateFor(ex).sets) {
        if (entry.completed) {
          doneSetsAll++;
          const w = entry.isBodyweight || entry.isBand ? 0 : parseFloat(entry.weight) || 0;
          const r = parseInt(entry.reps, 10) || 0;
          totalVolumeAll += w * r;
        }
      }
    }

    return (
      <div className="px-6 pt-16 pb-16 max-w-lg mx-auto flex flex-col items-center text-center">
        <div
          className="w-14 h-14 rounded-2xl flex items-center justify-center mb-5"
          style={{ background: "var(--blue)" }}
        >
          <Check className="w-6 h-6 text-dusk-button-text" strokeWidth={3} />
        </div>
        <p className="text-xs font-semibold uppercase tracking-wider mb-1.5" style={{ color: "var(--blue)" }}>
          Session complete
        </p>
        <h2 className="font-display text-2xl mb-1.5" style={{ color: "var(--ink)" }}>
          {workoutName}
        </h2>
        <p className="text-sm mb-8" style={{ color: "var(--ink-mute)" }}>
          {clientName} · {formatRest(sessionElapsedSec)} elapsed
        </p>

        <div className="flex mb-9 rounded-[18px] overflow-hidden" style={{ border: "1px solid var(--line)" }}>
          {[
            { label: "Sets", value: String(doneSetsAll) },
            { label: "Lbs lifted", value: totalVolumeAll.toLocaleString() },
            { label: "Duration", value: formatRest(sessionElapsedSec) },
          ].map((stat, i) => (
            <div
              key={stat.label}
              className="px-5 py-3.5 text-center"
              style={i < 2 ? { borderRight: "1px solid var(--line)" } : undefined}
            >
              <p className="font-display text-xl tabular-nums" style={{ color: "var(--ink)" }}>
                {stat.value}
              </p>
              <p className="text-[10px] uppercase tracking-wide mt-0.5" style={{ color: "var(--ink-mute)" }}>
                {stat.label}
              </p>
            </div>
          ))}
        </div>

        <Button variant="outline" onClick={() => router.push(`/clients/${clientId}`)}>
          Back to {clientName}
        </Button>
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // MOBILE LAYOUT  (hidden on md+) — full scrollable workout view
  // ═══════════════════════════════════════════════════════════════════════════

  const mobileView = (
    <div className="md:hidden -mt-3 pb-28">
      {/* ── Top bar ───────────────────────────────────────────────── */}
      <div className="sticky top-0 z-10 -mx-4 px-4 py-2 mb-2 bg-background/95 backdrop-blur border-b">
        <div className="flex items-center justify-between">
        <Link
          href={`/clients/${clientId}`}
          className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "-ml-2")}
        >
          <ArrowLeft className="w-4 h-4 mr-1" />
          <span className="max-w-[100px] truncate">{clientName}</span>
        </Link>
        <div className="flex items-center gap-2">
          {isResuming && !completed && <Badge variant="warn">Resuming</Badge>}
          <div
            className="text-xs font-semibold tabular-nums px-2.5 py-1 rounded-full"
            style={{ border: "1px solid var(--line)", color: "var(--ink)" }}
          >
            {formatRest(sessionElapsedSec)}
          </div>
          <Button
            size="sm"
            disabled={completing || !anyCompleted}
            onClick={handleCompleteSession}
            variant="outline"
          >
            {completing ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Check className="w-3.5 h-3.5 mr-1" />
            )}
            Done
          </Button>
        </div>
        </div>
        {/* Jump bar: every exercise, one tap away */}
        {exercises.length > 1 && (
          <nav aria-label="Exercises in this workout" className="-mx-4 mt-2 flex items-center gap-1.5 px-4">
            <button
              type="button"
              onClick={() => foldAll(anyOpen)}
              className="logger-quiet flex h-8 shrink-0 items-center gap-1 rounded-full border border-line-strong px-2.5 text-[12px] font-semibold text-ink-soft hover:text-ink"
            >
              {anyOpen ? <ChevronsDownUp className="h-3.5 w-3.5" /> : <ChevronsUpDown className="h-3.5 w-3.5" />}
              {anyOpen ? "Collapse all" : "Expand all"}
            </button>
            <ol className="no-scrollbar flex min-w-0 flex-1 gap-1.5 overflow-x-auto">
              {exercises.map((ex, i) => {
                const done = isDone(ex);
                const next = ex.aweId === upNext;
                return (
                  <li key={ex.aweId} className="shrink-0">
                    <button
                      type="button"
                      onClick={() => jumpTo(ex)}
                      aria-current={next ? "step" : undefined}
                      className={cn(
                        "flex items-center gap-1.5 rounded-full border py-1 pl-1 pr-3 text-left text-[13px] font-semibold",
                        next ? "border-ink/60 bg-dusk-raised text-ink" : "border-line bg-paper text-ink-soft"
                      )}
                    >
                      <span className={cn("flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] tabular-nums", done ? "bg-[var(--success)]/20 text-[var(--success)]" : "bg-ink/10")}>
                        {done ? <Check className="h-3 w-3" strokeWidth={3} /> : exerciseLabel(exercises, i)}
                      </span>
                      <ExerciseName name={ex.name} inControl className="max-w-[140px] leading-tight" />
                    </button>
                  </li>
                );
              })}
            </ol>
          </nav>
        )}
      </div>

      {/* ── Session date, then week and day, on one row ───────────── */}
      {completed && (
        <div className="mb-2 flex justify-center">
          <CompletedPill />
        </div>
      )}
      {renderDayPicker(
        <button
          type="button"
          onClick={() => dateInputRef.current?.showPicker()}
          aria-label={`Session date: ${dateLabel}`}
          className="inline-flex h-11 shrink-0 items-center gap-1.5 rounded-xl border-2 border-border px-3 text-sm font-medium text-ink-soft touch-manipulation"
        >
          <Calendar className="h-3.5 w-3.5 shrink-0" />
          <span>{dateLabel.replace(/^\w+, /, "")}</span>
        </button>
      )}

      {/* ── Exercise list, grouped by block ─────────────────────────── */}
      <div className="space-y-2">
        {groupIntoBlocks(exercises).map((block, bi) => {
          // Warm-up, Block n and Cool-down always show (an empty part says "None"). Headings only:
          // folding is done card by card.
          const blockLabel = block.title;
          const totalSets = block.exIndices.reduce(
            (sum, exI) => sum + stateFor(exercises[exI]).sets.length,
            0
          );
          const doneSets = block.exIndices.reduce(
            (sum, exI) => sum + stateFor(exercises[exI]).sets.filter((s) => s.completed).length,
            0
          );
          const blockDone = totalSets > 0 && doneSets === totalSets;
          return (
            <div key={bi} className="space-y-2">
              <div className="flex items-center gap-2 pt-1">
                <h3 className="min-w-0 truncate text-xs font-semibold uppercase tracking-widest text-muted-foreground">{blockLabel}</h3>
                <div className="h-px min-w-[10px] flex-1 bg-border" />
                {blockDone ? (
                  <Check className="h-3.5 w-3.5 shrink-0 text-[var(--success)]" aria-label="Every set logged" />
                ) : totalSets > 0 ? (
                  <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
                    {doneSets}/{totalSets}
                  </span>
                ) : null}
              </div>
              {block.exIndices.length === 0 && <p className="px-1 pb-1 text-xs text-muted-foreground">None</p>}
              {block.exIndices.map((exI, k) => {
                const ex = exercises[exI];
                const state = stateFor(ex);
                const secs = ex.prescribedSets[0]?.unit === "secs";
                if (isFolded(ex)) {
                  return (
                    <section key={ex.aweId} data-exercise={ex.aweId} ref={(el) => void (cardRefs.current[ex.aweId] = el)} className="scroll-mt-28 rounded-2xl border border-line bg-paper">
                      <FoldedRow label={block.labels[k]} name={ex.name} sets={state.sets} onOpen={() => setFolded(ex.aweId, false)} />
                    </section>
                  );
                }
                return (
                  <section key={ex.aweId} data-exercise={ex.aweId} ref={(el) => void (cardRefs.current[ex.aweId] = el)} className="scroll-mt-28 rounded-2xl border border-line bg-paper px-3 pb-1 pt-2">
                    <CompactHeader
                      ex={ex}
                      index={block.labels[k]}
                      isEditing={editingAweId === ex.aweId}
                      busy={busy}
                      onToggleEdit={() => setEditingAweId((cur) => (cur === ex.aweId ? null : ex.aweId))}
                      onFold={() => setFolded(ex.aweId, true)}
                    />
                    {editingAweId === ex.aweId && (
                      <ChangePanel
                        ex={ex}
                        setCount={state.sets.length}
                        busy={busy}
                        onSwap={(newEx) => handleSwapExercise(ex.aweId, newEx)}
                        onTargets={(t) => handleSetTargets(ex, t)}
                        onRemove={() => handleRemoveExercise(ex)}
                        media={uploadsEnabled ? <ExerciseMediaUpload workspaceId={workspaceId} exerciseId={ex.exerciseId} picture={ex.picture} /> : null}
                      />
                    )}

                    <SetTable
                      secs={secs}
                      sets={state.sets}
                      last={ex.lastSets}
                      prescribed={ex.prescribedSets}
                      onChange={(idx, patch) => updateSet(ex.aweId, idx, patch)}
                      onComplete={(idx) => handleComplete(ex.aweId, ex.exerciseId, idx)}
                      onBlurPersist={(idx) => handleUpdateCompletedSet(ex.aweId, ex.exerciseId, idx)}
                      onRemove={(idx) => removeSet(ex.aweId, idx)}
                    />

                    <div className="flex items-center justify-between gap-2">
                      <button
                        type="button"
                        onClick={() => addSet(ex.aweId)}
                        className="logger-quiet inline-flex items-center gap-1 px-1 py-1 text-[13px] font-medium text-ink-soft hover:text-ink"
                      >
                        <Plus className="h-3.5 w-3.5" /> Add set
                      </button>
                      {state.noteAdded ? (
                        <span className="px-1 text-[13px] text-[var(--success)]">Note saved ✓</span>
                      ) : (
                        <button
                          type="button"
                          aria-expanded={state.noteOpen}
                          onClick={() => setExState((prev) => ({ ...prev, [ex.aweId]: { ...prev[ex.aweId], noteOpen: !prev[ex.aweId].noteOpen } }))}
                          className="logger-quiet inline-flex items-center gap-1 px-1 py-1 text-[13px] font-medium text-ink-soft hover:text-ink"
                        >
                          <PencilLine className="h-3.5 w-3.5" /> Note
                        </button>
                      )}
                    </div>
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

      {/* ── Finish session ───────────────────────────────────────── */}
      <Button
        className="w-full h-12 text-base mt-4"
        disabled={completing || !anyCompleted}
        onClick={handleCompleteSession}
      >
        {completing ? (
          <>
            <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
            Saving…
          </>
        ) : (
          "Finish session"
        )}
      </Button>

      {/* ── Floating rest timer ──────────────────────────────────── */}
      {lastSetAt && (
        <div className="fixed bottom-[calc(env(safe-area-inset-bottom,0px)+80px)] left-1/2 -translate-x-1/2 z-20 flex items-center gap-3 rounded-full border bg-background/95 backdrop-blur px-4 py-2 shadow-lg">
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
    <div className="hidden md:block p-6 max-w-2xl pb-16">
      {/* Header */}
      <Link
        href={`/clients/${clientId}`}
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
            {isResuming && !completed && <Badge variant="warn">Resuming</Badge>}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <div
            className="text-xs font-semibold tabular-nums px-2.5 py-1 rounded-full"
            style={{ border: "1px solid var(--line)", color: "var(--ink)" }}
          >
            {formatRest(sessionElapsedSec)}
          </div>
          <Button size="sm" disabled={completing || !anyCompleted} onClick={handleCompleteSession}>
            {completing ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Check className="w-3.5 h-3.5 mr-1.5" />}
            Done
          </Button>
        </div>
      </div>

      {/* Day picker (desktop) */}
      {dayPicker}

      {exercises.length > 1 && (
        <div className="mb-2 flex justify-end">
          <button
            type="button"
            onClick={() => foldAll(anyOpen)}
            className="flex h-8 items-center gap-1 rounded-full border border-line-strong px-3 text-xs font-semibold text-ink-soft hover:text-ink"
          >
            {anyOpen ? <ChevronsDownUp className="h-3.5 w-3.5" /> : <ChevronsUpDown className="h-3.5 w-3.5" />}
            {anyOpen ? "Collapse all" : "Expand all"}
          </button>
        </div>
      )}

      {/* Exercise cards — grouped by block */}
      <div className="space-y-4">
        {groupIntoBlocks(exercises).map((block) =>
          block.exIndices.length === 0 ? (
            <div key={block.section} className="flex items-center gap-3 pt-1 pb-0">
              <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">{block.title}</span>
              <div className="flex-1 h-px bg-border" />
              <span className="text-xs text-muted-foreground">None</span>
            </div>
          ) : (
            block.exIndices.map((exI, k) => {
          const ex = exercises[exI];
          const state = stateFor(ex);
          // A header at the start of each part (Warm-up, Block n, Cool-down).
          const showBlockHeader = k === 0;
          const blockHeaderLabel = block.title;

          return (
            <div key={ex.aweId}>
              {showBlockHeader && (
                <div className="flex items-center gap-3 pt-1 pb-0">
                  <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                    {blockHeaderLabel}
                  </span>
                  <div className="flex-1 h-px bg-border" />
                </div>
              )}
            {isFolded(ex) ? (
              <div className="mt-2 rounded-xl border border-line bg-paper">
                <FoldedRow label={block.labels[k]} name={ex.name} sets={state.sets} onOpen={() => setFolded(ex.aweId, false)} />
              </div>
            ) : (
            <Card>
              <CardHeader className="pb-2 pt-4 px-4">
                <div className="min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <div
                        className="w-5 h-5 rounded-md flex items-center justify-center text-[11px] font-bold text-ink shrink-0"
                        style={{ background: "var(--blue)" }}
                      >
                        {block.labels[k]}
                      </div>
                      <ExerciseThumb picture={ex.picture} name={ex.name} className="h-9 w-9" />
                      <CardTitle className="text-sm font-semibold leading-tight min-w-0"><ExerciseName name={ex.name} /></CardTitle>
                    </div>
                    <div className="-mr-1.5 flex shrink-0 items-center gap-1">
                      <ChangeButton open={editingAweId === ex.aweId} busy={busy} onClick={() => setEditingAweId((cur) => (cur === ex.aweId ? null : ex.aweId))} />
                      <CollapseButton name={ex.name} onClick={() => setFolded(ex.aweId, true)} />
                    </div>
                  </div>
                  {editingAweId === ex.aweId && (
                    <ChangePanel
                      ex={ex}
                      setCount={state.sets.length}
                      busy={busy}
                      onSwap={(newEx) => handleSwapExercise(ex.aweId, newEx)}
                      onTargets={(t) => handleSetTargets(ex, t)}
                      onRemove={() => handleRemoveExercise(ex)}
                      media={uploadsEnabled ? <ExerciseMediaUpload workspaceId={workspaceId} exerciseId={ex.exerciseId} picture={ex.picture} /> : null}
                    />
                  )}
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
                      onComplete={() => handleComplete(ex.aweId, ex.exerciseId, idx)}
                      onRemove={state.sets.length > 1 && !entry.completed ? () => removeSet(ex.aweId, idx) : undefined}
                    />
                  );
                })}

                <button
                  type="button"
                  onClick={() => addSet(ex.aweId)}
                  className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 mt-1 px-1"
                >
                  <Plus className="w-3 h-3" />
                  Add set
                </button>

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

      <div className="mt-6 flex justify-end gap-3">
        <Button variant="outline" onClick={() => router.push(`/clients/${clientId}`)}>Cancel</Button>
        <Button
          disabled={completing || !anyCompleted}
          onClick={handleCompleteSession}
          className="min-w-[160px]"
        >
          {completing ? <><Loader2 className="w-4 h-4 mr-1.5 animate-spin" />Saving…</> : "Save & Complete Session"}
        </Button>
      </div>
    </div>
  );

  return (
    <>
      {mobileView}
      {desktopView}
    </>
  );
}

// ── Exercise header (phone): number, picture, name, today's target ─────────────

function CompactHeader({
  ex,
  index,
  isEditing,
  busy,
  onToggleEdit,
  onFold,
}: {
  ex: LoggerExercise;
  index: number | string;
  isEditing: boolean;
  busy: boolean;
  onToggleEdit: () => void;
  /** Fold the card to one row. */
  onFold: () => void;
}) {
  const notes = Array.from(
    new Set([ex.lastNote?.trim(), ...ex.prevWorkoutSets.map((x) => x.note?.trim())].filter((x): x is string => !!x))
  );
  return (
    <div className="mb-1 min-w-0">
      <div className="-mr-1.5 flex items-center gap-2">
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-ink/10 text-[12px] font-semibold tabular-nums text-ink">{index}</span>
        <ExerciseThumb picture={ex.picture} name={ex.name} className="h-8 w-8" />
        <div className="min-w-0 flex-1">
          <ExerciseName as="h3" name={ex.name} className="text-[15px] font-semibold leading-tight text-ink" />
          <p className="text-[12px] leading-tight text-ink-mute">{rxLabel(ex)}</p>
        </div>
        <ChangeButton open={isEditing} busy={busy} onClick={onToggleEdit} compact />
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
function FoldedRow({ label, name, sets, onOpen }: { label: string; name: string; sets: SetEntry[]; onOpen: () => void }) {
  const logged = sets.filter((x) => x.completed).length;
  const done = sets.length > 0 && logged === sets.length;
  return (
    <button type="button" onClick={onOpen} aria-expanded={false} aria-label={`Expand ${name}`} className="logger-quiet flex w-full items-center gap-2 py-1.5 pl-3 pr-1.5 text-left">
      <span className="flex h-6 min-w-6 shrink-0 items-center justify-center rounded-md bg-ink/10 px-1 text-[12px] font-semibold tabular-nums text-ink">{label}</span>
      <ExerciseName name={name} inControl className="min-w-0 flex-1 text-[15px] font-semibold leading-snug text-ink" />
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
      <span className="flex h-8 w-8 shrink-0 items-center justify-center text-ink-mute">
        <ChevronDown className="h-4 w-4" />
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
}: {
  value: string;
  onChange: (v: string) => void;
  onBlur?: () => void;
  label: string;
  decimal: boolean;
  placeholder?: string;
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
      className="logger-cell h-10 w-full min-w-0 rounded-lg border border-line-strong bg-dusk-raised px-1 text-center text-[16px] font-semibold tabular-nums text-ink outline-none placeholder:font-normal placeholder:text-ink-mute focus:border-ink/70"
    />
  );
}

const SET_GRID = "grid grid-cols-[1.25rem_2.75rem_minmax(0,1fr)_minmax(0,1fr)_2.5rem_1.75rem] items-center gap-1";

function SetTable({
  secs,
  sets,
  last,
  prescribed,
  onChange,
  onComplete,
  onBlurPersist,
  onRemove,
}: {
  secs: boolean;
  sets: SetEntry[];
  last: LoggerExercise["lastSets"];
  prescribed: PrescribedSet[];
  onChange: (idx: number, patch: Partial<SetEntry>) => void;
  onComplete: (idx: number) => void;
  onBlurPersist: (idx: number) => void;
  onRemove: (idx: number) => void;
}) {
  const [detail, setDetail] = useState<number | null>(null);
  const removable = (i: number) => sets.length > 1 && !sets[i].completed;
  return (
    <div className="text-ink">
      <div aria-hidden className={cn(SET_GRID, "px-0.5 pb-0.5 text-[11px] font-semibold uppercase leading-4 tracking-wide text-ink-mute")}>
        <span className="text-center">Set</span>
        <span>Last</span>
        <span className="text-center">lb</span>
        <span className="text-center">{secs ? "Sec" : "Reps"}</span>
        <span />
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
                {prev.reps != null && <span className="whitespace-nowrap">×{prev.reps}</span>}
              </>
            ) : (
              "—"
            );
          const band = BAND_COLORS.find((b) => b.id === entry.bandColor);
          const extra = Boolean(entry.note.trim() || entry.rpe);
          const persist = () => entry.completed && onBlurPersist(idx);
          const open = detail === idx;
          return (
            <div key={idx} role="group" aria-label={`Set ${idx + 1}`}>
              <div className={cn(SET_GRID, "rounded-lg px-0.5", entry.completed && "bg-[var(--success)]/[0.07]")}>
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
                    <NumField
                      value={entry.weight}
                      onChange={(v) => onChange(idx, { weight: v })}
                      onBlur={persist}
                      label={`Set ${idx + 1} weight in pounds`}
                      decimal
                      placeholder={prescribed[idx]?.weight != null ? String(prescribed[idx].weight) : "lb"}
                    />
                  )}
                </span>
                <span className="min-w-0">
                  <NumField
                    value={entry.reps}
                    onChange={(v) => onChange(idx, { reps: v })}
                    onBlur={persist}
                    label={`Set ${idx + 1} ${entry.isSeconds ? "seconds" : "reps"}`}
                    decimal={false}
                    placeholder={entry.isSeconds ? "sec" : "reps"}
                  />
                </span>
                <button
                  type="button"
                 
                  onClick={() => onComplete(idx)}
                  disabled={entry.saving}
                  aria-pressed={entry.completed}
                  aria-label={entry.completed ? `Set ${idx + 1} logged — tap to undo` : `Log set ${idx + 1}`}
                  className={cn(
                    "logger-cell flex h-10 w-10 items-center justify-center rounded-lg border transition-colors",
                    entry.completed ? "border-[var(--success)] bg-[var(--success)] text-dusk-button-text" : "border-line-strong text-ink-mute"
                  )}
                >
                  {entry.saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" strokeWidth={2.5} />}
                </button>
                {removable(idx) ? (
                  <button
                    type="button"
                   
                    onClick={() => {
                      if (detail === idx) setDetail(null);
                      onRemove(idx);
                    }}
                    aria-label={`Delete set ${idx + 1}`}
                    className="logger-cell flex h-10 w-7 items-center justify-center text-ink-mute hover:text-[var(--destructive)]"
                  >
                    <X className="h-4 w-4" />
                  </button>
                ) : (
                  <span />
                )}
              </div>
              {open && (
                <SetDetails
                  idx={idx}
                  entry={entry}
                  onChange={(patch) => onChange(idx, patch)}
                  onBlur={persist}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** The rarer parts of a set, opened from its number: load type, seconds, RPE, a note. */
function SetDetails({
  idx,
  entry,
  onChange,
  onBlur,
}: {
  idx: number;
  entry: SetEntry;
  onChange: (patch: Partial<SetEntry>) => void;
  onBlur: () => void;
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
          <button type="button" className={seg(entry.isSeconds)} aria-pressed={entry.isSeconds} onClick={() => onChange({ isSeconds: true })}>Sec</button>
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
      <div className="flex items-center gap-1.5">
        <label className="flex shrink-0 items-center gap-1.5 text-[12px] font-semibold uppercase tracking-wide text-ink-mute">
          RPE
          <span className="w-14">
            <NumField value={entry.rpe} onChange={(v) => onChange({ rpe: v })} onBlur={onBlur} label={`Set ${idx + 1} RPE`} decimal placeholder="–" />
          </span>
        </label>
        <Input
          value={entry.note}
          onChange={(e) => onChange({ note: e.target.value })}
          onBlur={onBlur}
          placeholder="Set note…"
          aria-label={`Set ${idx + 1} note`}
          className="logger-cell h-10 px-2"
          style={{ fontSize: "16px" }}
        />
      </div>
    </div>
  );
}

// ── Changing one exercise on the spot ──────────────────────────────────────────

function ChangeButton({ open, busy, onClick, compact = false }: { open: boolean; busy: boolean; onClick: () => void; compact?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      aria-expanded={open}
      aria-label={compact ? (open ? "Close changes" : "Change this exercise") : undefined}
      className={cn(
        "inline-flex h-8 shrink-0 items-center gap-1 rounded-lg border text-xs font-medium transition-colors disabled:opacity-50 touch-manipulation",
        compact ? "logger-quiet w-8 justify-center" : "px-2.5",
        open ? "border-ink bg-dusk-selected text-dusk-selected-text" : "border-border text-muted-foreground hover:text-foreground"
      )}
    >
      {open ? <X className="h-3.5 w-3.5" /> : <SlidersHorizontal className="h-3.5 w-3.5" />}
      {!compact && (open ? "Close" : "Change")}
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
  onSwap: (ex: ExerciseOption) => void;
  onTargets: (t: { sets: number; repMin: number; repMax: number }) => void;
  onRemove: () => void;
}) {
  const ps0 = ex.prescribedSets[0];
  const secs = ps0?.unit === "secs";
  const [sets, setSets] = useState(String(setCount || ex.prescribedSets.length || 3));
  const [lo, setLo] = useState(String(ps0?.repMin ?? 8));
  const [hi, setHi] = useState(String(ps0?.repMax ?? ps0?.repMin ?? 10));
  const [confirmRemove, setConfirmRemove] = useState(false);

  const n = (v: string) => parseInt(v, 10);
  const valid = n(sets) >= 1 && n(sets) <= 12 && n(lo) >= 1 && n(hi) >= 1;
  const box = "h-10 w-14 rounded-lg border border-border bg-background text-center text-base tabular-nums focus:outline-none focus:border-primary";

  return (
    <div className="mt-2 space-y-4 rounded-xl bg-muted/40 p-3">
      <div>
        <p className="mb-1.5 text-xs font-semibold text-muted-foreground">Swap for another exercise</p>
        <ExercisePicker onSelect={onSwap} placeholder="Search exercises…" />
      </div>

      <div>
        <p className="mb-1.5 text-xs font-semibold text-muted-foreground">Today&rsquo;s sets &amp; {secs ? "seconds" : "reps"}</p>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <input aria-label="Sets" inputMode="numeric" value={sets} onChange={(e) => setSets(e.target.value.replace(/\D/g, ""))} className={box} />
          <span className="text-muted-foreground">×</span>
          <input aria-label={secs ? "Seconds from" : "Reps from"} inputMode="numeric" value={lo} onChange={(e) => setLo(e.target.value.replace(/\D/g, ""))} className={box} />
          <span className="text-muted-foreground">–</span>
          <input aria-label={secs ? "Seconds to" : "Reps to"} inputMode="numeric" value={hi} onChange={(e) => setHi(e.target.value.replace(/\D/g, ""))} className={box} />
          {secs && <span className="text-muted-foreground">sec</span>}
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
  onChange,
  onComplete,
  onRemove,
}: {
  onRemove?: () => void;
  idx: number;
  entry: SetEntry;
  onChange: (patch: Partial<SetEntry>) => void;
  onComplete: () => void;
}) {

  return (
    <div className="space-y-0.5">
      <div className={cn("flex items-center gap-1.5 transition-opacity", entry.completed && "opacity-60")}>
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
          title={entry.isSeconds ? "Switch to reps" : "Switch to seconds"}
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
        <Input
          value={entry.reps}
          onChange={(e) => onChange({ reps: e.target.value })}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); onComplete(); } }}
          placeholder={entry.isSeconds ? "sec" : "reps"}
          className="h-7 w-14 text-xs text-center px-1"
          type="number"
        />

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
          disabled={entry.saving}
          className={cn(
            "ml-1 w-7 h-7 rounded flex items-center justify-center shrink-0 transition-colors border",
            entry.completed
              ? "bg-[var(--success)] border-[var(--success)] text-dusk-button-text"
              : "border-border text-muted-foreground hover:border-[color-mix(in_srgb,var(--dusk-teal)_30%,transparent)] hover:text-[var(--success)]"
          )}
        >
          {entry.saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
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
        <Input
          value={entry.note}
          onChange={(e) => onChange({ note: e.target.value })}
          placeholder="Set note…"
          className="h-6 text-xs px-2 text-muted-foreground border-transparent hover:border-border focus:border-border bg-transparent"
        />
      </div>
    </div>
  );
}
