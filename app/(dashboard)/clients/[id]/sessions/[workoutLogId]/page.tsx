"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Save, Link2, Link2Off, ChevronDown } from "lucide-react";
import { toast } from "sonner";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

// ── Types ──────────────────────────────────────────────────────────────────────

type SetLog = {
  id: string;
  setNumber: number;
  weight: number | null;
  reps: number | null;
  rpe: number | null;
  completed: boolean;
  exercise: { id: string; name: string } | null;
};

type SessionDetail = {
  id: string;
  date: string;
  durationMin: number | null;
  rpeAvg: number | null;
  clientNotes: string | null;
  client: { id: string; fullName: string };
  assignedWorkout: {
    id: string;
    name: string;
    scheduledDate: string;
    programAssignment: { id: string; name: string; startDate: string };
  } | null;
  sets: SetLog[];
};

type WorkoutSlot = {
  assignmentId: string;
  assignmentName: string;
  workoutId: string;
  workoutName: string;
  scheduledDate: string;
  weekNumber: number;
  status: "PLANNED" | "LOGGED" | "SKIPPED" | "RESCHEDULED";
  logId: string | null;
};

// ── Helpers ────────────────────────────────────────────────────────────────────

type ExerciseGroup = {
  exerciseId: string;
  exerciseName: string;
  sets: SetLog[];
};

function groupByExercise(sets: SetLog[]): ExerciseGroup[] {
  const order: string[] = [];
  const map = new Map<string, ExerciseGroup>();
  for (const s of sets) {
    const key = s.exercise?.id ?? "__unknown__";
    if (!map.has(key)) {
      order.push(key);
      map.set(key, { exerciseId: key, exerciseName: s.exercise?.name ?? "Unknown exercise", sets: [] });
    }
    map.get(key)!.sets.push(s);
  }
  return order.map((k) => map.get(k)!);
}

function computeWeek(startDate: string, scheduledDate: string): number {
  const diff = new Date(scheduledDate).getTime() - new Date(startDate).getTime();
  return Math.max(1, Math.floor(diff / (7 * 24 * 60 * 60 * 1000)) + 1);
}

function slotLabel(slot: WorkoutSlot): string {
  return `Week ${slot.weekNumber} — ${slot.workoutName}`;
}

// ── Slot Picker Dialog ─────────────────────────────────────────────────────────

