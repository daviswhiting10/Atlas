"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { ArrowLeft, ChevronDown, ChevronRight, Save, Loader2, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { SetsTable, type SetDraft } from "@/app/(dashboard)/programs/_components/SetsTable";
import { ExercisePicker, type ExerciseOption } from "@/app/(dashboard)/programs/_components/ExercisePicker";

// ─── Types ────────────────────────────────────────────────────────────────────

type SetShape = {
  setNumber: number;
  weight: number | null;
  repMin: number;
  repMax: number;
  rpe: number | null;
  restSeconds: number | null;
  notes: string;
};

type AssignedExercise = {
  id: string;
  exerciseId: string;
  order: number;
  prescribedSets: SetShape[];
  notes: string | null;
  exercise: { id: string; name: string; movementPattern: string; equipment: string };
};

type AssignedWorkout = {
  id: string;
  name: string;
  scheduledDate: string;
  loggedBy: "TRAINER" | "CLIENT";
  status: "PLANNED" | "LOGGED" | "SKIPPED" | "RESCHEDULED";
  order: number;
  notes: string | null;
  exercises: AssignedExercise[];
};

type Assignment = {
  id: string;
  name: string;
  startDate: string;
  status: string;
  client: { id: string; fullName: string };
  sourceProgram: { id: string; name: string };
  assignedWorkouts: AssignedWorkout[];
};

// ─── Local state for workout editing ─────────────────────────────────────────

type ExerciseDraft = {
  _key: string;
  id?: string;
  exerciseId: string;
  exerciseName: string;
  order: number;
  prescribedSets: SetDraft[];
  notes: string;
};

let _k = 0;
function k() { return `k${++_k}`; }

