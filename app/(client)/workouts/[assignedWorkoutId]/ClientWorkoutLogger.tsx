"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { ArrowLeft, Check, Loader2 } from "lucide-react";
import { logClientSet, completeClientSession } from "@/lib/actions/client-workout-logger";
import type { ClientLoggerExercise, ExistingSetLog, PrescribedSet } from "./page";

type SetEntry = {
  setLogId: string | null;
  weight: string;
  reps: string;
  completed: boolean;
  saving: boolean;
};

function formatClock(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function lastForSet(lastSets: ClientLoggerExercise["lastSets"], setNumber: number) {
  return lastSets.find((s) => s.setNumber === setNumber) ?? null;
}

function initSetEntry(
  ps: PrescribedSet,
  lastSets: ClientLoggerExercise["lastSets"],
  existing?: ExistingSetLog
): SetEntry {
  if (existing) {
    return {
      setLogId: existing.id,
      weight: existing.weight != null ? String(existing.weight) : "",
      reps: existing.reps != null ? String(existing.reps) : "",
      completed: existing.completed,
      saving: false,
    };
  }
  const last = lastForSet(lastSets, ps.setNumber);
  const weight = last?.weight ?? ps.weight;
  const reps = last?.reps ?? ps.repMax;
  return {
    setLogId: null,
    weight: weight != null ? String(weight) : "",
    reps: reps != null ? String(reps) : "",
    completed: false,
    saving: false,
  };
}

function repRange(ps: PrescribedSet | undefined): string {
  if (!ps) return "?";
  if (ps.unit === "secs") return `${ps.repMax}s`;
  return ps.repMin === ps.repMax ? String(ps.repMax) : `${ps.repMin}–${ps.repMax}`;
}

export default function ClientWorkoutLogger({
  assignedWorkoutId,
  workoutName,
  assignmentName,
  weekNum,
  scheduledDate,
  status,
  coachName,
  coachNote,
  exercises,
  existingWorkoutLogId,
  existingSetLogs,
  existingClientNotes,
  existingDurationMin,
}: {
  assignedWorkoutId: string;
  workoutName: string;
  assignmentName: string;
  weekNum: number;
  scheduledDate: string;
  status: "PLANNED" | "LOGGED" | "SKIPPED" | "RESCHEDULED";
  coachName: string | null;
  coachNote: string | null;
  exercises: ClientLoggerExercise[];
  existingWorkoutLogId: string | null;
  existingSetLogs: ExistingSetLog[];
  existingClientNotes: string;
  existingDurationMin: number | null;
}) {
  const router = useRouter();
  const [workoutLogId, setWorkoutLogId] = useState<string | null>(existingWorkoutLogId);
  const [state, setState] = useState<Record<string, SetEntry[]>>(() => {
    const init: Record<string, SetEntry[]> = {};
    for (const ex of exercises) {
      const exLogs = existingSetLogs.filter(
        (s) => s.assignedWorkoutExerciseId === ex.aweId || s.exerciseId === ex.exerciseId
      );
      init[ex.aweId] = ex.prescribedSets.map((ps) => {
        const existing = exLogs.find((s) => s.setNumber === ps.setNumber);
        return initSetEntry(ps, ex.lastSets, existing);
      });
    }
    return init;
  });
  const [notes, setNotes] = useState(existingClientNotes);
  const [completing, startComplete] = useTransition();
  const [finished, setFinished] = useState(status === "LOGGED");

  // ── Elapsed timer ────────────────────────────────────────────────────────
  const [startTime] = useState(() => Date.now());
  const [now, setNow] = useState(() => Date.now());
  const [frozenElapsedSec, setFrozenElapsedSec] = useState<number | null>(
    status === "LOGGED" ? (existingDurationMin ?? 0) * 60 : null
  );
  useEffect(() => {
    if (finished) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [finished]);
  const elapsedSec = frozenElapsedSec ?? Math.floor((now - startTime) / 1000);

  // ── Rest timer per exercise ──────────────────────────────────────────────
  const [restUntil, setRestUntil] = useState<Record<string, number>>({});
  const restTickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => {
    if (Object.keys(restUntil).length === 0) return;
    restTickRef.current = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      if (restTickRef.current) clearInterval(restTickRef.current);
    };
  }, [restUntil]);

  // ── Derived totals ───────────────────────────────────────────────────────
  let totalSets = 0;
  let doneSets = 0;
  let totalVolume = 0;
  let lastWeekVolume = 0;
  let projectedVolume = 0;
  for (const ex of exercises) {
    const sets = state[ex.aweId];
    sets.forEach((entry, idx) => {
      totalSets++;
      const w = parseFloat(entry.weight) || 0;
      const r = parseInt(entry.reps, 10) || 0;
      projectedVolume += w * r;
      if (entry.completed) {
        doneSets++;
        totalVolume += w * r;
      }
      const last = lastForSet(ex.lastSets, idx + 1);
      if (last) lastWeekVolume += (last.weight ?? 0) * (last.reps ?? 0);
    });
  }
  const notAllDone = totalSets === 0 || doneSets < totalSets;
  const deltaPct = lastWeekVolume ? Math.round(((projectedVolume - lastWeekVolume) / lastWeekVolume) * 100) : 0;

  function updateSet(aweId: string, idx: number, patch: Partial<SetEntry>) {
    setState((prev) => {
      const sets = [...prev[aweId]];
      sets[idx] = { ...sets[idx], ...patch };
      return { ...prev, [aweId]: sets };
    });
  }

  async function toggleComplete(aweId: string, exerciseId: string, idx: number, restSeconds: number | null) {
    const entry = state[aweId][idx];
    if (entry.saving) return;
    updateSet(aweId, idx, { saving: true });
    try {
      const result = await logClientSet({
        workoutLogId: workoutLogId ?? undefined,
        assignedWorkoutId,
        exerciseId,
        assignedWorkoutExerciseId: aweId,
        setLogId: entry.setLogId ?? undefined,
        setNumber: idx + 1,
        weight: entry.weight ? parseFloat(entry.weight) : null,
        reps: entry.reps ? parseInt(entry.reps, 10) : null,
        rpe: null,
        completed: !entry.completed,
      });
      if (!workoutLogId) setWorkoutLogId(result.workoutLogId);
      updateSet(aweId, idx, { saving: false, completed: !entry.completed, setLogId: result.setLogId });

      setRestUntil((prev) => {
        const next = { ...prev };
        if (!entry.completed && restSeconds) {
          next[aweId] = Date.now() + restSeconds * 1000;
        } else {
          delete next[aweId];
        }
        return next;
      });
    } catch {
      toast.error("Couldn't save that set");
      updateSet(aweId, idx, { saving: false });
    }
  }

  async function handleFinish() {
    if (!workoutLogId || notAllDone) return;
    startComplete(async () => {
      try {
        await completeClientSession({
          workoutLogId,
          assignedWorkoutId,
          clientNotes: notes || undefined,
          durationMin: Math.max(1, Math.round(elapsedSec / 60)),
        });
        setFrozenElapsedSec(elapsedSec);
        setFinished(true);
      } catch {
        toast.error("Failed to finish workout");
      }
    });
  }

  // ═══════════════════════════════════════════════════════════════════════
  // Session complete view
  // ═══════════════════════════════════════════════════════════════════════
  if (finished) {
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
          {formatClock(elapsedSec)} elapsed
        </p>

        <div className="flex mb-9 rounded-[18px] overflow-hidden" style={{ border: "1px solid var(--line)" }}>
          {[
            { label: "Sets", value: String(doneSets) },
            { label: "Lbs lifted", value: totalVolume.toLocaleString() },
            { label: "Duration", value: formatClock(elapsedSec) },
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

        <Button variant="outline" onClick={() => router.push("/today")}>
          Back to Today
        </Button>
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════════════════
  // Active workout view
  // ═══════════════════════════════════════════════════════════════════════
  return (
    <div className="pb-24">
      <div className="px-4 pt-4 max-w-lg mx-auto">
        {/* Top bar */}
        <div className="flex items-center justify-between mb-4">
          <Link
            href="/today"
            className="w-8 h-8 rounded-lg flex items-center justify-center"
            style={{ border: "1px solid var(--line)" }}
          >
            <ArrowLeft className="w-4 h-4" style={{ color: "var(--ink)" }} />
          </Link>
          <div
            className="text-xs font-semibold tabular-nums px-2.5 py-1 rounded-full"
            style={{ border: "1px solid var(--line)", color: "var(--ink)" }}
          >
            {formatClock(elapsedSec)}
          </div>
        </div>

        {/* Header */}
        <div className="mb-4">
          <p className="text-xs font-semibold uppercase tracking-wider mb-1" style={{ color: "var(--blue)" }}>
            {assignmentName} · Week {weekNum}
          </p>
          <h1 className="font-display text-3xl" style={{ color: "var(--ink)" }}>
            {workoutName}
          </h1>
        </div>

        {/* Progress bar */}
        <div className="mb-4">
          <div className="h-1 rounded-full overflow-hidden" style={{ background: "var(--muted)" }}>
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{ background: "var(--blue)", width: `${totalSets ? Math.round((doneSets / totalSets) * 100) : 0}%` }}
            />
          </div>
          <p className="text-xs font-medium mt-1.5" style={{ color: "var(--ink-mute)" }}>
            {doneSets} of {totalSets} sets complete
          </p>
        </div>

        {/* Volume stat row */}
        <div className="flex rounded-[18px] mb-4" style={{ border: "1px solid var(--line)" }}>
          <div className="flex-1 px-3.5 py-2.5" style={{ borderRight: "1px solid var(--line)" }}>
            <p className="text-[10px] uppercase tracking-wide mb-1" style={{ color: "var(--ink-mute)" }}>
              Last week
            </p>
            <p className="font-display text-lg tabular-nums" style={{ color: "var(--ink)" }}>
              {lastWeekVolume.toLocaleString()} lbs
            </p>
          </div>
          <div className="flex-1 px-3.5 py-2.5">
            <p className="text-[10px] uppercase tracking-wide mb-1" style={{ color: "var(--ink-mute)" }}>
              This week
            </p>
            <div className="flex items-baseline gap-1.5">
              <p className="font-display text-lg tabular-nums" style={{ color: "var(--ink)" }}>
                {projectedVolume.toLocaleString()} lbs
              </p>
              {lastWeekVolume > 0 && (
                <Badge variant={deltaPct >= 0 ? "default" : "secondary"} className="text-[10px] h-4 px-1.5">
                  {deltaPct >= 0 ? "+" : ""}
                  {deltaPct}%
                </Badge>
              )}
            </div>
          </div>
        </div>

        {/* Coach note */}
        {coachNote && (
          <div
            className="flex gap-2.5 rounded-[18px] px-3.5 py-3 mb-5"
            style={{ background: "rgba(43,107,255,0.06)" }}
          >
            <div
              className="w-7 h-7 rounded-full flex items-center justify-center shrink-0 text-xs font-semibold text-white"
              style={{ background: "var(--blue)" }}
            >
              {(coachName ?? "C").charAt(0).toUpperCase()}
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide mb-0.5" style={{ color: "var(--blue-deep)" }}>
                Coach {coachName ?? ""}
              </p>
              <p className="text-sm leading-snug" style={{ color: "var(--ink)" }}>
                {coachNote}
              </p>
            </div>
          </div>
        )}

        {/* Exercises */}
        <div className="flex flex-col gap-4">
          {exercises.map((ex, exIdx) => {
            const sets = state[ex.aweId];
            const restEnds = restUntil[ex.aweId];
            const restRemaining = restEnds ? Math.max(0, Math.round((restEnds - now) / 1000)) : 0;
            const restActive = restRemaining > 0;

            return (
              <div
                key={ex.aweId}
                className="rounded-[18px] p-4"
                style={{ background: "var(--card)", border: "1px solid var(--line)" }}
              >
                <div className="flex items-center justify-between gap-2 mb-0.5">
                  <div className="flex items-center gap-2 min-w-0">
                    <div
                      className="w-5 h-5 rounded-md flex items-center justify-center text-[11px] font-bold text-white shrink-0"
                      style={{ background: "var(--blue)" }}
                    >
                      {exIdx + 1}
                    </div>
                    <span className="text-sm font-semibold truncate" style={{ color: "var(--ink)" }}>
                      {ex.name}
                    </span>
                  </div>
                  <Badge variant="outline" className="text-[10px] shrink-0">
                    {ex.equipment}
                  </Badge>
                </div>

                <div className="grid grid-cols-[22px_1fr_1fr_1fr_28px] gap-1.5 pt-3 pb-1.5 text-[10px] font-semibold uppercase tracking-wide" style={{ color: "var(--ink-mute)" }}>
                  <span>Set</span>
                  <span>Prev</span>
                  <span className="text-center">Weight</span>
                  <span className="text-center">Reps</span>
                  <span />
                </div>

                {sets.map((entry, idx) => {
                  const ps = ex.prescribedSets[idx];
                  const last = lastForSet(ex.lastSets, idx + 1);
                  const prevLabel = last?.weight != null && last?.reps != null ? `${last.weight}×${last.reps}` : "—";
                  return (
                    <div
                      key={idx}
                      className="grid grid-cols-[22px_1fr_1fr_1fr_28px] gap-1.5 items-center py-2"
                      style={{ borderTop: "1px solid var(--line)" }}
                    >
                      <span className="text-sm font-bold tabular-nums" style={{ color: "var(--ink)" }}>
                        {idx + 1}
                      </span>
                      <span className="text-[11px] tabular-nums truncate" style={{ color: "var(--ink-mute)" }}>
                        {prevLabel}
                      </span>
                      <Input
                        value={entry.weight}
                        onChange={(e) => updateSet(ex.aweId, idx, { weight: e.target.value })}
                        disabled={entry.completed}
                        type="number"
                        inputMode="decimal"
                        placeholder="lb"
                        className="h-9 text-center text-sm px-1"
                        style={{ fontSize: "16px" }}
                      />
                      <Input
                        value={entry.reps}
                        onChange={(e) => updateSet(ex.aweId, idx, { reps: e.target.value })}
                        disabled={entry.completed}
                        type="number"
                        inputMode="numeric"
                        placeholder={repRange(ps)}
                        className="h-9 text-center text-sm px-1"
                        style={{ fontSize: "16px" }}
                      />
                      <button
                        type="button"
                        onClick={() => toggleComplete(ex.aweId, ex.exerciseId, idx, ps?.restSeconds ?? null)}
                        disabled={entry.saving}
                        className="h-7 w-7 rounded-md flex items-center justify-center transition-colors justify-self-center"
                        style={
                          entry.completed
                            ? { background: "var(--blue)" }
                            : { border: "1px solid var(--line)" }
                        }
                      >
                        {entry.saving ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" style={{ color: entry.completed ? "#fff" : "var(--ink-mute)" }} />
                        ) : entry.completed ? (
                          <Check className="w-3.5 h-3.5 text-white" strokeWidth={2.5} />
                        ) : null}
                      </button>
                    </div>
                  );
                })}

                {restActive && (
                  <div
                    className="mt-2.5 flex items-center justify-between rounded-lg px-3 py-2"
                    style={{ background: "rgba(43,107,255,0.08)" }}
                  >
                    <span className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: "var(--blue-deep)" }}>
                      Resting
                    </span>
                    <span className="text-sm font-bold tabular-nums" style={{ color: "var(--blue-deep)" }}>
                      {formatClock(restRemaining)}
                    </span>
                  </div>
                )}
              </div>
            );
          })}

          <div>
            <label className="text-xs font-semibold uppercase tracking-wide mb-1.5 block" style={{ color: "var(--ink-mute)" }}>
              Session notes
            </label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="How did it feel? Anything to flag for your coach…"
              rows={3}
              className="text-sm resize-none"
            />
          </div>
        </div>
      </div>

      {/* Sticky footer */}
      <div
        className="fixed bottom-14 inset-x-0 flex items-center justify-between px-4 py-3 max-w-lg mx-auto"
        style={{ background: "var(--background)", borderTop: "1px solid var(--line)" }}
      >
        <span className="text-xs font-medium" style={{ color: "var(--ink-mute)" }}>
          {doneSets} of {totalSets} sets complete
        </span>
        <Button disabled={completing || notAllDone} onClick={handleFinish}>
          {completing ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : null}
          Finish workout
        </Button>
      </div>
    </div>
  );
}
