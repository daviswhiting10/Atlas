"use client";

/// <reference types="@types/dom-speech-recognition" />

import { useEffect, useRef, useState, useTransition } from "react";
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
  ArrowLeftRight,
  Calendar,
  Check,
  ChevronDown,
  ChevronUp,
  Loader2,
  Mic,
  MicOff,
  Plus,
  SkipForward,
  Timer,
  TrendingUp,
  AlertTriangle,
  RotateCcw,
  X,
} from "lucide-react";
import {
  logSet,
  completeSession,
  addExerciseNote,
  updateSessionDate,
  swapExercise,
} from "@/lib/actions/workout-logger";
import { ExercisePicker, type ExerciseOption } from "@/app/(dashboard)/programs/_components/ExercisePicker";
import type { LoggerExercise, PrescribedSet, ExistingSetLog, PrevSet } from "./page";

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
};

// ── Helpers ────────────────────────────────────────────────────────────────────

function formatLastSets(lastSets: LoggerExercise["lastSets"]): string {
  if (lastSets.length === 0) return "";
  const parts = lastSets.map((s) => {
    const w = s.weight != null ? `${s.weight} lb` : "BW";
    const r = s.reps != null ? `× ${s.reps}` : "";
    return `${w} ${r}`.trim();
  });
  const rpeParts = lastSets.map((s) => s.rpe).filter((r): r is number => r != null);
  const rpeStr =
    rpeParts.length > 0 ? ` @ RPE ${Math.max(...rpeParts).toFixed(1)}` : "";
  return `${parts.join(", ")}${rpeStr}`;
}

function formatPrevSets(sets: PrevSet[]): string {
  if (sets.length === 0) return "";
  const parts = sets.map((s) => {
    const w = s.bandColor
      ? `${s.bandColor.charAt(0).toUpperCase() + s.bandColor.slice(1)} band`
      : s.weight != null
      ? `${s.weight} lb`
      : "BW";
    const r = s.reps != null ? `× ${s.reps}` : "";
    return `${w} ${r}`.trim();
  });
  const rpeParts = sets.map((s) => s.rpe).filter((r): r is number => r != null);
  const rpeStr = rpeParts.length > 0 ? ` @ RPE ${Math.max(...rpeParts).toFixed(1)}` : "";
  return `${parts.join(", ")}${rpeStr}`;
}

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

// ── Block helpers ───────────────────────────────────────────────────────────────

/** A contiguous group of exercises sharing the same section label. */
type ExBlock = { section: string | null; exIndices: number[] };

/** Group exercises into blocks by section, preserving order. */
function groupIntoBlocks(exercises: LoggerExercise[]): ExBlock[] {
  const blocks: ExBlock[] = [];
  for (let i = 0; i < exercises.length; i++) {
    const sec = exercises[i].section;
    const last = blocks[blocks.length - 1];
    if (last && last.section === sec) {
      last.exIndices.push(i);
    } else {
      blocks.push({ section: sec, exIndices: [i] });
    }
  }
  return blocks;
}