function toDraft(ex: AssignedExercise): ExerciseDraft {
  return {
    _key: k(),
    id: ex.id,
    exerciseId: ex.exerciseId,
    exerciseName: ex.exercise.name,
    order: ex.order,
    prescribedSets: ex.prescribedSets.map((s) => ({ isBodyweight: false, ...s })),
    notes: ex.notes ?? "",
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const STATUS_COLORS: Record<string, string> = {
  PLANNED: "bg-zinc-100 text-zinc-600",
  LOGGED: "bg-emerald-50 text-emerald-700",
  SKIPPED: "bg-amber-50 text-amber-700",
  RESCHEDULED: "bg-blue-50 text-blue-700",
};

function groupByWeek(workouts: AssignedWorkout[], startDate: string) {
  const start = new Date(startDate);
  const weeks: Record<number, AssignedWorkout[]> = {};
  for (const w of workouts) {
    const d = new Date(w.scheduledDate);
    const diffDays = Math.floor((d.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
    const week = Math.floor(diffDays / 7) + 1;
    if (!weeks[week]) weeks[week] = [];
    weeks[week].push(w);
  }
  return weeks;
}

// ─── Workout editor (inline) ──────────────────────────────────────────────────

function WorkoutEditor({
  workout,
  workspaceAssignmentId,
  onSaved,
}: {
  workout: AssignedWorkout;
  workspaceAssignmentId: string;
  onSaved: (updated: AssignedWorkout) => void;
}) {
  const [exercises, setExercises] = useState<ExerciseDraft[]>(
    workout.exercises.map(toDraft)
  );
  const [loggedBy, setLoggedBy] = useState<"TRAINER" | "CLIENT">(workout.loggedBy);
  const [scheduledDate, setScheduledDate] = useState(
    workout.scheduledDate.split("T")[0]
  );
  const [saving, setSaving] = useState(false);

  const updateEx = useCallback(
    (eKey: string, fn: (e: ExerciseDraft) => ExerciseDraft) =>
      setExercises((prev) => prev.map((e) => (e._key === eKey ? fn(e) : e))),
    []
  );

  function addExercise(ex: ExerciseOption) {
    setExercises((prev) => [
      ...prev,
      {
        _key: k(),
        exerciseId: ex.id,
        exerciseName: ex.name,
        order: prev.length + 1,
        prescribedSets: [
          { setNumber: 1, weight: null, isBodyweight: false, repMin: 8, repMax: 12, rpe: null, restSeconds: null, notes: "" },
          { setNumber: 2, weight: null, isBodyweight: false, repMin: 8, repMax: 12, rpe: null, restSeconds: null, notes: "" },
          { setNumber: 3, weight: null, isBodyweight: false, repMin: 8, repMax: 12, rpe: null, restSeconds: null, notes: "" },
        ],
        notes: "",
      },
    ]);
  }

  function removeExercise(eKey: string) {
    setExercises((prev) =>
      prev.filter((e) => e._key !== eKey).map((e, i) => ({ ...e, order: i + 1 }))
    );
  }

  async function save() {
    setSaving(true);
    try {
      const res = await fetch(
        `/api/assignments/${workspaceAssignmentId}/workouts/${workout.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            loggedBy,
            scheduledDate,
            exercises: exercises.map((e) => ({
              id: e.id,
              exerciseId: e.exerciseId,
              order: e.order,
              prescribedSets: e.prescribedSets,
              notes: e.notes || null,
            })),
          }),
        }
      );

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        const msg =
          typeof err?.error === "string"
            ? err.error
            : err?.error?.formErrors?.[0] ?? "Save failed";
        toast.error(msg);
        return;
      }

      const updated = await res.json();
      toast.success("Workout saved");
      onSaved(updated);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mt-3 space-y-3">
      {/* Date + logged-by row */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Date:</span>
          <input
            type="date"
            value={scheduledDate}
            onChange={(e) => setScheduledDate(e.target.value)}
            className="text-xs h-7 rounded-md border border-input px-2 bg-background"
          />
        </div>
      {/* In-person / At-home toggle */}
        <span className="text-xs text-muted-foreground">Logged by:</span>
        <button
          type="button"
          onClick={() => setLoggedBy(loggedBy === "TRAINER" ? "CLIENT" : "TRAINER")}
          className={cn(
            "text-xs px-2.5 py-1 rounded-full border font-medium transition-colors",
            loggedBy === "TRAINER"
              ? "bg-primary text-primary-foreground border-primary"
              : "bg-orange-50 text-orange-700 border-orange-300"
          )}
        >
          {loggedBy === "TRAINER" ? "In-person (I log)" : "At-home (client logs)"}
        </button>
      </div>

      {/* Exercises */}
      {exercises.map((ex) => (
        <div key={ex._key} className="border rounded p-3 bg-background">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium">{ex.order}. {ex.exerciseName}</span>
            <button
              type="button"
              onClick={() => removeExercise(ex._key)}
              className="text-muted-foreground hover:text-destructive"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
          <SetsTable
            sets={ex.prescribedSets}
            onChange={(sets) => updateEx(ex._key, (e) => ({ ...e, prescribedSets: sets }))}
          />
        </div>
      ))}

      <ExercisePicker onSelect={addExercise} placeholder="+ Add exercise..." />

      <Button size="sm" onClick={save} disabled={saving} className="w-full">
        {saving ? (
          <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />Saving...</>
        ) : (
          <><Save className="w-3.5 h-3.5 mr-1.5" />Save workout</>
        )}
      </Button>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function AssignedProgramPage() {
  const { id: clientId, assignmentId } = useParams<{ id: string; assignmentId: string }>();
  const [assignment, setAssignment] = useState<Assignment | null>(null);
  const [openWorkoutId, setOpenWorkoutId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/assignments/${assignmentId}`)
      .then((r) => r.json())
      .then((data) => {
        if (data && data.id) setAssignment(data);
      })
      .finally(() => setLoading(false));
  }, [assignmentId]);

  function handleWorkoutSaved(updated: AssignedWorkout) {
    setAssignment((prev) =>
      prev
        ? {
            ...prev,
            assignedWorkouts: prev.assignedWorkouts.map((w) =>
              w.id === updated.id ? { ...w, ...updated } : w
            ),
          }
        : prev
    );
  }

  if (loading) {
    return (
      <div className="p-8 max-w-4xl">
        <div className="h-8 w-48 bg-muted rounded animate-pulse mb-4" />
        <div className="space-y-2">
          {[...Array(4)].map((_, i) => <div key={i} className="h-16 bg-muted rounded animate-pulse" />)}
        </div>
      </div>
    );
  }

  if (!assignment) {
    return (
      <div className="p-8">
        <p className="text-muted-foreground">Assignment not found.</p>
        <Link href={`/clients/${clientId}`} className={cn(buttonVariants({ variant: "link" }), "p-0 mt-2 block")}>
          Back to client
        </Link>
      </div>
    );
  }

  const weekGroups = groupByWeek(assignment.assignedWorkouts, assignment.startDate);
  const weeks = Object.keys(weekGroups).map(Number).sort((a, b) => a - b);

  return (
    <div className="p-8 max-w-4xl">
      <Link
        href={`/clients/${clientId}`}
        className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "mb-4 -ml-2")}
      >
        <ArrowLeft className="w-4 h-4 mr-1" />
        {assignment.client.fullName}
      </Link>

      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{assignment.name}</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Started {new Date(assignment.startDate).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
            {" · "}
            <Link href={`/programs/${assignment.sourceProgram.id}`} className="hover:underline">
              {assignment.sourceProgram.name}
            </Link>
          </p>
        </div>
        <Badge
          variant="outline"
          className={assignment.status === "ACTIVE" ? "border-emerald-200 text-emerald-700" : ""}
        >
          {assignment.status}
        </Badge>
      </div>

      {/* Week-by-week workout list */}
      {weeks.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="py-12 text-center text-muted-foreground text-sm">
            No workouts scheduled.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {weeks.map((weekNum) => (
            <div key={weekNum}>
              <h2 className="text-sm font-semibold text-muted-foreground mb-2 uppercase tracking-wide">
                Week {weekNum}
              </h2>
              <div className="space-y-2">
                {weekGroups[weekNum].map((workout) => {
                  const isOpen = openWorkoutId === workout.id;
                  return (
                    <Card
                      key={workout.id}
                      className={cn("transition-colors", isOpen && "border-primary/40")}
                    >
                      <CardContent className="py-3 px-4">
                        <div className="flex items-center gap-3">
                          <button
                            type="button"
                            className="flex-1 flex items-center gap-3 text-left min-w-0"
                            onClick={() =>
                              setOpenWorkoutId(isOpen ? null : workout.id)
                            }
                          >
                            {isOpen ? (
                              <ChevronDown className="w-4 h-4 shrink-0 text-muted-foreground" />
                            ) : (
                              <ChevronRight className="w-4 h-4 shrink-0 text-muted-foreground" />
                            )}
                            <div className="min-w-0">
                              <p className="text-sm font-medium truncate">{workout.name}</p>
                              <p className="text-xs text-muted-foreground">
                                {new Date(workout.scheduledDate).toLocaleDateString("en-US", {
                                  weekday: "short", month: "short", day: "numeric",
                                })}
                                {" · "}
                                {workout.exercises.length} exercise{workout.exercises.length !== 1 ? "s" : ""}
                              </p>
                            </div>
                          </button>
                          <div className="flex items-center gap-2 shrink-0">
                            <span
                              className={cn(
                                "text-xs px-2 py-0.5 rounded-full font-medium",
                                workout.loggedBy === "TRAINER"
                                  ? "bg-primary/10 text-primary"
                                  : "bg-orange-50 text-orange-700"
                              )}
                            >
                              {workout.loggedBy === "TRAINER" ? "In-person" : "At-home"}
                            </span>
                            <Badge
                              variant="outline"
                              className={cn("text-xs", STATUS_COLORS[workout.status])}
                            >
                              {workout.status}
                            </Badge>
                          </div>
                        </div>

                        {isOpen && (
                          <WorkoutEditor
                            workout={workout}
                            workspaceAssignmentId={assignmentId}
                            onSaved={handleWorkoutSaved}
                          />
                        )}
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
