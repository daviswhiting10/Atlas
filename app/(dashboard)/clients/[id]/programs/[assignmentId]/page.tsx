"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { ArrowLeft, ChevronDown, ChevronRight, ChevronUp, Save, Loader2, Trash2, RotateCcw } from "lucide-react";
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
  section: string | null;
  prescribedSets: SetShape[];
  notes: string | null;
  exercise: { id: string; name: string; movementPattern?: string; equipment?: string };
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
  section: string | null;
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
    section: ex.section ?? null,
    order: ex.order,
    prescribedSets: ex.prescribedSets.map((s) => ({ isBodyweight: false, ...s })),
    notes: ex.notes ?? "",
  };
}

// ─── Section grouping ─────────────────────────────────────────────────────────

// Standard section order — matches ProgramBuilder's DEFAULT_SECTIONS.
// Trainer-renamed sections fall through to the "any additional named" bucket.
const SECTION_ORDER = ["Warmup", "Main A", "Main B", "Burner"];

/** Human-readable label for a section key. Handles both ProgramBuilder
 *  ("Warmup", "Main A") and any custom names the trainer may have entered. */
function formatSectionLabel(section: string | null): string {
  if (!section) return "General";
  return section; // ProgramBuilder already stores display-ready names
}

type SectionGroup = { section: string | null; label: string; exs: ExerciseDraft[] };

