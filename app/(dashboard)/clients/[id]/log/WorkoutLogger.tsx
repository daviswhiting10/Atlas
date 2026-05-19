"use client";

/// <reference types="@types/dom-speech-recognition" />

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  ArrowLeft,
  Check,
  ChevronDown,
  ChevronUp,
  Loader2,
  Mic,
  MicOff,
  Plus,
  SkipForward,
  TrendingUp,
  AlertTriangle,
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

function formatLastSets(
  lastSets: LoggerExercise["lastSets"],
  goalLabel: string
): string {
  if (lastSets.length === 0) return "";
  const parts = lastSets.map((s) => {
    const w = s.weight != null ? `${s.weight} lb` : "BW";
    const r = s.reps != null ? `× ${s.reps}` : "";
    return `${w} ${r}`.trim();
  });
  const rpeParts = lastSets
    .map((s) => s.rpe)
    .filter((r): r is number => r != null);
  const rpeStr =
    rpeParts.length > 0 ? ` @ RPE ${Math.max(...rpeParts).toFixed(1)}` : "";
  return `Last: ${parts.join(", ")}${rpeStr}`;
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
    state[ex.aweId] = {
      sets,
      noteInput: "",
      noteSaving: false,
      noteAdded: false,
    };
  }
  return state;
}

