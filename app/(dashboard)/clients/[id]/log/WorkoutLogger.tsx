"use client";

/// <reference types="@types/dom-speech-recognition" />

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  ArrowLeft,
  Calendar,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
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
} from "lucide-react";
import {
  logSet,
  completeSession,
  addExerciseNote,
  updateSessionDate,
} from "@/lib/actions/workout-logger";
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

// ── Block + round-robin helpers ────────────────────────────────────────────────

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

/** First incomplete slot within a single block. Returns null if block is done. */
function findFirstSlotInBlock(
  block: ExBlock,
  exercises: LoggerExercise[],
  state: Record<string, ExerciseState>
): { exIdx: number; setRound: number } | null {
  const maxSets = Math.max(...block.exIndices.map((i) => state[exercises[i].aweId]?.sets.length ?? 0), 1);
  for (let setRound = 0; setRound < maxSets; setRound++) {
    for (const exIdx of block.exIndices) {
      const sets = state[exercises[exIdx].aweId]?.sets ?? [];
      if (setRound < sets.length && !sets[setRound].completed) {
        return { exIdx, setRound };
      }
    }
  }
  return null;
}

/** Find the first incomplete slot across all blocks (for initialization/resume). */
function findFirstIncompleteSlot(
  exercises: LoggerExercise[],
  state: Record<string, ExerciseState>
): { exIdx: number; setRound: number } {
  for (const block of groupIntoBlocks(exercises)) {
    const slot = findFirstSlotInBlock(block, exercises, state);
    if (slot) return slot;
  }
  return { exIdx: 0, setRound: 0 };
}

/**
 * After completing (completedAweId, completedSetIdx), find the next slot.
 *
 * Algorithm: build the full round-robin sequence for the current block
 * (round 0 of all exercises, then round 1, etc.), locate where we are,
 * and return the first INCOMPLETE slot that comes after.  Only after the
 * whole block is done do we advance to the first incomplete slot of the
 * next block.
 */
function findNextSlotAfterComplete(
  exercises: LoggerExercise[],
  exState: Record<string, ExerciseState>,
  completedAweId: string,
  completedSetIdx: number,
  fromExIdx: number,
  fromSetRound: number
): { exIdx: number; setRound: number } | null {
  // Build simulated state that includes this completion
  const simState: Record<string, ExerciseState> = {
    ...exState,
    [completedAweId]: {
      ...exState[completedAweId],
      sets: exState[completedAweId].sets.map((s, i) =>
        i === completedSetIdx ? { ...s, completed: true } : s
      ),
    },
  };

  const blocks = groupIntoBlocks(exercises);
  const blockIdx = blocks.findIndex((b) => b.exIndices.includes(fromExIdx));
  if (blockIdx < 0) return null;

  const block = blocks[blockIdx];

  // Max prescribed sets across all exercises in this block
  const maxSets = block.exIndices.reduce((acc, i) => {
    return Math.max(acc, simState[exercises[i].aweId]?.sets.length ?? 0);
  }, 0);

  // Build the complete ordered round-robin sequence for this block:
  //   [(round=0, ex0), (round=0, ex1), …, (round=1, ex0), …]
  type Slot = { exIdx: number; setRound: number };
  const sequence: Slot[] = [];
  for (let round = 0; round < maxSets; round++) {
    for (const exIdx of block.exIndices) {
      const sets = simState[exercises[exIdx].aweId]?.sets ?? [];
      if (round < sets.length) {
        sequence.push({ exIdx, setRound: round });
      }
    }
  }

  // Find where the just-completed slot sits in the sequence
  const currentPos = sequence.findIndex(
    (s) => s.exIdx === fromExIdx && s.setRound === fromSetRound
  );

  // Walk forward from the next position; return the first INCOMPLETE slot
  for (let i = currentPos + 1; i < sequence.length; i++) {
    const { exIdx, setRound } = sequence[i];
    const sets = simState[exercises[exIdx].aweId]?.sets ?? [];
    if (sets[setRound] && !sets[setRound].completed) {
      return { exIdx, setRound };
    }
  }

  // Every slot in this block is done → advance to first incomplete slot in next block
  for (let bi = blockIdx + 1; bi < blocks.length; bi++) {
    const slot = findFirstSlotInBlock(blocks[bi], exercises, simState);
    if (slot) return slot;
  }

  return null; // All complete
}