/** Human-readable block label. */
function formatBlockLabel(section: string | null): string {
  if (!section) return "";
  if (section === "warmup") return "Warm-up";
  if (section === "finisher") return "Finisher";
  // "block_a" → "Block A"
  return section.replace(/^block_/, "Block ").replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
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

export default function WorkoutLogger({
  clientId,
  clientName,
  assignedWorkoutId,
  workoutName,
  scheduledDate,
  assignmentName,
  assignmentStartDate,
  exercises,
  existingWorkoutLogId,
  existingSetLogs,
  availableWorkouts,
}: {
  clientId: string;
  clientName: string;
  assignedWorkoutId: string;
  workoutName: string;
  scheduledDate: string;
  assignmentName: string;
  assignmentStartDate: string;
  exercises: LoggerExercise[];
  existingWorkoutLogId: string | null;
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
  const [sessionStart] = useState(() => Date.now());
  const [sessionNow, setSessionNow] = useState(() => Date.now());
  useEffect(() => {
    if (finished) return;
    const id = setInterval(() => setSessionNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [finished]);
  const sessionElapsedSec = Math.floor((sessionNow - sessionStart) / 1000);

  // ── Swap exercise (mid-workout substitution) ────────────────────────────────
  const [swappingAweId, setSwappingAweId] = useState<string | null>(null);
  const [swapping, setSwapping] = useState(false);

  // ── Collapsible blocks (mobile) — start with the first unfinished block open ──
  const [expandedBlocks, setExpandedBlocks] = useState<Set<number>>(() => {
    const initial = buildInitialState(exercises, existingSetLogs);
    const blocks = groupIntoBlocks(exercises);
    const idx = blocks.findIndex((b) =>
      b.exIndices.some((exI) => initial[exercises[exI].aweId].sets.some((s) => !s.completed))
    );
    return new Set([idx === -1 ? 0 : idx]);
  });

  function toggleBlock(bi: number) {
    setExpandedBlocks((prev) => {
      const next = new Set(prev);
      if (next.has(bi)) next.delete(bi);
      else next.add(bi);
      return next;
    });
  }

  // ── Mobile-specific state ────────────────────────────────────────────────────
  const [lastSetAt, setLastSetAt] = useState<number | null>(null);
  const [restSecs, setRestSecs] = useState(0);
  const dateInputRef = useRef<HTMLInputElement>(null);

  // ── Session date (trainer can correct it) ─────────────────────────────────
  // Initialise to the workout's scheduledDate as a YYYY-MM-DD string
  const [logDate, setLogDate] = useState<string>(
    () => new Date(scheduledDate).toISOString().slice(0, 10)
  );

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

  function adjustWeight(aweId: string, idx: number, delta: number) {
    const entry = exState[aweId].sets[idx];
    if (entry.isBodyweight) return;
    const current = parseFloat(entry.weight) || 0;
    const next = Math.max(0, current + delta);
    updateSet(aweId, idx, { weight: next % 1 === 0 ? String(next) : next.toFixed(1) });
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

  // ── Swap exercise (mid-workout substitution) ──────────────────────────────
  async function handleSwapExercise(aweId: string, newEx: ExerciseOption) {
    setSwapping(true);
    try {
      await swapExercise({ assignedWorkoutExerciseId: aweId, exerciseId: newEx.id });
      toast.success(`Switched to ${newEx.name}`);
      setSwappingAweId(null);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't switch exercise");
    } finally {
      setSwapping(false);
    }
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
  const dayPicker = availableWorkouts.length > 1 ? (
    <div className="flex gap-2 mb-3">
      {/* Week selector — hidden when there's only one week */}
      {allWeeks.length > 1 && (
        <div className="relative flex-1">
          <select
            value={pickerWeek}
            onChange={(e) => handlePickerWeekChange(Number(e.target.value))}
            className="w-full h-11 rounded-xl border-2 border-border bg-background px-3 pr-9 text-sm font-medium appearance-none focus:outline-none focus:border-primary touch-manipulation"
            style={{ fontSize: "16px" }}
          >
            {allWeeks.map((wk) => (
              <option key={wk} value={wk}>
                Week {wk}
              </option>
            ))}
          </select>
          <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
        </div>
      )}
      {/* Day selector */}
      <div className="relative flex-1">
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
    let doneSetsAll = 0;
    let totalVolumeAll = 0;
    for (const ex of exercises) {
      for (const entry of exState[ex.aweId].sets) {
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
          <Check className="w-6 h-6 text-white" strokeWidth={3} />
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
    <div className="md:hidden px-4 pt-2 pb-28">
      {/* ── Top bar ───────────────────────────────────────────────── */}
      <div className="sticky top-0 z-10 -mx-4 px-4 py-2 mb-2 bg-background/95 backdrop-blur border-b flex items-center justify-between">
        <Link
          href={`/clients/${clientId}`}
          className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "-ml-2")}
        >
          <ArrowLeft className="w-4 h-4 mr-1" />
          <span className="max-w-[100px] truncate">{clientName}</span>
        </Link>
        <div className="flex items-center gap-2">
          {isResuming && <Badge variant="warn">Resuming</Badge>}
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

      {/* ── Session date chip ─────────────────────────────────────── */}
      <div className="flex items-center justify-center mb-2">
        <button
          type="button"
          onClick={() => dateInputRef.current?.showPicker()}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-medium text-muted-foreground bg-muted/40 hover:bg-muted/70 transition-colors touch-manipulation"
        >
          <Calendar className="w-3 h-3 shrink-0" />
          <span>{dateLabel}</span>
        </button>
      </div>

      {/* ── Day picker ────────────────────────────────────────────── */}
      {dayPicker}

      {/* ── Exercise list, grouped by block ─────────────────────────── */}
      <div className="space-y-3">
        {groupIntoBlocks(exercises).map((block, bi) => {
          const blockLabel = formatBlockLabel(block.section);
          const isCollapsible = !!blockLabel;
          const isExpanded = !isCollapsible || expandedBlocks.has(bi);
          const totalSets = block.exIndices.reduce(
            (sum, exI) => sum + exState[exercises[exI].aweId].sets.length,
            0
          );
          const doneSets = block.exIndices.reduce(
            (sum, exI) => sum + exState[exercises[exI].aweId].sets.filter((s) => s.completed).length,
            0
          );
          const blockDone = totalSets > 0 && doneSets === totalSets;
          return (
            <div key={bi} className="space-y-3">
              {blockLabel && (
                <button
                  type="button"
                  onClick={() => toggleBlock(bi)}
                  className="w-full flex items-center gap-2 pt-1 touch-manipulation"
                >
                  <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground shrink-0">
                    {blockLabel}
                  </span>
                  <div className="flex-1 h-px bg-border" />
                  {blockDone ? (
                    <Check className="w-3.5 h-3.5 text-[var(--success)] shrink-0" />
                  ) : (
                    <span className="text-[11px] text-muted-foreground tabular-nums shrink-0">
                      {doneSets}/{totalSets}
                    </span>
                  )}
                  {isExpanded ? (
                    <ChevronUp className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                  ) : (
                    <ChevronDown className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                  )}
                </button>
              )}
              {!isExpanded && (
                <button
                  type="button"
                  onClick={() => toggleBlock(bi)}
                  className="w-full text-left text-xs text-muted-foreground px-1 pb-1 truncate touch-manipulation"
                >
                  {block.exIndices.map((exI) => exercises[exI].name).join(" · ")}
                </button>
              )}
              {isExpanded && block.exIndices.map((exI) => {
                const ex = exercises[exI];
                const state = exState[ex.aweId];
                return (
                  <Card key={ex.aweId} size="sm">
                    <CardContent className="space-y-3">
                      <ExerciseHeader
                        ex={ex}
                        index={exI + 1}
                        isSwapping={swappingAweId === ex.aweId}
                        swapping={swapping}
                        onToggleSwap={() =>
                          setSwappingAweId((cur) => (cur === ex.aweId ? null : ex.aweId))
                        }
                        onSwap={(newEx) => handleSwapExercise(ex.aweId, newEx)}
                      />

                      <div className="space-y-2">
                        {state.sets.map((entry, idx) => {
                          const repMax =
                            ex.prescribedSets[idx]?.repMax ?? ex.prescribedSets[0]?.repMax ?? null;
                          const prescribedWeight = ex.prescribedSets[idx]?.weight ?? null;
                          return (
                            <MobileSetRow
                              key={idx}
                              idx={idx}
                              entry={entry}
                              repMax={repMax}
                              prescribedWeight={prescribedWeight}
                              onChange={(patch) => updateSet(ex.aweId, idx, patch)}
                              onAdjustWeight={(delta) => adjustWeight(ex.aweId, idx, delta)}
                              onComplete={() => handleComplete(ex.aweId, ex.exerciseId, idx)}
                              onBlurPersist={() => handleUpdateCompletedSet(ex.aweId, ex.exerciseId, idx)}
                            />
                          );
                        })}
                      </div>

                      <button
                        type="button"
                        onClick={() => addSet(ex.aweId)}
                        className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 px-1"
                      >
                        <Plus className="w-3 h-3" />
                        Add set
                      </button>

                      <div className="pt-2 border-t">
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
                              className="h-9"
                              style={{ fontSize: "16px" }}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") saveNote(ex.aweId, ex.exerciseId);
                              }}
                            />
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-9 text-xs px-3 shrink-0"
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
                );
              })}
            </div>
          );
        })}
      </div>

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
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-20 flex items-center gap-3 rounded-full border bg-background/95 backdrop-blur px-4 py-2 shadow-lg">
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
          <h1
            className="font-display leading-[1.04] tracking-[-0.01em] leading-tight"
            style={{ fontSize: "clamp(1.5rem, 3vw, 2rem)", color: "var(--ink)" }}
          >
            {workoutName}
          </h1>
          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
            <span className="font-body text-sm" style={{ color: "var(--ink-mute)" }}>
              {assignmentName}
            </span>
            <span className="text-muted-foreground/50 text-sm">·</span>
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
            {isResuming && <Badge variant="warn">Resuming</Badge>}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <div
            className="text-xs font-semibold tabular-nums px-2.5 py-1 rounded-full"
            style={{ border: "1px solid var(--line)", color: "var(--ink)" }}
          >
            {formatRest(sessionElapsedSec)}
          </div>
          <Button variant="outline" size="sm" onClick={() => router.push(`/clients/${clientId}`)}>
            <SkipForward className="w-3.5 h-3.5 mr-1.5" />
            Skip
          </Button>
          <Button size="sm" disabled={completing || !anyCompleted} onClick={handleCompleteSession}>
            {completing ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Check className="w-3.5 h-3.5 mr-1.5" />}
            Done
          </Button>
        </div>
      </div>

      {/* Day picker (desktop) */}
      {dayPicker}

      {/* Exercise cards — grouped by block */}
      <div className="space-y-4">
        {exercises.map((ex, exI) => {
          const state = exState[ex.aweId];
          const lastStr = formatLastSets(ex.lastSets);
          const s = ex.suggestion;
          const hasLastData = ex.lastSets.length > 0;
          // Show a block header when section changes
          const prevSection = exI > 0 ? exercises[exI - 1].section : "__start__";
          const showBlockHeader = ex.section !== prevSection && ex.section != null;
          const blockHeaderLabel = formatBlockLabel(ex.section);

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
            <Card>
              <CardHeader className="pb-2 pt-4 px-4">
                <div className="min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <div
                        className="w-5 h-5 rounded-md flex items-center justify-center text-[11px] font-bold text-white shrink-0"
                        style={{ background: "var(--blue)" }}
                      >
                        {exI + 1}
                      </div>
                      <CardTitle className="text-sm font-semibold leading-tight truncate min-w-0">{ex.name}</CardTitle>
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        setSwappingAweId((cur) => (cur === ex.aweId ? null : ex.aweId))
                      }
                      disabled={swapping}
                      className="text-muted-foreground hover:text-foreground shrink-0 disabled:opacity-50"
                      title="Did a different exercise?"
                    >
                      {swappingAweId === ex.aweId ? (
                        <X className="w-3.5 h-3.5" />
                      ) : (
                        <ArrowLeftRight className="w-3.5 h-3.5" />
                      )}
                    </button>
                  </div>
                  {swappingAweId === ex.aweId && (
                    <div className="mt-1.5">
                      <ExercisePicker
                        onSelect={(newEx) => handleSwapExercise(ex.aweId, newEx)}
                        placeholder="Switch to exercise..."
                      />
                    </div>
                  )}
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {ex.prescribedSets.length} ×{" "}
                    {ex.prescribedSets[0]
                      ? ex.prescribedSets[0].unit === "secs"
                        ? `${ex.prescribedSets[0].repMax}s`
                        : ex.prescribedSets[0].repMin === ex.prescribedSets[0].repMax
                          ? ex.prescribedSets[0].repMax
                          : `${ex.prescribedSets[0].repMin}–${ex.prescribedSets[0].repMax}`
                      : "?"}
                  </p>
                </div>

                {hasLastData ? (
                  <p className="text-xs text-muted-foreground mt-1">{lastStr}</p>
                ) : (
                  <p className="text-xs text-muted-foreground mt-1 italic">First time — start conservative.</p>
                )}

                {/* Previous week reference */}
                {ex.prevWorkoutSets.length > 0 && (
                  <p className="text-xs mt-1" style={{ color: "var(--blue)" }}>
                    <span className="font-semibold">Prev week:</span>{" "}
                    {formatPrevSets(ex.prevWorkoutSets)}
                  </p>
                )}

                {s.type === "progress" && (
                  <div className="flex items-center gap-1 mt-1">
                    <TrendingUp className="w-3 h-3 text-[var(--success)] shrink-0" />
                    <p className="text-xs text-[var(--success)]">{s.reasoning}</p>
                  </div>
                )}
                {s.type === "hold" && hasLastData && (
                  <p className="text-xs text-[var(--warn)] mt-1">{s.reasoning}</p>
                )}
                {s.type === "deload" && (
                  <div className="flex items-center gap-1 mt-1">
                    <AlertTriangle className="w-3 h-3 text-[var(--destructive)] shrink-0" />
                    <p className="text-xs text-[var(--destructive)]">{s.reasoning}</p>
                  </div>
                )}
                {s.type === "match_last" && (
                  <p className="text-xs text-muted-foreground mt-1 italic">{s.reasoning}</p>
                )}

                {ex.lastNote && (
                  <p className="text-xs text-muted-foreground italic mt-1 border-l-2 border-muted pl-2">
                    📝 {ex.lastNote}
                  </p>
                )}
              </CardHeader>

              <CardContent className="px-4 pb-4 space-y-1.5">
                {state.sets.map((entry, idx) => {
                  const repMax = ex.prescribedSets[idx]?.repMax ?? ex.prescribedSets[0]?.repMax ?? null;
                  return (
                    <DesktopSetRow
                      key={idx}
                      idx={idx}
                      entry={entry}
                      repMax={repMax}
                      onChange={(patch) => updateSet(ex.aweId, idx, patch)}
                      onComplete={() => handleComplete(ex.aweId, ex.exerciseId, idx)}
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
            </div>
          );
        })}
      </div>

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

// ── Exercise header (shared info block for mobile cards) ────────────────────────

function ExerciseHeader({
  ex,
  index,
  isSwapping,
  swapping,
  onToggleSwap,
  onSwap,
}: {
  ex: LoggerExercise;
  index: number;
  isSwapping: boolean;
  swapping: boolean;
  onToggleSwap: () => void;
  onSwap: (ex: ExerciseOption) => void;
}) {
  const lastStr = formatLastSets(ex.lastSets);
  const hasLastData = ex.lastSets.length > 0;
  const s = ex.suggestion;
  const ps0 = ex.prescribedSets[0];
  const repDesc = ps0
    ? ps0.unit === "secs"
      ? `${ps0.repMax}s`
      : ps0.repMin === ps0.repMax
        ? `${ps0.repMax}`
        : `${ps0.repMin}–${ps0.repMax}`
    : "?";

  return (
    <div className="min-w-0">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <div
            className="w-5 h-5 rounded-md flex items-center justify-center text-[11px] font-bold text-white shrink-0"
            style={{ background: "var(--blue)" }}
          >
            {index}
          </div>
          <h3 className="text-sm font-semibold leading-tight truncate min-w-0">{ex.name}</h3>
        </div>
        <button
          type="button"
          onClick={onToggleSwap}
          disabled={swapping}
          className="text-muted-foreground hover:text-foreground shrink-0 disabled:opacity-50 touch-manipulation"
          title="Did a different exercise?"
        >
          {isSwapping ? <X className="w-3.5 h-3.5" /> : <ArrowLeftRight className="w-3.5 h-3.5" />}
        </button>
      </div>
      {isSwapping && (
        <div className="mt-1.5">
          <ExercisePicker onSelect={onSwap} placeholder="Switch to exercise..." />
        </div>
      )}
      <p className="text-xs text-muted-foreground mt-0.5">
        {ex.prescribedSets.length} × {repDesc}
      </p>

      {hasLastData ? (
        lastStr && <p className="text-xs text-muted-foreground mt-1">{lastStr}</p>
      ) : (
        <p className="text-xs text-muted-foreground mt-1 italic">First time — start conservative.</p>
      )}

      {ex.prevWorkoutSets.length > 0 && (
        <p className="text-xs mt-1" style={{ color: "var(--blue)" }}>
          <span className="font-semibold">Prev week:</span> {formatPrevSets(ex.prevWorkoutSets)}
        </p>
      )}

      {s.type === "progress" && (
        <div className="flex items-center gap-1 mt-1">
          <TrendingUp className="w-3 h-3 text-[var(--success)] shrink-0" />
          <p className="text-xs text-[var(--success)]">{s.reasoning}</p>
        </div>
      )}
      {s.type === "hold" && hasLastData && (
        <p className="text-xs text-[var(--warn)] mt-1">{s.reasoning}</p>
      )}
      {s.type === "deload" && (
        <div className="flex items-center gap-1 mt-1">
          <AlertTriangle className="w-3 h-3 text-[var(--destructive)] shrink-0" />
          <p className="text-xs text-[var(--destructive)]">{s.reasoning}</p>
        </div>
      )}
      {s.type === "match_last" && (
        <p className="text-xs text-muted-foreground mt-1 italic">{s.reasoning}</p>
      )}

      {ex.lastNote && (
        <p className="text-xs text-muted-foreground italic mt-1 border-l-2 border-muted pl-2">
          {ex.lastNote}
        </p>
      )}
    </div>
  );
}

// ── Mobile SetRow ─────────────────────────────────────────────────────────────

function MobileSetRow({
  idx,
  entry,
  repMax,
  prescribedWeight,
  onChange,
  onAdjustWeight,
  onComplete,
  onBlurPersist,
}: {
  idx: number;
  entry: SetEntry;
  repMax: number | null;
  prescribedWeight: number | null;
  onChange: (patch: Partial<SetEntry>) => void;
  onAdjustWeight: (delta: number) => void;
  onComplete: () => void;
  onBlurPersist: () => void;
}) {
  const hitsTopOfRange =
    !entry.isSeconds &&
    entry.completed &&
    repMax != null &&
    entry.reps !== "" &&
    parseInt(entry.reps, 10) >= repMax;

  function persistIfCompleted() {
    if (entry.completed) onBlurPersist();
  }

  function cycleLoadMode() {
    if (!entry.isBodyweight && !entry.isBand) {
      onChange({ isBodyweight: true, isBand: false, weight: "" });
    } else if (entry.isBodyweight) {
      onChange({ isBodyweight: false, isBand: true });
    } else {
      onChange({ isBodyweight: false, isBand: false });
    }
  }

  const bandMeta = BAND_COLORS.find((b) => b.id === entry.bandColor);

  return (
    <div className={cn("rounded-xl border p-2 space-y-1.5", entry.completed && "bg-muted/30")}>
      <div className="flex items-center gap-1">
        <span className="text-xs text-muted-foreground w-4 shrink-0 text-center">{idx + 1}</span>

        {/* Load control */}
        {entry.isBand ? (
          <div
            className="w-[104px] h-11 rounded-lg border-2 flex items-center justify-center gap-1.5 shrink-0"
            style={{ borderColor: bandMeta?.hex }}
          >
            <span className="w-3.5 h-3.5 rounded-full shrink-0" style={{ backgroundColor: bandMeta?.hex }} />
            <span className="text-xs font-semibold">{bandMeta?.label}</span>
          </div>
        ) : entry.isBodyweight ? (
          <div className="w-[104px] h-11 rounded-lg border bg-muted flex items-center justify-center text-sm font-semibold text-muted-foreground shrink-0">
            Bodyweight
          </div>
        ) : (
          <div className="flex items-center gap-0.5 w-[104px] shrink-0">
            <button
              type="button"
              onClick={() => onAdjustWeight(-2.5)}
              className="w-7 h-11 rounded-lg border flex items-center justify-center text-base font-light touch-manipulation active:bg-muted shrink-0"
            >
              −
            </button>
            <Input
              value={entry.weight}
              onChange={(e) => onChange({ weight: e.target.value })}
              onBlur={persistIfCompleted}
              className="w-12 h-11 text-center text-sm font-semibold px-1 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
              type="number"
              inputMode="decimal"
              step="2.5"
              style={{ fontSize: "16px" }}
              placeholder="lb"
            />
            <button
              type="button"
              onClick={() => onAdjustWeight(2.5)}
              className="w-7 h-11 rounded-lg border flex items-center justify-center text-base font-light touch-manipulation active:bg-muted shrink-0"
            >
              +
            </button>
          </div>
        )}

        {/* Cycle load mode: weight → BW → band → weight */}
        <button
          type="button"
          onClick={cycleLoadMode}
          title="Switch load type"
          className="w-6 h-11 rounded-lg border flex items-center justify-center text-sm text-muted-foreground shrink-0 touch-manipulation active:bg-muted"
        >
          ⇄
        </button>

        {/* Reps / Secs */}
        <Input
          value={entry.reps}
          onChange={(e) => onChange({ reps: e.target.value })}
          onBlur={persistIfCompleted}
          className="flex-1 min-w-[44px] h-11 text-center text-sm font-semibold px-1 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
          type="number"
          inputMode="numeric"
          style={{ fontSize: "16px" }}
          placeholder={entry.isSeconds ? "sec" : "reps"}
        />
        <button
          type="button"
          onClick={() => onChange({ isSeconds: !entry.isSeconds })}
          className={cn(
            "w-6 h-11 rounded-lg border flex items-center justify-center text-xs font-semibold shrink-0 touch-manipulation",
            entry.isSeconds
              ? "border-[rgba(43,107,255,0.30)] text-[var(--blue-deep)] bg-[rgba(43,107,255,0.07)]"
              : "border-border text-muted-foreground"
          )}
        >
          {entry.isSeconds ? "s" : "×"}
        </button>

        {/* RPE */}
        <Input
          value={entry.rpe}
          onChange={(e) => onChange({ rpe: e.target.value })}
          onBlur={persistIfCompleted}
          className="w-10 h-11 text-center text-sm font-semibold px-1 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none shrink-0"
          type="number"
          step="0.5"
          min="1"
          max="10"
          style={{ fontSize: "16px" }}
          placeholder="–"
        />

        {/* Complete toggle */}
        <button
          type="button"
          onClick={onComplete}
          disabled={entry.saving}
          className={cn(
            "w-10 h-11 rounded-lg border flex items-center justify-center shrink-0 transition-colors touch-manipulation",
            entry.completed
              ? "bg-[var(--success)] border-[var(--success)] text-white"
              : "border-border text-muted-foreground active:bg-muted"
          )}
        >
          {entry.saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
        </button>
      </div>

      {/* Band color swatches */}
      {entry.isBand && (
        <div className="flex gap-1.5 pl-5">
          {BAND_COLORS.map(({ id, label, hex }) => (
            <button
              key={id}
              type="button"
              title={label}
              onClick={() => onChange({ bandColor: id })}
              className={cn(
                "flex-1 h-8 rounded-lg border-2 transition-all touch-manipulation flex items-center justify-center",
                entry.bandColor === id ? "border-foreground scale-105" : "border-transparent opacity-70"
              )}
              style={{ backgroundColor: hex }}
            >
              {entry.bandColor === id && (
                <Check className="w-3.5 h-3.5 text-white drop-shadow" strokeWidth={3} />
              )}
            </button>
          ))}
        </div>
      )}

      {/* Per-set note */}
      <div className="pl-5">
        <Input
          value={entry.note}
          onChange={(e) => onChange({ note: e.target.value })}
          onBlur={persistIfCompleted}
          placeholder="Set note…"
          className="h-8 px-2"
          style={{ fontSize: "16px" }}
        />
      </div>

      {prescribedWeight != null && !entry.isBodyweight && !entry.isBand && (
        <p className="text-xs text-[var(--success)] pl-5">Prescribed: {prescribedWeight} lb</p>
      )}
      {hitsTopOfRange && (
        <p className="text-xs text-[var(--success)] pl-5 flex items-center gap-1">
          <TrendingUp className="w-3 h-3 shrink-0" />
          Increase weight next session
        </p>
      )}
    </div>
  );
}

// ── Desktop SetRow ──────────────────────────────────────────────────────────────

function DesktopSetRow({
  idx,
  entry,
  repMax,
  onChange,
  onComplete,
}: {
  idx: number;
  entry: SetEntry;
  repMax: number | null;
  onChange: (patch: Partial<SetEntry>) => void;
  onComplete: () => void;
}) {
  const hitsTopOfRange =
    !entry.isSeconds &&
    entry.completed &&
    repMax != null &&
    entry.reps !== "" &&
    parseInt(entry.reps, 10) >= repMax;

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
            entry.isBodyweight ? "border-[rgba(31,122,77,0.30)] text-[var(--success)] bg-[rgba(31,122,77,0.07)]" :
            entry.isBand ? "border-[rgba(43,107,255,0.30)] text-[var(--blue-deep)] bg-[rgba(43,107,255,0.07)]" :
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
              ? "border-[rgba(43,107,255,0.30)] text-[var(--blue-deep)] bg-[rgba(43,107,255,0.07)] hover:bg-[rgba(43,107,255,0.12)]"
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
              ? "bg-[var(--success)] border-[var(--success)] text-white"
              : "border-border text-muted-foreground hover:border-[rgba(31,122,77,0.30)] hover:text-[var(--success)]"
          )}
        >
          {entry.saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
        </button>
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

      {hitsTopOfRange && (
        <p className="text-xs text-[var(--success)] pl-7 flex items-center gap-1">
          <TrendingUp className="w-3 h-3 shrink-0" />
          Increase weight next session
        </p>
      )}
    </div>
  );
}