// ── Component ─────────────────────────────────────────────────────────────────

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
  const [workoutLogId, setWorkoutLogId] = useState<string | null>(
    existingWorkoutLogId
  );
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

  const isResuming = existingWorkoutLogId != null;
  const dateLabel = new Date(scheduledDate).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });

  // ── Set field update ──────────────────────────────────────────────────────

  function updateSet(
    aweId: string,
    idx: number,
    patch: Partial<SetEntry>
  ) {
    setExState((prev) => {
      const sets = [...prev[aweId].sets];
      sets[idx] = { ...sets[idx], ...patch };
      return { ...prev, [aweId]: { ...prev[aweId], sets } };
    });
  }

  // ── Add set ───────────────────────────────────────────────────────────────

  function addSet(aweId: string) {
    setExState((prev) => {
      const sets = prev[aweId].sets;
      const last = sets[sets.length - 1];
      const newSet: SetEntry = {
        setLogId: null,
        weight: last?.weight ?? "",
        reps: last?.reps ?? "",
        rpe: "",
        completed: false,
        saving: false,
      };
      return {
        ...prev,
        [aweId]: { ...prev[aweId], sets: [...sets, newSet] },
      };
    });
  }

  // ── Tap ✓ — save set ──────────────────────────────────────────────────────

  async function handleComplete(
    aweId: string,
    exerciseId: string,
    idx: number
  ) {
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
        weight: entry.weight ? parseFloat(entry.weight) : null,
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
    } catch {
      toast.error("Failed to save set");
      updateSet(aweId, idx, { saving: false });
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

  // ── Save coach note ───────────────────────────────────────────────────────

  async function saveNote(aweId: string, exerciseId: string) {
    const note = exState[aweId].noteInput.trim();
    if (!note) return;
    setExState((prev) => ({
      ...prev,
      [aweId]: { ...prev[aweId], noteSaving: true },
    }));
    try {
      await addExerciseNote({ clientId, exerciseId, note });
      setExState((prev) => ({
        ...prev,
        [aweId]: {
          ...prev[aweId],
          noteSaving: false,
          noteInput: "",
          noteAdded: true,
        },
      }));
      toast.success("Note saved");
    } catch {
      setExState((prev) => ({
        ...prev,
        [aweId]: { ...prev[aweId], noteSaving: false },
      }));
      toast.error("Failed to save note");
    }
  }

  // ── Complete session ──────────────────────────────────────────────────────

  async function handleComplete_session() {
    if (!workoutLogId) {
      toast.error("Log at least one set before completing");
      return;
    }
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

  // ── Render ────────────────────────────────────────────────────────────────

  const anyCompleted = Object.values(exState).some((ex) =>
    ex.sets.some((s) => s.completed)
  );

  return (
    <div className="p-6 max-w-2xl pb-16">
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
          <h1 className="text-xl font-bold tracking-tight leading-tight">
            {workoutName}
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {assignmentName} · {dateLabel}
            {isResuming && (
              <span className="ml-2 text-amber-600 font-medium">Resuming</span>
            )}
          </p>
        </div>
        <div className="flex gap-2 shrink-0">
          <Button
            variant="outline"
            size="sm"
            onClick={() => router.push(`/clients/${clientId}`)}
          >
            <SkipForward className="w-3.5 h-3.5 mr-1.5" />
            Skip
          </Button>
          <Button
            size="sm"
            disabled={completing || !anyCompleted}
            onClick={handleComplete_session}
          >
            {completing ? (
              <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
            ) : (
              <Check className="w-3.5 h-3.5 mr-1.5" />
            )}
            Done
          </Button>
        </div>
      </div>

      {/* Exercise cards */}
      <div className="space-y-4">
        {exercises.map((ex) => {
          const state = exState[ex.aweId];
          const lastStr = formatLastSets(ex.lastSets, "");
          const s = ex.suggestion;
          const hasLastData = ex.lastSets.length > 0;

          return (
            <Card key={ex.aweId}>
              <CardHeader className="pb-2 pt-4 px-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <CardTitle className="text-sm font-semibold leading-tight">
                      {ex.name}
                    </CardTitle>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {ex.prescribedSets.length} ×{" "}
                      {ex.prescribedSets[0]
                        ? ex.prescribedSets[0].repMin === ex.prescribedSets[0].repMax
                          ? ex.prescribedSets[0].repMax
                          : `${ex.prescribedSets[0].repMin}–${ex.prescribedSets[0].repMax}`
                        : "?"}
                    </p>
                  </div>
                  <Badge variant="outline" className="text-xs shrink-0">
                    {ex.prescribedSets[0]?.restSeconds != null
                      ? `${ex.prescribedSets[0].restSeconds}s rest`
                      : "—"}
                  </Badge>
                </div>

                {/* Last performance */}
                {hasLastData ? (
                  <p className="text-xs text-muted-foreground mt-1">{lastStr}</p>
                ) : (
                  <p className="text-xs text-muted-foreground mt-1 italic">
                    First time — start conservative.
                  </p>
                )}

                {/* Progression suggestion */}
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
                  <p className="text-xs text-muted-foreground mt-1 italic">
                    {s.reasoning}
                  </p>
                )}

                {/* Last coach note */}
                {ex.lastNote && (
                  <p className="text-xs text-muted-foreground italic mt-1 border-l-2 border-muted pl-2">
                    📝 {ex.lastNote}
                  </p>
                )}
              </CardHeader>

              <CardContent className="px-4 pb-4 space-y-1.5">
                {/* Set rows */}
                {state.sets.map((entry, idx) => (
                  <SetRow
                    key={idx}
                    idx={idx}
                    entry={entry}
                    onChange={(patch) => updateSet(ex.aweId, idx, patch)}
                    onComplete={() => handleComplete(ex.aweId, ex.exerciseId, idx)}
                  />
                ))}

                {/* Add set */}
                <button
                  type="button"
                  onClick={() => addSet(ex.aweId)}
                  className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 mt-1 px-1"
                >
                  <Plus className="w-3 h-3" />
                  Add set
                </button>

                {/* Coach note input */}
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
                            [ex.aweId]: {
                              ...prev[ex.aweId],
                              noteInput: e.target.value,
                            },
                          }))
                        }
                        placeholder="Coach note for this exercise…"
                        className="h-7 text-xs"
                        onKeyDown={(e) => {
                          if (e.key === "Enter") saveNote(ex.aweId, ex.exerciseId);
                        }}
                      />
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs px-2 shrink-0"
                        disabled={!state.noteInput.trim() || state.noteSaving}
                        onClick={() => saveNote(ex.aweId, ex.exerciseId)}
                      >
                        {state.noteSaving ? (
                          <Loader2 className="w-3 h-3 animate-spin" />
                        ) : (
                          "Save"
                        )}
                      </Button>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* SOAP Notes — collapsible */}
      <div className="mt-6 border rounded-lg overflow-hidden">
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
              <p className="text-xs text-muted-foreground">
                Speak or type post-session narrative.
              </p>
              <Button
                variant={recording ? "destructive" : "outline"}
                size="sm"
                onClick={toggleRecording}
                className="gap-1.5 h-7 text-xs"
              >
                {recording ? (
                  <><MicOff className="w-3 h-3" />Stop</>
                ) : (
                  <><Mic className="w-3 h-3" />Voice</>
                )}
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
              placeholder="She crushed it today — hit 95 lb on bench for the first time. RPE felt like a 7…"
              rows={4}
              className="text-sm resize-none font-mono"
            />
            {rawInput.trim() && !structuredNote && (
              <Button
                variant="outline"
                size="sm"
                onClick={structureNote}
                disabled={structuring}
                className="w-full"
              >
                {structuring ? (
                  <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />Structuring…</>
                ) : (
                  "Structure with AI →"
                )}
              </Button>
            )}
            {structuredNote && (
              <div className="space-y-2">
                {(["subjective", "objective", "assessment", "plan"] as const).map(
                  (key) =>
                    structuredNote[key] ? (
                      <div key={key} className="text-xs">
                        <span className="font-semibold uppercase tracking-wider text-muted-foreground">
                          {key}:{" "}
                        </span>
                        <span>{String(structuredNote[key])}</span>
                      </div>
                    ) : null
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-xs h-6"
                  onClick={() => setStructuredNote(null)}
                >
                  Clear
                </Button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Complete button (bottom) */}
      <div className="mt-6 flex justify-end gap-3">
        <Button
          variant="outline"
          onClick={() => router.push(`/clients/${clientId}`)}
        >
          Cancel
        </Button>
        <Button
          disabled={completing || !anyCompleted}
          onClick={handleComplete_session}
          className="min-w-[160px]"
        >
          {completing ? (
            <><Loader2 className="w-4 h-4 mr-1.5 animate-spin" />Saving…</>
          ) : (
            "Save & Complete Session"
          )}
        </Button>
      </div>
    </div>
  );
}

// ── SetRow sub-component ───────────────────────────────────────────────────────

function SetRow({
  idx,
  entry,
  onChange,
  onComplete,
}: {
  idx: number;
  entry: SetEntry;
  onChange: (patch: Partial<SetEntry>) => void;
  onComplete: () => void;
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-1.5 transition-opacity",
        entry.completed && "opacity-60"
      )}
    >
      <span className="text-xs text-muted-foreground w-5 shrink-0 text-right">
        {idx + 1}
      </span>

      {/* Weight */}
      <Input
        value={entry.weight}
        onChange={(e) => onChange({ weight: e.target.value })}
        placeholder="lb"
        className="h-7 w-16 text-xs text-center px-1"
        type="number"
        step="2.5"
      />
      <span className="text-xs text-muted-foreground shrink-0">lb</span>

      {/* Reps */}
      <span className="text-xs text-muted-foreground shrink-0">×</span>
      <Input
        value={entry.reps}
        onChange={(e) => onChange({ reps: e.target.value })}
        placeholder="reps"
        className="h-7 w-14 text-xs text-center px-1"
        type="number"
      />
      <span className="text-xs text-muted-foreground shrink-0">reps</span>

      {/* RPE */}
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

      {/* ✓ button */}
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
        {entry.saving ? (
          <Loader2 className="w-3 h-3 animate-spin" />
        ) : (
          <Check className="w-3 h-3" />
        )}
      </button>
    </div>
  );
}