function getSectionGroups(exercises: ExerciseDraft[]): SectionGroup[] {
  const map = new Map<string | null, ExerciseDraft[]>();
  for (const ex of exercises) {
    const key = ex.section;
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(ex);
  }

  const result: SectionGroup[] = [];

  // Standard order first
  for (const sectionKey of SECTION_ORDER) {
    if (map.has(sectionKey)) {
      result.push({ section: sectionKey, label: formatSectionLabel(sectionKey), exs: map.get(sectionKey)! });
      map.delete(sectionKey);
    }
  }

  // Any additional named sections (custom trainer names, or legacy lowercase values)
  Array.from(map.entries()).forEach(([key, exs]) => {
    if (key !== null) {
      result.push({ section: key, label: formatSectionLabel(key), exs });
    }
  });

  // Unsectioned exercises last
  if (map.has(null)) {
    result.push({ section: null, label: "General", exs: map.get(null)! });
  }

  return result;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const STATUS_COLORS: Record<string, string> = {
  PLANNED: "border border-[var(--line)] bg-[var(--muted)] text-[var(--ink-soft)]",
  LOGGED: "border border-green-300 bg-green-50 text-green-700",
  SKIPPED: "border border-amber-300 bg-amber-50 text-amber-700",
  RESCHEDULED: "border border-blue-300 bg-blue-50 text-blue-700",
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

  function addExerciseToSection(ex: ExerciseOption, section: string | null) {
    setExercises((prev) => [
      ...prev,
      {
        _key: k(),
        exerciseId: ex.id,
        exerciseName: ex.name,
        section,
        order: prev.length + 1, // will be recomputed on save
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
    setExercises((prev) => prev.filter((e) => e._key !== eKey));
  }

  function moveExercise(exKey: string, direction: "up" | "down") {
    setExercises((prev) => {
      const ex = prev.find((e) => e._key === exKey);
      if (!ex) return prev;

      // Move within the same section only
      const sectionExs = prev.filter((e) => e.section === ex.section);
      const posInSection = sectionExs.findIndex((e) => e._key === exKey);
      if (direction === "up" && posInSection === 0) return prev;
      if (direction === "down" && posInSection === sectionExs.length - 1) return prev;

      const swapWith =
        direction === "up"
          ? sectionExs[posInSection - 1]
          : sectionExs[posInSection + 1];

      const next = [...prev];
      const idxA = next.findIndex((e) => e._key === exKey);
      const idxB = next.findIndex((e) => e._key === swapWith._key);
      [next[idxA], next[idxB]] = [next[idxB], next[idxA]];
      return next;
    });
  }

  async function save() {
    setSaving(true);
    try {
      // Flatten sections in display order, reassign global order 1..n
      const groups = getSectionGroups(exercises);
      const flatInOrder = groups.flatMap((g) => g.exs);
      const exercisesWithOrder = flatInOrder.map((e, i) => ({ ...e, order: i + 1 }));

      const res = await fetch(
        `/api/assignments/${workspaceAssignmentId}/workouts/${workout.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            loggedBy,
            scheduledDate,
            exercises: exercisesWithOrder.map((e) => ({
              id: e.id,
              exerciseId: e.exerciseId,
              order: e.order,
              section: e.section ?? null,
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

      // Re-init drafts from saved data to pick up generated IDs and confirmed orders
      if (Array.isArray(updated?.exercises)) {
        setExercises(
          (updated.exercises as AssignedExercise[]).map(toDraft)
        );
      }
      onSaved(updated);
    } finally {
      setSaving(false);
    }
  }

  const groups = getSectionGroups(exercises);
  const hasAnySection = exercises.some((e) => e.section !== null);

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
        <span className="text-xs text-muted-foreground">Logged by:</span>
        <button
          type="button"
          onClick={() => setLoggedBy(loggedBy === "TRAINER" ? "CLIENT" : "TRAINER")}
          className={cn(
            "text-xs px-2.5 py-1 rounded-full border font-medium transition-colors",
            loggedBy === "TRAINER"
              ? "bg-[var(--blue)] text-white border-[var(--blue)]"
              : "border-[var(--line)] text-[var(--ink-soft)] bg-[var(--muted)]"
          )}
        >
          {loggedBy === "TRAINER" ? "In-person (I log)" : "At-home (client logs)"}
        </button>
      </div>

      {/* Exercises grouped by section */}
      {hasAnySection ? (
        <div className="space-y-4">
          {groups.map((group) => (
            <div key={group.section ?? "__unsectioned__"}>
              {/* Section header */}
              <div className="flex items-center gap-2 mb-2">
                <span className="font-body text-xs font-medium uppercase tracking-widest" style={{ color: "var(--blue)" }}>
                  {group.label}
                </span>
                <div className="flex-1 h-px" style={{ background: "var(--line)" }} />
                <span className="text-xs text-muted-foreground">{group.exs.length} ex</span>
              </div>

              {/* Exercises in this section */}
              <div className="space-y-2 ml-1">
                {group.exs.map((ex, exIdx) => (
                  <div key={ex._key} className="border rounded p-3 bg-background">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-1.5 min-w-0">
                        {/* Up / down reorder */}
                        <div className="flex flex-col shrink-0">
                          <button
                            type="button"
                            disabled={exIdx === 0}
                            onClick={() => moveExercise(ex._key, "up")}
                            className="text-muted-foreground hover:text-foreground disabled:opacity-20 disabled:cursor-not-allowed leading-none"
                            title="Move up"
                          >
                            <ChevronUp className="w-3 h-3" />
                          </button>
                          <button
                            type="button"
                            disabled={exIdx === group.exs.length - 1}
                            onClick={() => moveExercise(ex._key, "down")}
                            className="text-muted-foreground hover:text-foreground disabled:opacity-20 disabled:cursor-not-allowed leading-none"
                            title="Move down"
                          >
                            <ChevronDown className="w-3 h-3" />
                          </button>
                        </div>
                        <span className="text-sm font-medium truncate">
                          {exIdx + 1}. {ex.exerciseName}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => removeExercise(ex._key)}
                        className="text-muted-foreground hover:text-destructive ml-2 shrink-0"
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
              </div>

              {/* Per-section add */}
              <div className="mt-2 ml-1">
                <ExercisePicker
                  onSelect={(ex) => addExerciseToSection(ex, group.section)}
                  placeholder={`+ Add to ${group.label}...`}
                />
              </div>
            </div>
          ))}
        </div>
      ) : (
        /* Flat list for workouts with no sections */
        <div className="space-y-2">
          {exercises.map((ex, idx) => (
            <div key={ex._key} className="border rounded p-3 bg-background">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-1.5 min-w-0">
                  <div className="flex flex-col shrink-0">
                    <button
                      type="button"
                      disabled={idx === 0}
                      onClick={() => moveExercise(ex._key, "up")}
                      className="text-muted-foreground hover:text-foreground disabled:opacity-20 disabled:cursor-not-allowed leading-none"
                    >
                      <ChevronUp className="w-3 h-3" />
                    </button>
                    <button
                      type="button"
                      disabled={idx === exercises.length - 1}
                      onClick={() => moveExercise(ex._key, "down")}
                      className="text-muted-foreground hover:text-foreground disabled:opacity-20 disabled:cursor-not-allowed leading-none"
                    >
                      <ChevronDown className="w-3 h-3" />
                    </button>
                  </div>
                  <span className="text-sm font-medium truncate">{idx + 1}. {ex.exerciseName}</span>
                </div>
                <button
                  type="button"
                  onClick={() => removeExercise(ex._key)}
                  className="text-muted-foreground hover:text-destructive ml-2 shrink-0"
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
          <ExercisePicker onSelect={(ex) => addExerciseToSection(ex, null)} placeholder="+ Add exercise..." />
        </div>
      )}

      <Button size="sm" onClick={save} disabled={saving} className="w-full mt-2">
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
  const router = useRouter();
  const [assignment, setAssignment] = useState<Assignment | null>(null);
  const [openWorkoutId, setOpenWorkoutId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);

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

  async function deleteAssignment() {
    if (!confirm("Remove this program from the client? All scheduled workouts and logged data will be permanently deleted.")) return;
    setDeleting(true);
    const res = await fetch(`/api/assignments/${assignmentId}`, { method: "DELETE" });
    if (!res.ok) {
      toast.error("Failed to remove program");
      setDeleting(false);
      return;
    }
    toast.success("Program removed");
    router.push(`/clients/${clientId}`);
  }

  async function resetSession(workoutId: string) {
    if (!confirm("Reset this session to Planned? The logged data will be deleted.")) return;
    const res = await fetch(`/api/assignments/${assignmentId}/workouts/${workoutId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "PLANNED" }),
    });
    if (!res.ok) { toast.error("Failed to reset session"); return; }
    const updated = await res.json();
    handleWorkoutSaved(updated);
    toast.success("Session reset to Planned");
  }

  if (loading) {
    return (
      <div className="px-5 pt-5 md:px-8 md:pt-8 md:max-w-4xl">
        <div className="h-8 w-48 bg-muted rounded animate-pulse mb-4" />
        <div className="space-y-2">
          {[...Array(4)].map((_, i) => <div key={i} className="h-16 bg-muted rounded animate-pulse" />)}
        </div>
      </div>
    );
  }

  if (!assignment) {
    return (
      <div className="px-5 pt-5 md:px-8 md:pt-8">
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
    <div className="px-5 pt-5 md:px-8 md:pt-8 md:max-w-4xl">
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
          <h1
            className="font-display leading-[1.04] tracking-[-0.01em]"
            style={{ fontSize: "clamp(1.75rem, 3.5vw, 2.5rem)", color: "var(--ink)" }}
          >
            {assignment.name}
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Started {new Date(assignment.startDate).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
            {" · "}
            <Link href={`/programs/${assignment.sourceProgram.id}`} className="hover:underline">
              {assignment.sourceProgram.name}
            </Link>
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Badge
            variant="outline"
            className={assignment.status === "ACTIVE" ? "border-green-200 text-green-700" : ""}
          >
            {assignment.status}
          </Badge>
          <Button
            variant="ghost"
            size="sm"
            onClick={deleteAssignment}
            disabled={deleting}
            className="h-8 px-2 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
            title="Remove program from client"
          >
            {deleting ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Trash2 className="w-4 h-4" />
            )}
          </Button>
        </div>
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
                                  ? "bg-[rgba(43,107,255,0.08)] text-[var(--blue)]"
                                  : "bg-[var(--muted)] text-[var(--ink-soft)]"
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
                            {workout.status === "LOGGED" && (
                              <button
                                type="button"
                                title="Reset to Planned"
                                onClick={(e) => { e.stopPropagation(); resetSession(workout.id); }}
                                className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors touch-manipulation"
                              >
                                <RotateCcw className="w-3.5 h-3.5" />
                              </button>
                            )}
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
