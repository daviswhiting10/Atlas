"use client";

import { useState, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { ExercisePicker, type ExerciseOption } from "./ExercisePicker";
import { SetsTable, type SetDraft } from "./SetsTable";
import {
  ArrowLeft,
  Plus,
  Trash2,
  ChevronDown,
  ChevronRight,
  GripVertical,
  Save,
  UserPlus,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ─── Types ─────────────────────────────────────────────────────────────────

type SetInput = SetDraft;

type ExerciseInput = {
  _key: string;
  id?: string;
  exerciseId: string;
  exerciseName: string;
  order: number;
  prescribedSets: SetInput[];
  notes: string;
};

type WorkoutInput = {
  _key: string;
  id?: string;
  name: string;
  dayOfWeek: number;
  order: number;
  exercises: ExerciseInput[];
  open: boolean;
};

type BlockInput = {
  _key: string;
  id?: string;
  name: string;
  order: number;
  weeks: number;
  workouts: WorkoutInput[];
  open: boolean;
};

type ProgramState = {
  name: string;
  description: string;
  goals: string[];
  conditions: string[];
  blocks: BlockInput[];
};

// ─── Constants ──────────────────────────────────────────────────────────────

const GOAL_OPTIONS = [
  "Weight Loss",
  "Hypertrophy",
  "Strength",
  "Endurance",
  "Athletic Performance",
  "General Fitness",
  "Corrective",
];

const CONDITION_OPTIONS = [
  "Lower Back Safe",
  "Knee Pain",
  "Shoulder Restrictions",
  "Post-Rehab",
  "Beginner",
  "No Equipment",
];

const DAY_LABELS: Record<number, string> = {
  1: "Mon", 2: "Tue", 3: "Wed", 4: "Thu", 5: "Fri", 6: "Sat", 7: "Sun",
};

let _keyCounter = 0;
function key() { return `k${++_keyCounter}`; }

function defaultSet(num: number): SetInput {
  return { setNumber: num, weight: null, repMin: 8, repMax: 12, rpe: null, restSeconds: 90, notes: "" };
}

// ─── Builder component ────────────────────────────────────────────────────────

type Props = {
  programId?: string; // undefined = creating new
  initial?: ProgramState;
};

function makeInitial(): ProgramState {
  return { name: "", description: "", goals: [], conditions: [], blocks: [] };
}

const DRAFT_KEY = "atlas-program-draft";

export function ProgramBuilder({ programId, initial }: Props) {
  const router = useRouter();
  const [prog, setProg] = useState<ProgramState>(() => {
    // For new programs only: restore draft from localStorage
    if (!programId && !initial && typeof window !== "undefined") {
      try {
        const saved = localStorage.getItem(DRAFT_KEY);
        if (saved) return JSON.parse(saved) as ProgramState;
      } catch {}
    }
    return initial ?? makeInitial();
  });
  const [saving, setSaving] = useState(false);

  // Auto-save draft to localStorage for new programs
  useEffect(() => {
    if (programId) return;
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify(prog));
    } catch {}
  }, [prog, programId]);

  // ─── Helpers ──────────────────────────────────────────────────────────────

  const updateBlock = useCallback(
    (bKey: string, fn: (b: BlockInput) => BlockInput) =>
      setProg((p) => ({ ...p, blocks: p.blocks.map((b) => (b._key === bKey ? fn(b) : b)) })),
    []
  );

  const updateWorkout = useCallback(
    (bKey: string, wKey: string, fn: (w: WorkoutInput) => WorkoutInput) =>
      updateBlock(bKey, (b) => ({
        ...b,
        workouts: b.workouts.map((w) => (w._key === wKey ? fn(w) : w)),
      })),
    [updateBlock]
  );

  const updateExercise = useCallback(
    (bKey: string, wKey: string, eKey: string, fn: (e: ExerciseInput) => ExerciseInput) =>
      updateWorkout(bKey, wKey, (w) => ({
        ...w,
        exercises: w.exercises.map((e) => (e._key === eKey ? fn(e) : e)),
      })),
    [updateWorkout]
  );

  // ─── Block actions ────────────────────────────────────────────────────────

  function addBlock() {
    setProg((p) => ({
      ...p,
      blocks: [
        ...p.blocks,
        {
          _key: key(),
          name: `Block ${p.blocks.length + 1}`,
          order: p.blocks.length + 1,
          weeks: 4,
          workouts: [],
          open: true,
        },
      ],
    }));
  }

  function removeBlock(bKey: string) {
    setProg((p) => ({
      ...p,
      blocks: p.blocks
        .filter((b) => b._key !== bKey)
        .map((b, i) => ({ ...b, order: i + 1 })),
    }));
  }

  // ─── Workout actions ──────────────────────────────────────────────────────

  function addWorkout(bKey: string) {
    updateBlock(bKey, (b) => ({
      ...b,
      workouts: [
        ...b.workouts,
        {
          _key: key(),
          name: `Day ${b.workouts.length + 1}`,
          dayOfWeek: Math.min(b.workouts.length + 1, 7),
          order: b.workouts.length + 1,
          exercises: [],
          open: true,
        },
      ],
    }));
  }

  function removeWorkout(bKey: string, wKey: string) {
    updateBlock(bKey, (b) => ({
      ...b,
      workouts: b.workouts
        .filter((w) => w._key !== wKey)
        .map((w, i) => ({ ...w, order: i + 1 })),
    }));
  }

  // ─── Exercise actions ─────────────────────────────────────────────────────

  function addExercise(bKey: string, wKey: string, ex: ExerciseOption) {
    updateWorkout(bKey, wKey, (w) => ({
      ...w,
      exercises: [
        ...w.exercises,
        {
          _key: key(),
          exerciseId: ex.id,
          exerciseName: ex.name,
          order: w.exercises.length + 1,
          prescribedSets: [defaultSet(1), defaultSet(2), defaultSet(3)],
          notes: "",
        },
      ],
    }));
  }

  function removeExercise(bKey: string, wKey: string, eKey: string) {
    updateWorkout(bKey, wKey, (w) => ({
      ...w,
      exercises: w.exercises
        .filter((e) => e._key !== eKey)
        .map((e, i) => ({ ...e, order: i + 1 })),
    }));
  }

  // ─── Goal tags ─────────────────────────────────────────────────────────────

  function toggleGoal(g: string) {
    setProg((p) => ({
      ...p,
      goals: p.goals.includes(g) ? p.goals.filter((x) => x !== g) : [...p.goals, g],
    }));
  }

  function toggleCondition(c: string) {
    setProg((p) => ({
      ...p,
      conditions: p.conditions.includes(c)
        ? p.conditions.filter((x) => x !== c)
        : [...p.conditions, c],
    }));
  }

  // ─── Save ─────────────────────────────────────────────────────────────────

  async function save(andAssign = false) {
    if (!prog.name.trim()) { toast.error("Program needs a name"); return; }

    const body = {
      name: prog.name.trim(),
      description: prog.description.trim() || null,
      goalTags:
        prog.goals.length || prog.conditions.length
          ? { goals: prog.goals, conditions: prog.conditions }
          : null,
      blocks: prog.blocks.map((b) => ({
        id: b.id,
        name: b.name,
        order: b.order,
        weeks: b.weeks,
        workouts: b.workouts.map((w) => ({
          id: w.id,
          name: w.name,
          dayOfWeek: w.dayOfWeek,
          order: w.order,
          exercises: w.exercises.map((e) => ({
            id: e.id,
            exerciseId: e.exerciseId,
            order: e.order,
            prescribedSets: e.prescribedSets,
            notes: e.notes || null,
          })),
        })),
      })),
    };

    setSaving(true);
    try {
      const url = programId ? `/api/programs/${programId}` : "/api/programs";
      const method = programId ? "PATCH" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast.error(err?.error?.formErrors?.[0] ?? "Save failed");
        return;
      }
      const saved = await res.json();
      toast.success("Program saved");
      try { localStorage.removeItem(DRAFT_KEY); } catch {}
      if (andAssign) {
        router.push(`/programs/${saved.id}/assign`);
      } else if (!programId) {
        router.push(`/programs/${saved.id}`);
      }
    } finally {
      setSaving(false);
    }
  }

  // ─── Computed ─────────────────────────────────────────────────────────────

  const totalWeeks = prog.blocks.reduce((s, b) => s + b.weeks, 0);
  const totalWorkouts = prog.blocks.reduce(
    (s, b) => s + b.workouts.length * b.weeks,
    0
  );

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="p-8 max-w-4xl pb-24">
      <Link
        href="/programs"
        className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "mb-4 -ml-2")}
      >
        <ArrowLeft className="w-4 h-4 mr-1" />
        Programs
      </Link>

      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight mb-4">
          {programId ? "Edit Program" : "New Program"}
        </h1>

        <div className="grid grid-cols-1 gap-4">
          <div className="space-y-1.5">
            <Label>Program name *</Label>
            <Input
              value={prog.name}
              onChange={(e) => setProg((p) => ({ ...p, name: e.target.value }))}
              placeholder="e.g. 12-Week Hypertrophy — Lower Back Safe"
              className="text-base font-medium"
            />
          </div>

          <div className="space-y-1.5">
            <Label>Description</Label>
            <Textarea
              value={prog.description}
              onChange={(e) => setProg((p) => ({ ...p, description: e.target.value }))}
              rows={2}
              placeholder="Brief notes on goals, client profile, methodology..."
            />
          </div>

          <div className="space-y-2">
            <Label>Goals</Label>
            <div className="flex flex-wrap gap-1.5">
              {GOAL_OPTIONS.map((g) => (
                <button
                  key={g}
                  type="button"
                  onClick={() => toggleGoal(g)}
                  className={cn(
                    "px-2.5 py-1 rounded-full text-xs border transition-colors",
                    prog.goals.includes(g)
                      ? "bg-primary text-primary-foreground border-primary"
                      : "border-border text-muted-foreground hover:border-primary/40"
                  )}
                >
                  {g}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <Label>Conditions / modifiers</Label>
            <div className="flex flex-wrap gap-1.5">
              {CONDITION_OPTIONS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => toggleCondition(c)}
                  className={cn(
                    "px-2.5 py-1 rounded-full text-xs border transition-colors",
                    prog.conditions.includes(c)
                      ? "bg-amber-500 text-white border-amber-500"
                      : "border-border text-muted-foreground hover:border-amber-400"
                  )}
                >
                  {c}
                </button>
              ))}
            </div>
          </div>

          {totalWeeks > 0 && (
            <p className="text-xs text-muted-foreground">
              {totalWeeks} weeks · ~{totalWorkouts} total sessions
            </p>
          )}
        </div>
      </div>

      {/* Blocks */}
      <div className="space-y-4">
        {prog.blocks.map((block) => (
          <Card key={block._key} className="border-2">
            <CardHeader className="py-3 px-4">
              <div className="flex items-center gap-3">
                <GripVertical className="w-4 h-4 text-muted-foreground shrink-0" />
                <button
                  type="button"
                  onClick={() => updateBlock(block._key, (b) => ({ ...b, open: !b.open }))}
                  className="flex-1 flex items-center gap-2 text-left"
                >
                  {block.open ? (
                    <ChevronDown className="w-4 h-4 shrink-0" />
                  ) : (
                    <ChevronRight className="w-4 h-4 shrink-0" />
                  )}
                  <Input
                    value={block.name}
                    onChange={(e) =>
                      updateBlock(block._key, (b) => ({ ...b, name: e.target.value }))
                    }
                    onClick={(e) => e.stopPropagation()}
                    className="h-7 font-semibold text-sm border-0 shadow-none p-0 focus-visible:ring-0"
                    placeholder="Block name..."
                  />
                </button>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-xs text-muted-foreground">Weeks:</span>
                  <Input
                    type="number"
                    min={1}
                    value={block.weeks}
                    onChange={(e) =>
                      updateBlock(block._key, (b) => ({
                        ...b,
                        weeks: Math.max(1, parseInt(e.target.value) || 1),
                      }))
                    }
                    className="h-7 w-14 text-xs text-center"
                  />
                  <Badge variant="outline" className="text-xs">
                    {block.workouts.length} workout{block.workouts.length !== 1 ? "s" : ""}
                  </Badge>
                  <button
                    type="button"
                    onClick={() => removeBlock(block._key)}
                    className="text-muted-foreground hover:text-destructive"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </CardHeader>

            {block.open && (
              <CardContent className="px-4 pb-4 space-y-3">
                {block.workouts.map((workout) => (
                  <div key={workout._key} className="border rounded-md bg-muted/20">
                    {/* Workout header */}
                    <div className="flex items-center gap-2 px-3 py-2">
                      <button
                        type="button"
                        onClick={() =>
                          updateWorkout(block._key, workout._key, (w) => ({ ...w, open: !w.open }))
                        }
                        className="flex items-center gap-1.5 flex-1 min-w-0"
                      >
                        {workout.open ? (
                          <ChevronDown className="w-3.5 h-3.5 shrink-0" />
                        ) : (
                          <ChevronRight className="w-3.5 h-3.5 shrink-0" />
                        )}
                        <Input
                          value={workout.name}
                          onChange={(e) =>
                            updateWorkout(block._key, workout._key, (w) => ({
                              ...w,
                              name: e.target.value,
                            }))
                          }
                          onClick={(e) => e.stopPropagation()}
                          className="h-6 text-sm border-0 shadow-none p-0 focus-visible:ring-0 bg-transparent"
                          placeholder="Workout name..."
                        />
                      </button>
                      <div className="flex items-center gap-2 shrink-0">
                        <Select
                          value={String(workout.dayOfWeek)}
                          onValueChange={(v) =>
                            updateWorkout(block._key, workout._key, (w) => ({
                              ...w,
                              dayOfWeek: parseInt(v),
                            }))
                          }
                        >
                          <SelectTrigger className="h-6 w-20 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {Object.entries(DAY_LABELS).map(([v, label]) => (
                              <SelectItem key={v} value={v}>
                                {label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <span className="text-xs text-muted-foreground">
                          {workout.exercises.length} ex
                        </span>
                        <button
                          type="button"
                          onClick={() => removeWorkout(block._key, workout._key)}
                          className="text-muted-foreground hover:text-destructive"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    {/* Exercises */}
                    {workout.open && (
                      <div className="px-3 pb-3 space-y-3">
                        {workout.exercises.map((ex) => (
                          <div key={ex._key} className="bg-background border rounded p-3">
                            <div className="flex items-center justify-between mb-2">
                              <div className="flex items-center gap-2 min-w-0">
                                <span className="text-xs font-medium text-muted-foreground w-4">
                                  {ex.order}.
                                </span>
                                <span className="text-sm font-medium truncate">{ex.exerciseName}</span>
                              </div>
                              <button
                                type="button"
                                onClick={() => removeExercise(block._key, workout._key, ex._key)}
                                className="text-muted-foreground hover:text-destructive shrink-0"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                            <SetsTable
                              sets={ex.prescribedSets}
                              onChange={(sets) =>
                                updateExercise(block._key, workout._key, ex._key, (e) => ({
                                  ...e,
                                  prescribedSets: sets,
                                }))
                              }
                            />
                            <Input
                              value={ex.notes}
                              onChange={(e) =>
                                updateExercise(block._key, workout._key, ex._key, (ex2) => ({
                                  ...ex2,
                                  notes: e.target.value,
                                }))
                              }
                              placeholder="Exercise notes (optional)..."
                              className="mt-2 h-7 text-xs"
                            />
                          </div>
                        ))}

                        <ExercisePicker
                          onSelect={(ex) => addExercise(block._key, workout._key, ex)}
                          placeholder="+ Add exercise..."
                        />
                      </div>
                    )}
                  </div>
                ))}

                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="text-xs text-muted-foreground w-full border border-dashed"
                  onClick={() => addWorkout(block._key)}
                >
                  <Plus className="w-3 h-3 mr-1" />
                  Add workout to {block.name}
                </Button>
              </CardContent>
            )}
          </Card>
        ))}

        <Button type="button" variant="outline" onClick={addBlock} className="w-full">
          <Plus className="w-4 h-4 mr-1.5" />
          Add Block
        </Button>
      </div>

      {/* Save bar */}
      <div className="fixed bottom-0 left-0 right-0 border-t bg-background/95 backdrop-blur p-4 flex items-center justify-between z-40">
        <div className="text-xs text-muted-foreground">
          {totalWeeks > 0 ? `${totalWeeks} weeks · ${prog.blocks.length} blocks` : "No blocks yet"}
        </div>
        <div className="flex gap-2">
          <Button variant="outline" disabled={saving} onClick={() => save(false)}>
            <Save className="w-4 h-4 mr-1.5" />
            Save
          </Button>
          <Button disabled={saving} onClick={() => save(true)}>
            <UserPlus className="w-4 h-4 mr-1.5" />
            Save &amp; Assign
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── Data loader helper (used by edit page) ─────────────────────────────────

export function programApiToState(api: {
  name: string;
  description: string | null;
  goalTags: { goals: string[]; conditions: string[] } | null;
  blocks: {
    id: string;
    name: string;
    order: number;
    weeks: number;
    workouts: {
      id: string;
      name: string;
      dayOfWeek: number | null;
      order: number | null;
      exercises: {
        id: string;
        exerciseId: string;
        order: number;
        prescribedSets: unknown;
        notes: string | null;
        exercise: { id: string; name: string };
      }[];
    }[];
  }[];
}): ProgramState {
  return {
    name: api.name,
    description: api.description ?? "",
    goals: api.goalTags?.goals ?? [],
    conditions: api.goalTags?.conditions ?? [],
    blocks: api.blocks.map((b) => ({
      _key: key(),
      id: b.id,
      name: b.name,
      order: b.order,
      weeks: b.weeks,
      open: false,
      workouts: b.workouts.map((w) => ({
        _key: key(),
        id: w.id,
        name: w.name,
        dayOfWeek: w.dayOfWeek ?? 1,
        order: w.order ?? 1,
        open: false,
        exercises: w.exercises.map((e) => ({
          _key: key(),
          id: e.id,
          exerciseId: e.exerciseId,
          exerciseName: e.exercise.name,
          order: e.order,
          prescribedSets: (e.prescribedSets as SetDraft[]) ?? [],
          notes: e.notes ?? "",
        })),
      })),
    })),
  };
}