function SlotPickerDialog({
  open,
  onClose,
  clientId,
  currentLogId,
  currentSlotId,
  onPick,
}: {
  open: boolean;
  onClose: () => void;
  clientId: string;
  currentLogId: string;
  currentSlotId: string | null;
  onPick: (slot: WorkoutSlot | null) => void;
}) {
  const [slots, setSlots] = useState<WorkoutSlot[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    fetch(`/api/clients/${clientId}/workout-slots`)
      .then((r) => r.json())
      .then((d) => setSlots(Array.isArray(d) ? d : []))
      .catch(() => setSlots([]))
      .finally(() => setLoading(false));
  }, [open, clientId]);

  // Group slots by assignment
  const byAssignment = slots.reduce<Record<string, WorkoutSlot[]>>((acc, s) => {
    if (!acc[s.assignmentId]) acc[s.assignmentId] = [];
    acc[s.assignmentId].push(s);
    return acc;
  }, {});

  const assignmentIds = Array.from(new Set(slots.map((s) => s.assignmentId)));

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-lg max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="font-display text-xl">Assign to program slot</DialogTitle>
          <p className="text-sm text-muted-foreground mt-1">
            Pick the day/week this session counts toward.
          </p>
        </DialogHeader>

        <div className="overflow-y-auto flex-1 -mx-1 px-1 space-y-4 mt-2">
          {loading && (
            <p className="text-sm text-muted-foreground text-center py-6">Loading…</p>
          )}
          {!loading && assignmentIds.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-6">
              No active program assignments found.
            </p>
          )}

          {!loading && assignmentIds.map((aId) => {
            const group = byAssignment[aId];
            const assignmentName = group[0].assignmentName;

            // Group within assignment by week
            const byWeek = group.reduce<Record<number, WorkoutSlot[]>>((acc, s) => {
              if (!acc[s.weekNumber]) acc[s.weekNumber] = [];
              acc[s.weekNumber].push(s);
              return acc;
            }, {});
            const weeks = Array.from(new Set(group.map((s) => s.weekNumber))).sort((a, b) => a - b);

            return (
              <div key={aId}>
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2 px-1">
                  {assignmentName}
                </p>
                <div className="space-y-3">
                  {weeks.map((wk) => (
                    <div key={wk}>
                      <p className="text-xs font-medium text-muted-foreground mb-1 px-1">
                        Week {wk}
                      </p>
                      <div className="space-y-1">
                        {byWeek[wk].map((slot) => {
                          const isCurrent = slot.workoutId === currentSlotId;
                          // Taken by a different session
                          const isTaken = slot.logId !== null && slot.logId !== currentLogId;
                          const date = new Date(slot.scheduledDate.slice(0, 10) + "T12:00:00");
                          const dateStr = date.toLocaleDateString("en-US", {
                            weekday: "short", month: "short", day: "numeric",
                          });

                          return (
                            <button
                              key={slot.workoutId}
                              type="button"
                              disabled={isTaken}
                              onClick={() => {
                                onPick(isCurrent ? null : slot);
                                onClose();
                              }}
                              className={cn(
                                "w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-colors",
                                isTaken
                                  ? "opacity-40 cursor-not-allowed bg-muted/30"
                                  : isCurrent
                                  ? "bg-primary/10 border border-primary/30"
                                  : "hover:bg-muted/60"
                              )}
                            >
                              <div className="flex-1 min-w-0">
                                <p
                                  className="font-body text-sm font-medium truncate"
                                  style={{ color: "var(--ink)" }}
                                >
                                  {slot.workoutName}
                                </p>
                                <p className="font-body text-xs" style={{ color: "var(--ink-mute)" }}>
                                  {dateStr}
                                </p>
                              </div>
                              <div className="shrink-0 flex items-center gap-1.5">
                                {isTaken && (
                                  <span className="text-xs text-muted-foreground">Taken</span>
                                )}
                                {isCurrent && (
                                  <span
                                    className="text-xs font-medium px-2 py-0.5 rounded-full"
                                    style={{
                                      background: "rgba(43,107,255,0.1)",
                                      color: "var(--blue)",
                                    }}
                                  >
                                    Current
                                  </span>
                                )}
                                {!isTaken && !isCurrent && slot.status === "PLANNED" && (
                                  <span className="text-xs text-muted-foreground">Available</span>
                                )}
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}

          {/* Detach option — only shown when currently assigned */}
          {currentSlotId && !loading && (
            <div className="pt-2 border-t">
              <button
                type="button"
                onClick={() => { onPick(null); onClose(); }}
                className="w-full flex items-center gap-2 px-3 py-2.5 rounded-xl text-left hover:bg-muted/60 transition-colors"
              >
                <Link2Off className="w-4 h-4 text-muted-foreground shrink-0" />
                <span className="font-body text-sm text-muted-foreground">
                  Remove program assignment
                </span>
              </button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default function SessionDetailPage() {
  const { id: clientId, workoutLogId } = useParams<{ id: string; workoutLogId: string }>();
  const [session, setSession] = useState<SessionDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [dateValue, setDateValue] = useState("");
  const [saving, setSaving] = useState(false);
  const [assigning, setAssigning] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);

  useEffect(() => {
    fetch(`/api/sessions/${workoutLogId}`)
      .then((r) => r.json())
      .then((data: SessionDetail) => {
        setSession(data);
        setDateValue(data.date.slice(0, 10));
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [workoutLogId]);

  async function saveDate() {
    if (!session) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/sessions/${workoutLogId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date: dateValue }),
      });
      if (!res.ok) throw new Error("Save failed");
      setSession((prev) => prev ? { ...prev, date: dateValue } : prev);
      toast.success("Session date updated");
    } catch {
      toast.error("Could not update date");
    } finally {
      setSaving(false);
    }
  }

  async function assignSlot(slot: WorkoutSlot | null) {
    if (!session) return;
    setAssigning(true);
    try {
      const res = await fetch(`/api/sessions/${workoutLogId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assignedWorkoutId: slot ? slot.workoutId : null }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed");

      if (slot) {
        // Build a minimal assignedWorkout object to update local state
        const weekNum = slot.weekNumber;
        setSession((prev) =>
          prev
            ? {
                ...prev,
                assignedWorkout: {
                  id: slot.workoutId,
                  name: slot.workoutName,
                  scheduledDate: slot.scheduledDate,
                  programAssignment: {
                    id: slot.assignmentId,
                    name: slot.assignmentName,
                    startDate: new Date(
                      new Date(slot.scheduledDate).getTime() -
                        (weekNum - 1) * 7 * 24 * 60 * 60 * 1000
                    ).toISOString(),
                  },
                },
              }
            : prev
        );
        toast.success(`Assigned to ${slot.assignmentName} — Week ${slot.weekNumber}`);
      } else {
        setSession((prev) => prev ? { ...prev, assignedWorkout: null } : prev);
        toast.success("Program assignment removed");
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to assign";
      toast.error(msg);
    } finally {
      setAssigning(false);
    }
  }

  if (loading) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-8">
        <div className="h-6 w-32 bg-muted rounded animate-pulse mb-6" />
        <div className="space-y-3">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-20 bg-muted rounded-xl animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-16 text-center text-muted-foreground">
        <p>Session not found.</p>
        <Link href={`/clients/${clientId}`} className={cn(buttonVariants({ variant: "outline" }), "mt-4")}>
          Back to client
        </Link>
      </div>
    );
  }

  const groups = groupByExercise(session.sets);
  const dateChanged = dateValue !== session.date.slice(0, 10);

  // Compute week label for current assignment
  const weekLabel = session.assignedWorkout
    ? `Week ${computeWeek(
        session.assignedWorkout.programAssignment.startDate,
        session.assignedWorkout.scheduledDate
      )}`
    : null;

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 space-y-5">
      {/* Back */}
      <Link
        href={`/clients/${clientId}`}
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="w-3.5 h-3.5" />
        {session.client.fullName}
      </Link>

      {/* Header card */}
      <div className="rounded-2xl border bg-card px-5 py-4 space-y-3">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium">
              {session.assignedWorkout?.programAssignment.name ?? "Ad-hoc session"}
            </p>
            <p className="text-lg font-semibold mt-0.5">
              {session.assignedWorkout?.name ?? "Session"}
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {session.rpeAvg != null && (
              <span className="text-xs font-medium px-2 py-1 bg-muted rounded-full">
                RPE {session.rpeAvg.toFixed(1)}
              </span>
            )}
            {session.durationMin != null && (
              <span className="text-xs font-medium px-2 py-1 bg-muted rounded-full">
                {session.durationMin}m
              </span>
            )}
          </div>
        </div>

        {/* Editable date */}
        <div className="flex items-center gap-3">
          <label className="text-xs text-muted-foreground w-24 shrink-0">Session date</label>
          <input
            type="date"
            value={dateValue}
            onChange={(e) => setDateValue(e.target.value)}
            className="flex-1 text-sm border rounded-lg px-3 py-1.5 bg-background focus:outline-none focus:ring-2 focus:ring-ring"
          />
          {dateChanged && (
            <Button size="sm" className="h-8 text-xs" onClick={saveDate} disabled={saving}>
              <Save className="w-3.5 h-3.5 mr-1" />
              {saving ? "Saving…" : "Save"}
            </Button>
          )}
        </div>

        {/* Program slot assignment */}
        <div className="flex items-center gap-3">
          <label className="text-xs text-muted-foreground w-24 shrink-0">Program slot</label>
          <div className="flex-1 min-w-0">
            {session.assignedWorkout ? (
              <p className="text-sm font-medium truncate" style={{ color: "var(--ink)" }}>
                {session.assignedWorkout.programAssignment.name}
                <span className="font-normal text-muted-foreground">
                  {" "}· {weekLabel} · {session.assignedWorkout.name}
                </span>
              </p>
            ) : (
              <p className="text-sm text-muted-foreground italic">Unassigned</p>
            )}
          </div>
          <Button
            variant="outline"
            size="sm"
            className="h-8 text-xs shrink-0 gap-1.5"
            onClick={() => setPickerOpen(true)}
            disabled={assigning}
          >
            {assigning ? (
              "Saving…"
            ) : (
              <>
                <Link2 className="w-3.5 h-3.5" />
                {session.assignedWorkout ? "Change" : "Assign"}
              </>
            )}
            <ChevronDown className="w-3 h-3 opacity-50" />
          </Button>
        </div>

        {session.clientNotes && (
          <p className="text-sm text-muted-foreground border-t pt-3">{session.clientNotes}</p>
        )}
      </div>

      {/* Sets by exercise */}
      {groups.length === 0 ? (
        <div className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
          No sets logged for this session.
        </div>
      ) : (
        <div className="space-y-3">
          {groups.map((g) => (
            <div key={g.exerciseId} className="rounded-xl border bg-card overflow-hidden">
              <div className="px-4 py-2.5 bg-muted/40 border-b">
                <p className="text-sm font-semibold">{g.exerciseName}</p>
              </div>
              <div className="divide-y">
                <div className="grid grid-cols-4 px-4 py-1.5 text-xs text-muted-foreground font-medium">
                  <span>Set</span>
                  <span className="text-right">Weight</span>
                  <span className="text-right">Reps</span>
                  <span className="text-right">RPE</span>
                </div>
                {g.sets.map((s) => (
                  <div
                    key={s.id}
                    className={cn(
                      "grid grid-cols-4 px-4 py-2 text-sm",
                      !s.completed && "opacity-40"
                    )}
                  >
                    <span className="text-muted-foreground">{s.setNumber}</span>
                    <span className="text-right font-medium">
                      {s.weight != null ? `${s.weight} lb` : "BW"}
                    </span>
                    <span className="text-right font-medium">
                      {s.reps != null ? s.reps : "—"}
                    </span>
                    <span className="text-right text-muted-foreground">
                      {s.rpe != null ? s.rpe : "—"}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Program link */}
      {session.assignedWorkout && (
        <div className="text-center">
          <Link
            href={`/clients/${clientId}/programs/${session.assignedWorkout.programAssignment.id}`}
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            View program assignment →
          </Link>
        </div>
      )}

      {/* Slot picker */}
      <SlotPickerDialog
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        clientId={clientId}
        currentLogId={workoutLogId}
        currentSlotId={session.assignedWorkout?.id ?? null}
        onPick={assignSlot}
      />
    </div>
  );
}
