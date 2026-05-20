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
} from "@/lib/actions/workout-logger";
import type { LoggerExercise, PrescribedSet, ExistingSetLog } from "./page";

// ── Types ──────────────────────────────────────────────────────────────────────

type SetEntry = {
  setLogId: string | null;
  weight: string;
  isBodyweight: boolean;
  reps: string;
  rpe: string;
  completed: boolean;
  saving: boolean;
};

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
  if (existing) {
    return {
      setLogId: existing.id,
      weight: existing.weight != null ? String(existing.weight) : "",
      isBodyweight: existing.weight === null,
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
  const suggestedReps = suggestion.reps ?? ps.repMax;
  return {
    setLogId: null,
    weight: suggestedWeight != null ? String(suggestedWeight) : "",
    isBodyweight: false,
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



// ── Main component ─────────────────────────────────────────────────────────────

export default function WorkoutLogger({
  clientId,
  clientName,
  assignedWorkoutId,
  workoutName,
  scheduledDate,
  assignmentName,
  exercises,
  existingWorkoutLogId,
  existingSetLogs,
}: {
  clientId: string;
  clientName: string;
  assignedWorkoutId: string;
  workoutName: string;
  scheduledDate: string;
  assignmentName: string;
  exercises: LoggerExercise[];
  existingWorkoutLogId: string | null;
  existingSetLogs: ExistingSetLog[];
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
  const [currentExIdx, setCurrentExIdx] = useState(0);
  const [lastSetAt, setLastSetAt] = useState<number | null>(null);
  const [restSecs, setRestSecs] = useState(0);
  const [undoEntry, setUndoEntry] = useState<{ aweId: string; idx: number } | null>(null);
  const undoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const touchStartX = useRef(0);

  const isResuming = existingWorkoutLogId != null;
  const dateLabel = new Date(scheduledDate).toLocaleDateString("en-US", {
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
  function updateSet(aweId: string, idx: number, patch: Partial<SetEntry>) {
    setExState((prev) => {
      const sets = [...prev[aweId].sets];
      sets[idx] = { ...sets[idx], ...patch };
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
        weight: last?.isBodyweight ? "" : (last?.weight ?? ""),
        isBodyweight: last?.isBodyweight ?? false,
        reps: last?.reps ?? "",
        rpe: "",
        completed: false,
        saving: false,
      };
      return { ...prev, [aweId]: { ...prev[aweId], sets: [...sets, newSet] } };
    });
  }

  // ── Active set (mobile) ───────────────────────────────────────────────────
  function getActiveSetIdx(aweId: string): number {
    const sets = exState[aweId]?.sets ?? [];
    const first = sets.findIndex((s) => !s.completed);
    return first >= 0 ? first : sets.length;
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
        weight: entry.isBodyweight ? null : (entry.weight ? parseFloat(entry.weight) : null),
        reps: entry.reps ? parseInt(entry.reps, 10) : null,
        rpe: entry.rpe ? parseFloat(entry.rpe) : null,
        completed: !entry.completed,
      });
      if (!workoutLogId) setWorkoutLogId(result.workoutLogId);
      updateSet(aweId, idx, {
        saving: false,
        completed: !entry.completed,
        setLogId: result.setLogId,
      });
      // Mobile: start rest timer + undo window
      if (!entry.completed) {
        setLastSetAt(Date.now());
        setRestSecs(0);
        setUndoEntry({ aweId, idx });
        if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
        undoTimerRef.current = setTimeout(() => setUndoEntry(null), 5000);
      }
    } catch {
      toast.error("Failed to save set");
      updateSet(aweId, idx, { saving: false });
    }
  }

  // ── Undo last set ─────────────────────────────────────────────────────────
  function handleUndo() {
    if (!undoEntry) return;
    const { aweId, idx } = undoEntry;
    updateSet(aweId, idx, { completed: false, setLogId: null });
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

  // ── Swipe between exercises (mobile) ─────────────────────────────────────
  function handleTouchStart(e: React.TouchEvent) {
    touchStartX.current = e.touches[0].clientX;
  }
  function handleTouchEnd(e: React.TouchEvent) {
    const diff = touchStartX.current - e.changedTouches[0].clientX;
    if (Math.abs(diff) < 60) return;
    if (diff > 0 && currentExIdx < exercises.length - 1) setCurrentExIdx((i) => i + 1);
    if (diff < 0 && currentExIdx > 0) setCurrentExIdx((i) => i - 1);
  }

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

  // ═══════════════════════════════════════════════════════════════════════════
  // MOBILE LAYOUT  (hidden on md+)
  // ═══════════════════════════════════════════════════════════════════════════

  const mobileView = (() => {
    const ex = exercises[currentExIdx];
    const state = exState[ex.aweId];
    const activeIdx = getActiveSetIdx(ex.aweId);
    const allDone = activeIdx >= state.sets.length;
    const activeSet = state.sets[activeIdx];
    const s = ex.suggestion;
    const lastStr = formatLastSets(ex.lastSets);
    const prescribed = ex.prescribedSets[activeIdx] ?? ex.prescribedSets[0] ?? null;
    const repMax = prescribed?.repMax ?? null;

    return (
      <div
        className="md:hidden px-4 pt-2 pb-4"
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        {/* ── Top bar ───────────────────────────────────────────────── */}
        <div className="flex items-center justify-between mb-4">
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

        {/* ── Exercise progress dots ─────────────────────────────────── */}
        <div className="flex items-center justify-center gap-1.5 mb-4">
          {exercises.map((_, i) => {
            const exSets = exState[exercises[i].aweId]?.sets ?? [];
            const done = exSets.every((s) => s.completed);
            return (
              <button
                key={i}
                onClick={() => setCurrentExIdx(i)}
                className={cn(
                  "rounded-full transition-all touch-manipulation",
                  i === currentExIdx
                    ? "w-6 h-2 bg-primary"
                    : done
                    ? "w-2 h-2 bg-emerald-500"
                    : "w-2 h-2 bg-muted-foreground/30"
                )}
              />
            );
          })}
        </div>

        {/* ── Exercise header ────────────────────────────────────────── */}
        <div className="mb-4">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-xs font-medium text-muted-foreground mb-0.5">
                Exercise {currentExIdx + 1} of {exercises.length}
              </p>
              <h2 className="text-xl font-bold leading-tight">{ex.name}</h2>
              <p className="text-sm text-muted-foreground mt-0.5">
                {ex.prescribedSets.length} ×{" "}
                {ex.prescribedSets[0]?.repMin === ex.prescribedSets[0]?.repMax
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
          {!ex.lastSets.length && (
            <p className="text-xs text-muted-foreground italic mt-1.5">First time — start conservative.</p>
          )}

          {/* Progression suggestion */}
          {s.type === "progress" && (
            <div className="flex items-center gap-1 mt-1.5">
              <TrendingUp className="w-3 h-3 text-emerald-600 shrink-0" />
              <p className="text-xs text-emerald-700">{s.reasoning}</p>
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
        {allDone ? (
          <div className="py-10 text-center">
            <CheckCircle2 className="w-14 h-14 text-emerald-500 mx-auto mb-3" />
            <p className="text-lg font-semibold">Exercise complete!</p>
            <p className="text-sm text-muted-foreground mt-1">
              {currentExIdx < exercises.length - 1
                ? "Swipe or tap Next →"
                : "Tap Done to finish the session."}
            </p>
          </div>
        ) : (
          <>
            {/* Weight */}
            <div className="mb-5">
              <div className="flex items-center justify-between mb-1.5">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Weight</p>
                {prescribed?.weight != null && !activeSet.isBodyweight && (
                  <p className="text-xs font-semibold text-emerald-600">Prescribed: {prescribed.weight} lb</p>
                )}
              </div>
              {activeSet.isBodyweight ? (
                <div className="flex items-center gap-3">
                  <div className="flex-1 h-16 rounded-xl border-2 bg-muted flex items-center justify-center text-lg font-semibold">
                    BW
                  </div>
                  <button
                    type="button"
                    onClick={() => updateSet(ex.aweId, activeIdx, { isBodyweight: false, weight: "" })}
                    className="text-sm text-muted-foreground underline touch-manipulation"
                  >
                    Add lb
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => adjustWeight(ex.aweId, activeIdx, -2.5)}
                    className="w-16 h-16 rounded-xl border-2 shadow-md flex items-center justify-center text-2xl font-light touch-manipulation select-none active:bg-muted"
                  >
                    −
                  </button>
                  <Input
                    value={activeSet.weight}
                    onChange={(e) => updateSet(ex.aweId, activeIdx, { weight: e.target.value })}
                    className="flex-1 h-16 text-center font-bold rounded-xl border-2 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
                    type="number"
                    inputMode="decimal"
                    step="2.5"
                    style={{ fontSize: "1.75rem" }}
                    placeholder="lb"
                  />
                  <button
                    type="button"
                    onClick={() => adjustWeight(ex.aweId, activeIdx, 2.5)}
                    className="w-16 h-16 rounded-xl border-2 shadow-md flex items-center justify-center text-2xl font-light touch-manipulation select-none active:bg-muted"
                  >
                    +
                  </button>
                  <button
                    type="button"
                    onClick={() => updateSet(ex.aweId, activeIdx, { isBodyweight: true, weight: "" })}
                    className="text-xs font-medium text-muted-foreground border rounded-lg px-2 h-9 touch-manipulation"
                  >
                    BW
                  </button>
                </div>
              )}
            </div>

            {/* Reps */}
            <div className="mb-5">
              <div className="flex items-center justify-between mb-1.5">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Reps</p>
                {prescribed && (
                  <p className="text-xs font-semibold text-emerald-600">
                    {prescribed.repMin === prescribed.repMax
                      ? `${prescribed.repMax} reps`
                      : `${prescribed.repMin}–${prescribed.repMax} reps`}
                  </p>
                )}
              </div>
              <Input
                value={activeSet.reps}
                onChange={(e) => updateSet(ex.aweId, activeIdx, { reps: e.target.value })}
                className="w-full h-20 text-center font-bold rounded-xl border-2 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
                type="number"
                inputMode="numeric"
                style={{ fontSize: "2.5rem" }}
                placeholder="—"
              />
            </div>

            {/* Complete set button */}
            <button
              type="button"
              onClick={() => handleComplete(ex.aweId, ex.exerciseId, activeIdx)}
              disabled={activeSet.saving}
              className="w-full h-16 rounded-2xl bg-primary text-primary-foreground text-lg font-semibold flex items-center justify-center gap-2 touch-manipulation active:opacity-90 disabled:opacity-60 mb-4"
            >
              {activeSet.saving ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <Check className="w-5 h-5" />
              )}
              Complete Set
            </button>

            {/* Progression hint at top of rep range */}
            {activeSet.completed && repMax != null && activeSet.reps !== "" && parseInt(activeSet.reps, 10) >= repMax && (
              <p className="text-xs text-emerald-700 text-center flex items-center justify-center gap-1 mb-2">
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
                  <div key={i} className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Check className="w-3 h-3 text-emerald-500 shrink-0" />
                    <span>
                      Set {i + 1}:
                      {entry.isBodyweight ? " BW" : entry.weight ? ` ${entry.weight} lb` : ""}
                      {entry.reps ? ` × ${entry.reps}` : ""}
                      {entry.rpe ? ` @ RPE ${entry.rpe}` : ""}
                    </span>
                  </div>
                ) : null
              )}
            </div>
          </div>
        )}

        {/* ── Coach note ────────────────────────────────────────────── */}
        <div className="mt-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Notes</p>
          {state.noteAdded ? (
            <p className="text-xs text-emerald-600 py-2">Note saved ✓</p>
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

        {/* ── Exercise navigation ────────────────────────────────────── */}
        <div className="flex gap-3 mt-5">
          <button
            type="button"
            onClick={() => setCurrentExIdx((i) => Math.max(0, i - 1))}
            disabled={currentExIdx === 0}
            className="flex-1 h-12 rounded-xl border flex items-center justify-center gap-1 text-sm font-medium disabled:opacity-30 touch-manipulation active:bg-muted"
          >
            <ChevronLeft className="w-4 h-4" /> Prev
          </button>
          {currentExIdx < exercises.length - 1 ? (
            <button
              type="button"
              onClick={() => setCurrentExIdx((i) => i + 1)}
              className="flex-1 h-12 rounded-xl border flex items-center justify-center gap-1 text-sm font-medium touch-manipulation active:bg-muted"
            >
              Next <ChevronRight className="w-4 h-4" />
            </button>
          ) : (
            <button
              type="button"
              onClick={handleCompleteSession}
              disabled={completing || !anyCompleted}
              className="flex-1 h-12 rounded-xl bg-primary text-primary-foreground flex items-center justify-center text-sm font-semibold disabled:opacity-40 touch-manipulation"
            >
              {completing ? <Loader2 className="w-4 h-4 animate-spin" /> : "Finish session"}
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

      <div className="flex items-start justify-between mb-5 gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight leading-tight">{workoutName}</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {assignmentName} · {dateLabel}
            {isResuming && <span className="ml-2 text-amber-600 font-medium">Resuming</span>}
          </p>
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

      {/* Exercise cards */}
      <div className="space-y-4">
        {exercises.map((ex) => {
          const state = exState[ex.aweId];
          const lastStr = formatLastSets(ex.lastSets);
          const s = ex.suggestion;
          const hasLastData = ex.lastSets.length > 0;

          return (
            <Card key={ex.aweId}>
              <CardHeader className="pb-2 pt-4 px-4">
                <div className="min-w-0">
                  <CardTitle className="text-sm font-semibold leading-tight">{ex.name}</CardTitle>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {ex.prescribedSets.length} ×{" "}
                    {ex.prescribedSets[0]
                      ? ex.prescribedSets[0].repMin === ex.prescribedSets[0].repMax
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

                {s.type === "progress" && (
                  <div className="flex items-center gap-1 mt-1">
                    <TrendingUp className="w-3 h-3 text-emerald-600 shrink-0" />
                    <p className="text-xs text-emerald-700">{s.reasoning}</p>
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
                    <p className="text-xs text-emerald-600">Note saved ✓</p>
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
    entry.completed &&
    repMax != null &&
    entry.reps !== "" &&
    parseInt(entry.reps, 10) >= repMax;

  return (
    <div className="space-y-0.5">
      <div className={cn("flex items-center gap-1.5 transition-opacity", entry.completed && "opacity-60")}>
        <span className="text-xs text-muted-foreground w-5 shrink-0 text-right">{idx + 1}</span>

        {/* Weight / BW toggle */}
        {entry.isBodyweight ? (
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
        <button
          type="button"
          onClick={() => onChange({ isBodyweight: !entry.isBodyweight, weight: "" })}
          className={cn(
            "text-xs px-1 h-7 rounded border shrink-0 transition-colors",
            entry.isBodyweight
              ? "border-emerald-400 text-emerald-700 bg-emerald-50"
              : "border-border text-muted-foreground hover:border-muted-foreground"
          )}
        >
          N/A
        </button>

        <span className="text-xs text-muted-foreground shrink-0">×</span>
        <Input
          value={entry.reps}
          onChange={(e) => onChange({ reps: e.target.value })}
          placeholder="reps"
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
              ? "bg-emerald-500 border-emerald-500 text-white"
              : "border-border text-muted-foreground hover:border-emerald-400 hover:text-emerald-600"
          )}
        >
          {entry.saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
        </button>
      </div>

      {hitsTopOfRange && (
        <p className="text-xs text-emerald-700 pl-7 flex items-center gap-1">
          <TrendingUp className="w-3 h-3 shrink-0" />
          Increase weight next session
        </p>
      )}
    </div>
  );
}