/** Walk backwards one slot in the round-robin sequence (cross-block aware). */
function findPrevSlot(
  exercises: LoggerExercise[],
  exState: Record<string, ExerciseState>,
  fromExIdx: number,
  fromSetRound: number
): { exIdx: number; setRound: number } | null {
  const blocks = groupIntoBlocks(exercises);
  const blockIdx = blocks.findIndex((b) => b.exIndices.includes(fromExIdx));
  if (blockIdx < 0) return null;

  const block = blocks[blockIdx];
  const maxSets = block.exIndices.reduce(
    (acc, i) => Math.max(acc, exState[exercises[i].aweId]?.sets.length ?? 0),
    0
  );

  type Slot = { exIdx: number; setRound: number };
  const sequence: Slot[] = [];
  for (let round = 0; round < maxSets; round++) {
    for (const exIdx of block.exIndices) {
      const sets = exState[exercises[exIdx].aweId]?.sets ?? [];
      if (round < sets.length) sequence.push({ exIdx, setRound: round });
    }
  }

  const currentPos = sequence.findIndex(
    (s) => s.exIdx === fromExIdx && s.setRound === fromSetRound
  );

  if (currentPos > 0) return sequence[currentPos - 1];

  // First slot in block → last slot of previous block
  for (let bi = blockIdx - 1; bi >= 0; bi--) {
    const prevBlock = blocks[bi];
    const prevMaxSets = prevBlock.exIndices.reduce(
      (acc, i) => Math.max(acc, exState[exercises[i].aweId]?.sets.length ?? 0),
      0
    );
    const prevSeq: Slot[] = [];
    for (let round = 0; round < prevMaxSets; round++) {
      for (const exIdx of prevBlock.exIndices) {
        const sets = exState[exercises[exIdx].aweId]?.sets ?? [];
        if (round < sets.length) prevSeq.push({ exIdx, setRound: round });
      }
    }
    if (prevSeq.length > 0) return prevSeq[prevSeq.length - 1];
  }

  return null;
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
  const recognitionRef = useRef<SpeechRecognition | null>(null);

  // ── Mobile-specific state ────────────────────────────────────────────────────
  const [currentExIdx, setCurrentExIdx] = useState<number>(() => {
    if (existingSetLogs.length === 0) return 0;
    const init = buildInitialState(exercises, existingSetLogs);
    return findFirstIncompleteSlot(exercises, init).exIdx;
  });
  const [currentSetRound, setCurrentSetRound] = useState<number>(() => {
    if (existingSetLogs.length === 0) return 0;
    const init = buildInitialState(exercises, existingSetLogs);
    return findFirstIncompleteSlot(exercises, init).setRound;
  });
  const [lastSetAt, setLastSetAt] = useState<number | null>(null);
  const [restSecs, setRestSecs] = useState(0);
  const [undoEntry, setUndoEntry] = useState<{ aweId: string; idx: number } | null>(null);
  const undoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const touchStartX = useRef(0);
  // Tracks the slot just completed (shows brief "✓" flash before auto-advance)
  const [justCompletedKey, setJustCompletedKey] = useState<string | null>(null);
  // Allows editing a fully-logged session (suppresses the all-done completion screen)
  const [editMode, setEditMode] = useState(false);

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
      // Mobile: start rest timer + undo window + round-robin auto-advance
      if (!entry.completed) {
        setLastSetAt(Date.now());
        setRestSecs(0);
        setUndoEntry({ aweId, idx });
        setJustCompletedKey(`${aweId}-${idx}`);
        if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
        undoTimerRef.current = setTimeout(() => setUndoEntry(null), 5000);

        // Auto-advance to next slot in round-robin order
        const next = findNextSlotAfterComplete(
          exercises, exState, aweId, idx, currentExIdx, currentSetRound
        );
        if (next) {
          setTimeout(() => {
            setJustCompletedKey(null);
            setCurrentExIdx(next.exIdx);
            setCurrentSetRound(next.setRound);
          }, 350);
        } else {
          // All done — clear the just-completed flash after a beat
          setTimeout(() => setJustCompletedKey(null), 600);
        }
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
      // Advance to next slot if available
      const next = findNextSlotAfterComplete(exercises, exState, aweId, idx, currentExIdx, currentSetRound);
      if (next) {
        setTimeout(() => {
          setCurrentExIdx(next.exIdx);
          setCurrentSetRound(next.setRound);
        }, 300);
      }
    } catch {
      toast.error("Failed to update set");
      updateSet(aweId, idx, { saving: false });
    }
  }

  // ── Undo last set ─────────────────────────────────────────────────────────
  function handleUndo() {
    if (!undoEntry) return;
    const { aweId, idx } = undoEntry;
    updateSet(aweId, idx, { completed: false, setLogId: null });
    // Navigate back to the undone slot
    const exIdx = exercises.findIndex((ex) => ex.aweId === aweId);
    if (exIdx >= 0) {
      setCurrentExIdx(exIdx);
      setCurrentSetRound(idx);
    }
    setUndoEntry(null);
    setLastSetAt(null);
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
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
        router.push(`/clients/${clientId}`);
      } catch {
        toast.error("Failed to complete session");
      }
    });
  }

  // ── Swipe between exercises (mobile) — block-scoped ─────────────────────
  function handleTouchStart(e: React.TouchEvent) {
    touchStartX.current = e.touches[0].clientX;
  }
  function handleTouchEnd(e: React.TouchEvent) {
    const diff = touchStartX.current - e.changedTouches[0].clientX;
    if (Math.abs(diff) < 60) return;
    const blocks = groupIntoBlocks(exercises);
    const currentBlock = blocks.find((b) => b.exIndices.includes(currentExIdx));
    if (!currentBlock) return;
    const posInBlock = currentBlock.exIndices.indexOf(currentExIdx);
    if (diff > 0) {
      // Swipe left → next exercise in block, or next round in block
      if (posInBlock < currentBlock.exIndices.length - 1) {
        setCurrentExIdx(currentBlock.exIndices[posInBlock + 1]);
      } else {
        setCurrentExIdx(currentBlock.exIndices[0]);
        setCurrentSetRound((r) => r + 1);
      }
    }
    if (diff < 0 && posInBlock > 0) {
      setCurrentExIdx(currentBlock.exIndices[posInBlock - 1]);
    }
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
    <div className="mt-4 border rounded-lg overflow-hidden">
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
            <div className="flex items-center gap-2 text-xs text-red-600">
              <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
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
  // MOBILE LAYOUT  (hidden on md+)
  // ═══════════════════════════════════════════════════════════════════════════

  const mobileView = (() => {
    const safeExIdx = Math.min(currentExIdx, exercises.length - 1);
    const ex = exercises[safeExIdx];
    const state = exState[ex.aweId];
    const setIdx = currentSetRound;
    const activeSet = state.sets[setIdx];
    const allSessionDone = exercises.every((e) =>
      exState[e.aweId].sets.every((s) => s.completed)
    );
    const s = ex.suggestion;
    const lastStr = formatLastSets(ex.lastSets);
    const prescribed = ex.prescribedSets[setIdx] ?? ex.prescribedSets[0] ?? null;
    const repMax = prescribed?.repMax ?? null;

    // Block-scoped context
    const blocks = groupIntoBlocks(exercises);
    const currentBlock = blocks.find((b) => b.exIndices.includes(safeExIdx)) ?? blocks[0]!;
    const posInBlock = currentBlock.exIndices.indexOf(safeExIdx);
    const blockLabel = formatBlockLabel(currentBlock.section);
    const totalRounds = Math.max(
      ...currentBlock.exIndices.map((i) => exState[exercises[i].aweId]?.sets.length ?? 0),
      1
    );

    return (
      <div
        className="md:hidden px-4 pt-2 pb-4"
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        {/* ── Top bar ───────────────────────────────────────────────── */}
        <div className="flex items-center justify-between mb-3">
          <Link
            href={`/clients/${clientId}`}
            className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "-ml-2")}
          >
            <ArrowLeft className="w-4 h-4 mr-1" />
            <span className="max-w-[100px] truncate">{clientName}</span>
          </Link>
          <Button
            size="sm"
            disabled={completing || !anyCompleted}
            onClick={handleCompleteSession}
            variant="outline"
          >
            {completing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5 mr-1" />}
            Done
          </Button>
        </div>

        {/* ── Session date chip ─────────────────────────────────────── */}
        <div className="flex items-center justify-center mb-2">
          <label className="relative inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-medium text-muted-foreground bg-muted/40 cursor-pointer hover:bg-muted/70 transition-colors touch-manipulation">
            <Calendar className="w-3 h-3 shrink-0" />
            <span>{dateLabel}</span>
            <input
              type="date"
              value={logDate}
              onChange={(e) => { if (e.target.value) handleDateChange(e.target.value); }}
              className="absolute inset-0 opacity-0 w-full h-full cursor-pointer"
            />
          </label>
        </div>

        {/* ── Day picker ────────────────────────────────────────────── */}
        {dayPicker}

        {/* ── Block label + progress dots (scoped to current block) ──── */}
        <div className="mb-4">
          {blockLabel && (
            <p className="text-xs font-semibold uppercase tracking-widest text-primary text-center mb-2">
              {blockLabel}
            </p>
          )}
          <div className="flex items-center justify-center gap-1.5">
            {currentBlock.exIndices.map((exI, bi) => {
              const exSets = exState[exercises[exI].aweId]?.sets ?? [];
              const done = exSets.every((s) => s.completed);
              return (
                <button
                  key={exI}
                  onClick={() => setCurrentExIdx(exI)}
                  className={cn(
                    "rounded-full transition-all touch-manipulation",
                    bi === posInBlock
                      ? "w-6 h-2 bg-primary"
                      : done
                      ? "w-2 h-2 bg-green-500"
                      : "w-2 h-2 bg-muted-foreground/30"
                  )}
                />
              );
            })}
          </div>
        </div>

        {/* ── Exercise header ────────────────────────────────────────── */}
        <div className="mb-4">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="flex items-center gap-2 mb-0.5">
                <p className="text-xs font-medium text-muted-foreground">
                  Exercise {posInBlock + 1} of {currentBlock.exIndices.length}
                </p>
                <span className="text-muted-foreground/40 text-xs">·</span>
                <p className="text-xs font-semibold text-primary">
                  Set {setIdx + 1} of {totalRounds}
                </p>
              </div>
              <h2 className="text-xl font-bold leading-tight">{ex.name}</h2>
              <p className="text-sm text-muted-foreground mt-0.5">
                {ex.prescribedSets.length} ×{" "}
                {ex.prescribedSets[0]?.unit === "secs"
                  ? `${ex.prescribedSets[0]?.repMax}s`
                  : ex.prescribedSets[0]?.repMin === ex.prescribedSets[0]?.repMax
                    ? ex.prescribedSets[0]?.repMax
                    : `${ex.prescribedSets[0]?.repMin}–${ex.prescribedSets[0]?.repMax}`}
              </p>
            </div>
            {isResuming && (
              <span className="text-xs text-amber-600 font-medium shrink-0 mt-1">Resuming</span>
            )}
          </div>

          {lastStr && (
            <p className="text-xs text-muted-foreground mt-1.5">Last: {lastStr}</p>
          )}
          {/* Previous week reference — same workout, one week prior */}
          {ex.prevWorkoutSets.length > 0 && (
            <p className="text-xs mt-1" style={{ color: "var(--blue)" }}>
              <span className="font-semibold">Prev week:</span>{" "}
              {formatPrevSets(ex.prevWorkoutSets)}
            </p>
          )}
          {!ex.lastSets.length && !ex.prevWorkoutSets.length && (
            <p className="text-xs text-muted-foreground italic mt-1.5">First time — start conservative.</p>
          )}

          {/* Progression suggestion */}
          {s.type === "progress" && (
            <div className="flex items-center gap-1 mt-1.5">
              <TrendingUp className="w-3 h-3 text-green-700 shrink-0" />
              <p className="text-xs text-green-700">{s.reasoning}</p>
            </div>
          )}
          {s.type === "deload" && (
            <div className="flex items-center gap-1 mt-1.5">
              <AlertTriangle className="w-3 h-3 text-red-500 shrink-0" />
              <p className="text-xs text-red-700">{s.reasoning}</p>
            </div>
          )}
          {ex.lastNote && (
            <p className="text-xs text-muted-foreground italic mt-1.5 border-l-2 border-muted pl-2">
              {ex.lastNote}
            </p>
          )}
        </div>

        {/* ── Set inputs ─────────────────────────────────────────────── */}
        {allSessionDone && !editMode ? (
          <div className="pb-4">
            <div className="text-center pt-6 pb-4">
              <CheckCircle2 className="w-12 h-12 text-green-600 mx-auto mb-2" />
              <p className="text-lg font-semibold">All sets complete!</p>
              <button
                type="button"
                onClick={() => { setEditMode(true); setCurrentExIdx(0); setCurrentSetRound(0); }}
                className="mt-3 text-sm text-primary underline touch-manipulation"
              >
                Edit session values
              </button>
            </div>

            {/* Session notes summary */}
            {(() => {
              const notedExercises = exercises
                .map((e) => ({
                  name: e.name,
                  sets: exState[e.aweId].sets
                    .map((s, i) => ({ setNum: i + 1, note: s.note.trim(), load:
                      s.isBand
                        ? (BAND_COLORS.find(b => b.id === s.bandColor)?.label ?? s.bandColor) + " band"
                        : s.isBodyweight ? "BW"
                        : s.weight ? `${s.weight} lb` : null,
                      reps: s.reps || null,
                      isSeconds: s.isSeconds,
                    }))
                    .filter((s) => s.note),
                }))
                .filter((e) => e.sets.length > 0);

              if (notedExercises.length === 0) return (
                <p className="text-xs text-center text-muted-foreground mb-4">No set notes this session.</p>
              );

              return (
                <div className="space-y-3 mb-4">
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground text-center">Session Notes</p>
                  {notedExercises.map((e) => (
                    <div key={e.name} className="rounded-xl border bg-muted/30 px-4 py-3">
                      <p className="text-sm font-semibold mb-2">{e.name}</p>
                      <div className="space-y-1.5">
                        {e.sets.map((s) => (
                          <div key={s.setNum} className="flex gap-2 text-xs">
                            <span className="text-muted-foreground shrink-0 w-12">
                              Set {s.setNum}{s.load || s.reps ? ` · ${[s.load, s.reps ? (s.isSeconds ? `${s.reps}s` : `${s.reps}r`) : null].filter(Boolean).join(" × ")}` : ""}
                            </span>
                            <span className="text-foreground">{s.note}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              );
            })()}
          </div>
        ) : justCompletedKey === `${ex.aweId}-${setIdx}` ? (
          <div className="py-10 text-center">
            <CheckCircle2 className="w-10 h-10 text-green-600 mx-auto mb-3" />
            <p className="text-base font-semibold text-green-700">Set {setIdx + 1} complete ✓</p>
            <p className="text-sm text-muted-foreground mt-1">Moving to next exercise…</p>
          </div>
        ) : (
          <>
            {/* Edit mode banner */}
            {activeSet?.completed && (
              <div className="flex items-center gap-2 rounded-xl px-3 py-2 mb-4 text-xs font-medium"
                style={{ background: "rgba(43,107,255,0.07)", color: "var(--blue)" }}>
                <RotateCcw className="w-3.5 h-3.5 shrink-0" />
                Editing completed set — tap Update to save changes
              </div>
            )}
            {/* Load — Weight / Bodyweight / Band */}
            <div className="mb-5">
              <div className="flex items-center justify-between mb-1.5">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Load</p>
                {prescribed?.weight != null && !activeSet.isBodyweight && !activeSet.isBand && (
                  <p className="text-xs font-semibold text-green-700">Prescribed: {prescribed.weight} lb</p>
                )}
              </div>

              {/* Load-type toggle row */}
              <div className="flex gap-1.5 mb-3">
                {(["weight", "band", "bw"] as const).map((mode) => {
                  const active =
                    mode === "weight" ? (!activeSet.isBodyweight && !activeSet.isBand) :
                    mode === "band"   ? activeSet.isBand :
                    activeSet.isBodyweight;
                  return (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => updateSet(ex.aweId, setIdx, {
                        isBodyweight: mode === "bw",
                        isBand: mode === "band",
                        weight: mode !== "weight" ? "" : activeSet.weight,
                      })}
                      className={cn(
                        "flex-1 h-9 rounded-xl text-xs font-semibold border-2 transition-colors touch-manipulation",
                        active
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-border text-muted-foreground"
                      )}
                    >
                      {mode === "weight" ? "Weight" : mode === "band" ? "Band" : "BW"}
                    </button>
                  );
                })}
              </div>

              {/* Band color picker */}
              {activeSet.isBand && (
                <div className="flex gap-2 justify-between mb-1">
                  {BAND_COLORS.map(({ id, label, hex }) => (
                    <button
                      key={id}
                      type="button"
                      title={label}
                      onClick={() => updateSet(ex.aweId, setIdx, { bandColor: id })}
                      className={cn(
                        "flex-1 h-12 rounded-xl border-2 transition-all touch-manipulation flex items-center justify-center",
                        activeSet.bandColor === id
                          ? "border-foreground scale-105 shadow-md"
                          : "border-transparent opacity-70"
                      )}
                      style={{ backgroundColor: hex }}
                    >
                      {activeSet.bandColor === id && (
                        <Check className="w-4 h-4 text-white drop-shadow" strokeWidth={3} />
                      )}
                    </button>
                  ))}
                </div>
              )}

              {/* BW display */}
              {activeSet.isBodyweight && (
                <div className="h-16 rounded-xl border-2 bg-muted flex items-center justify-center text-lg font-semibold text-muted-foreground">
                  Bodyweight
                </div>
              )}

              {/* Weight input */}
              {!activeSet.isBodyweight && !activeSet.isBand && (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => adjustWeight(ex.aweId, setIdx, -2.5)}
                    className="w-16 h-16 rounded-xl border-2 shadow-md flex items-center justify-center text-2xl font-light touch-manipulation select-none active:bg-muted"
                  >
                    −
                  </button>
                  <Input
                    value={activeSet.weight}
                    onChange={(e) => updateSet(ex.aweId, setIdx, { weight: e.target.value })}
                    className="flex-1 h-16 text-center font-bold rounded-xl border-2 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
                    type="number"
                    inputMode="decimal"
                    step="2.5"
                    style={{ fontSize: "1.75rem" }}
                    placeholder="lb"
                  />
                  <button
                    type="button"
                    onClick={() => adjustWeight(ex.aweId, setIdx, 2.5)}
                    className="w-16 h-16 rounded-xl border-2 shadow-md flex items-center justify-center text-2xl font-light touch-manipulation select-none active:bg-muted"
                  >
                    +
                  </button>
                </div>
              )}
            </div>

            {/* Reps / Seconds */}
            <div className="mb-5">
              <div className="flex items-center justify-between mb-1.5">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  {activeSet.isSeconds ? "Seconds" : "Reps"}
                </p>
                {prescribed && (
                  <p className="text-xs font-semibold text-green-700">
                    {activeSet.isSeconds
                      ? `${prescribed.repMax}s`
                      : prescribed.repMin === prescribed.repMax
                        ? `${prescribed.repMax} reps`
                        : `${prescribed.repMin}–${prescribed.repMax} reps`}
                  </p>
                )}
              </div>
              {/* Reps / Secs unit toggle */}
              <div className="flex gap-1.5 mb-3">
                {(["reps", "secs"] as const).map((mode) => {
                  const active = mode === "secs" ? activeSet.isSeconds : !activeSet.isSeconds;
                  return (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => updateSet(ex.aweId, setIdx, { isSeconds: mode === "secs" })}
                      className={cn(
                        "flex-1 h-9 rounded-xl text-xs font-semibold border-2 transition-colors touch-manipulation",
                        active
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-border text-muted-foreground"
                      )}
                    >
                      {mode === "reps" ? "Reps" : "Secs"}
                    </button>
                  );
                })}
              </div>
              <Input
                value={activeSet.reps}
                onChange={(e) => updateSet(ex.aweId, setIdx, { reps: e.target.value })}
                className="w-full h-20 text-center font-bold rounded-xl border-2 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
                type="number"
                inputMode="numeric"
                style={{ fontSize: "2.5rem" }}
                placeholder="—"
              />
            </div>

            {/* Complete / Update set button */}
            <button
              type="button"
              onClick={() => {
                if (activeSet?.completed) {
                  handleUpdateCompletedSet(ex.aweId, ex.exerciseId, setIdx);
                } else {
                  handleComplete(ex.aweId, ex.exerciseId, setIdx);
                }
              }}
              disabled={activeSet?.saving}
              className={cn(
                "w-full h-16 rounded-2xl text-lg font-semibold flex items-center justify-center gap-2 touch-manipulation active:opacity-90 disabled:opacity-60 mb-4",
                activeSet?.completed
                  ? "bg-blue-600 text-white"
                  : "bg-primary text-primary-foreground"
              )}
            >
              {activeSet?.saving ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : activeSet?.completed ? (
                <RotateCcw className="w-5 h-5" />
              ) : (
                <Check className="w-5 h-5" />
              )}
              {activeSet?.completed
                ? `Update Set ${setIdx + 1}`
                : `Complete Set ${setIdx + 1} of ${state.sets.length}`}
            </button>

            {/* Back to previous set */}
            {(() => {
              const prevSlot = findPrevSlot(exercises, exState, currentExIdx, currentSetRound);
              return prevSlot ? (
                <button
                  type="button"
                  onClick={() => { setCurrentExIdx(prevSlot.exIdx); setCurrentSetRound(prevSlot.setRound); }}
                  className="w-full text-center text-xs text-muted-foreground py-1.5 mb-2 touch-manipulation flex items-center justify-center gap-1"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                  Edit previous set
                </button>
              ) : null;
            })()}

            {/* Per-set note */}
            <div className="mb-4">
              <Input
                value={activeSet?.note ?? ""}
                onChange={(e) => updateSet(ex.aweId, setIdx, { note: e.target.value })}
                placeholder="Set note (optional) — band color, form cue, how it felt…"
                className="text-sm rounded-xl border-2 h-10 px-3"
                style={{ fontSize: "16px" }}
              />
            </div>

            {/* Progression hint at top of rep range (reps mode only) */}
            {!activeSet.isSeconds && activeSet.completed && repMax != null && activeSet.reps !== "" && parseInt(activeSet.reps, 10) >= repMax && (
              <p className="text-xs text-green-700 text-center flex items-center justify-center gap-1 mb-2">
                <TrendingUp className="w-3 h-3" />
                Increase weight next session
              </p>
            )}
          </>
        )}

        {/* ── Rest timer ─────────────────────────────────────────────── */}
        {lastSetAt && (
          <div className="flex items-center justify-center gap-3 mt-2 mb-3">
            <Timer className="w-4 h-4 text-muted-foreground" />
            <span className="font-mono text-2xl tabular-nums text-muted-foreground">
              {formatRest(restSecs)}
            </span>
            <button
              type="button"
              onClick={() => { setLastSetAt(Date.now()); setRestSecs(0); }}
              className="text-xs text-muted-foreground underline touch-manipulation"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* ── Undo (5-second window) ─────────────────────────────────── */}
        {undoEntry && (
          <button
            type="button"
            onClick={handleUndo}
            className="w-full text-center text-sm text-amber-600 underline py-2 touch-manipulation"
          >
            Undo last set
          </button>
        )}

        {/* ── Completed sets (collapsible) ───────────────────────────── */}
        {state.sets.some((s) => s.completed) && (
          <div className="mt-3 border rounded-xl overflow-hidden">
            <button
              type="button"
              onClick={() => {}}
              className="w-full flex items-center justify-between px-4 py-2.5 text-xs font-semibold text-muted-foreground"
            >
              <span>Completed sets ({state.sets.filter((s) => s.completed).length})</span>
            </button>
            <div className="px-4 pb-3 space-y-1">
              {state.sets.map((entry, i) =>
                entry.completed ? (
                  <button
                    key={i}
                    type="button"
                    onClick={() => setCurrentSetRound(i)}
                    className="w-full flex items-center gap-2 text-xs text-muted-foreground text-left touch-manipulation hover:text-foreground py-0.5"
                  >
                    <Check className="w-3 h-3 text-green-600 shrink-0" />
                    <span>
                      Set {i + 1}:
                      {entry.isBodyweight ? " BW" : entry.isBand ? ` ${entry.bandColor} band` : entry.weight ? ` ${entry.weight} lb` : ""}
                      {entry.reps
                        ? entry.isSeconds
                          ? ` ${entry.reps}s`
                          : ` × ${entry.reps}`
                        : ""}
                      {entry.rpe ? ` @ RPE ${entry.rpe}` : ""}
                    </span>
                    <span className="ml-auto text-[10px] text-primary opacity-0 group-hover:opacity-100">Edit</span>
                  </button>
                ) : null
              )}
            </div>
          </div>
        )}

        {/* ── Coach note ────────────────────────────────────────────── */}
        <div className="mt-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Notes</p>
          {state.noteAdded ? (
            <p className="text-xs text-green-700 py-2">Note saved ✓</p>
          ) : (
            <div className="space-y-2">
              <Textarea
                value={state.noteInput}
                onChange={(e) =>
                  setExState((prev) => ({
                    ...prev,
                    [ex.aweId]: { ...prev[ex.aweId], noteInput: e.target.value },
                  }))
                }
                placeholder="Pain, adaptation, form cue…"
                rows={3}
                className="resize-none"
                style={{ fontSize: "16px" }}
              />
              {state.noteInput.trim() && (
                <Button
                  size="sm"
                  variant="outline"
                  className="w-full"
                  disabled={state.noteSaving}
                  onClick={() => saveNote(ex.aweId, ex.exerciseId)}
                >
                  {state.noteSaving ? <Loader2 className="w-3 h-3 mr-1.5 animate-spin" /> : null}
                  Save note
                </Button>
              )}
            </div>
          )}
        </div>

        {/* ── Exercise navigation (block-scoped) ────────────────────── */}
        <div className="flex gap-3 mt-5">
          <button
            type="button"
            onClick={() => {
              if (posInBlock > 0) {
                setCurrentExIdx(currentBlock.exIndices[posInBlock - 1]);
              }
            }}
            disabled={posInBlock === 0}
            className="flex-1 h-12 rounded-xl border flex items-center justify-center gap-1 text-sm font-medium disabled:opacity-30 touch-manipulation active:bg-muted"
          >
            <ChevronLeft className="w-4 h-4" /> Prev
          </button>
          {allSessionDone ? (
            <button
              type="button"
              onClick={handleCompleteSession}
              disabled={completing || !anyCompleted}
              className="flex-1 h-12 rounded-xl bg-primary text-primary-foreground flex items-center justify-center text-sm font-semibold disabled:opacity-40 touch-manipulation"
            >
              {completing ? <Loader2 className="w-4 h-4 animate-spin" /> : "Finish session"}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => {
                if (posInBlock < currentBlock.exIndices.length - 1) {
                  setCurrentExIdx(currentBlock.exIndices[posInBlock + 1]);
                } else {
                  // End of block exercises — wrap to next round of this block
                  setCurrentExIdx(currentBlock.exIndices[0]);
                  setCurrentSetRound((r) => r + 1);
                }
              }}
              className="flex-1 h-12 rounded-xl border flex items-center justify-center gap-1 text-sm font-medium touch-manipulation active:bg-muted"
            >
              Next <ChevronRight className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* SOAP notes */}
        {soapPanel}
      </div>
    );
  })();

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
            <label className="relative inline-flex items-center gap-1 text-sm font-medium cursor-pointer group" style={{ color: "var(--ink-mute)" }}>
              <Calendar className="w-3.5 h-3.5 shrink-0 group-hover:text-foreground transition-colors" />
              <span className="group-hover:text-foreground transition-colors underline-offset-2 group-hover:underline">{dateLabel}</span>
              <input
                type="date"
                value={logDate}
                onChange={(e) => { if (e.target.value) handleDateChange(e.target.value); }}
                className="absolute inset-0 opacity-0 w-full h-full cursor-pointer"
              />
            </label>
            {isResuming && (
              <span className="font-medium text-sm" style={{ color: "var(--warn)" }}>Resuming</span>
            )}
          </div>
        </div>
        <div className="flex gap-2 shrink-0">
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
                  <CardTitle className="text-sm font-semibold leading-tight">{ex.name}</CardTitle>
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
                    <TrendingUp className="w-3 h-3 text-green-700 shrink-0" />
                    <p className="text-xs text-green-700">{s.reasoning}</p>
                  </div>
                )}
                {s.type === "hold" && hasLastData && (
                  <p className="text-xs text-amber-700 mt-1">{s.reasoning}</p>
                )}
                {s.type === "deload" && (
                  <div className="flex items-center gap-1 mt-1">
                    <AlertTriangle className="w-3 h-3 text-red-500 shrink-0" />
                    <p className="text-xs text-red-700">{s.reasoning}</p>
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
                    <p className="text-xs text-green-700">Note saved ✓</p>
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
            entry.isBodyweight ? "border-green-400 text-green-700 bg-green-50" :
            entry.isBand ? "border-blue-400 text-blue-700 bg-blue-50" :
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
              ? "border-blue-400 text-blue-700 bg-blue-50 hover:bg-blue-100"
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
              ? "bg-green-500 border-green-500 text-white"
              : "border-border text-muted-foreground hover:border-green-400 hover:text-green-700"
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
        <p className="text-xs text-green-700 pl-7 flex items-center gap-1">
          <TrendingUp className="w-3 h-3 shrink-0" />
          Increase weight next session
        </p>
      )}
    </div>
  );
}
