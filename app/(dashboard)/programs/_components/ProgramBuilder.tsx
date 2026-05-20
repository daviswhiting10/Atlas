"use client";

import { useState, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
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

// A section is a named group within a day (e.g. "Warmup", "Main A", "Burner")
type SectionInput = {
  _key: string;
  name: string;
  exercises: ExerciseInput[];
  open: boolean;
};

// A day is a single training session (maps to DB Workout)
type DayInput = {
  _key: string;
  id?: string;       // DB Workout.id — present when editing
  blockId?: string;  // DB Block.id — needed for edit reconciliation
  name: string;
  dayOfWeek: number;
  order: number;
  sections: SectionInput[];
  open: boolean;
};

type ProgramState = {
  name: string;
  description: string;
  durationWeeks: number;
  goals: string[];
  conditions: string[];
  days: DayInput[];
  // Store the single DB Block id when editing so we can pass it back for reconciliation
  blockId?: string;
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

const DEFAULT_SECTIONS = ["Warmup", "Main A", "Main B", "Burner"];

let _keyCounter = 0;
function key() { return `k${++_keyCounter}`; }

function defaultSet(num: number): SetInput {
  return { setNumber: num, weight: null, isBodyweight: false, repMin: 8, repMax: 12, rpe: null, restSeconds: null, notes: "" };
}

function makeDefaultSections(): SectionInput[] {
  return DEFAULT_SECTIONS.map((name) => ({
    _key: key(),
    name,
    exercises: [],
    open: true,
  }));
}

// ─── Builder component ────────────────────────────────────────────────────────

type Props = {
  programId?: string;
  initial?: ProgramState;
};

function makeInitial(): ProgramState {
  return { name: "", description: "", durationWeeks: 4, goals: [], conditions: [], days: [] };
}

const DRAFT_KEY = "atlas-program-draft-v2"; // v2 = new section-based structure

export function ProgramBuilder({ programId, initial }: Props) {
  const router = useRouter();
  const [prog, setProg] = useState<ProgramState>(() => {
    if (!programId && !initial && typeof window !== "undefined") {
      try {
        const saved = localStorage.getItem(DRAFT_KEY);
        if (saved) return JSON.parse(saved) as ProgramState;
      } catch {}
    }
    return initial ?? makeInitial();
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (programId) return;
    try { localStorage.setItem(DRAFT_KEY, JSON.stringify(prog)); } catch {}
  }, [prog, programId]);

  // ─── Day actions ──────────────────────────────────────────────────────────

  function addDay() {
    setProg((p) => ({
      ...p,
      days: [
        ...p.days,
        {
          _key: key(),
          name: `Day ${p.days.length + 1}`,
          dayOfWeek: Math.min(p.days.length + 1, 7),
          order: p.days.length + 1,
          sections: makeDefaultSections(),
          open: true,
        },
      ],
    }));
  }

  function removeDay(dKey: string) {
    setProg((p) => ({
      ...p,
      days: p.days
        .filter((d) => d._key !== dKey)
        .map((d, i) => ({ ...d, order: i + 1 })),
    }));
  }

  const updateDay = useCallback(
    (dKey: string, fn: (d: DayInput) => DayInput) =>
      setProg((p) => ({ ...p, days: p.days.map((d) => (d._key === dKey ? fn(d) : d)) })),
    []
  );

  // ─── Section actions ──────────────────────────────────────────────────────

  function addSection(dKey: string) {
    updateDay(dKey, (d) => ({
      ...d,
      sections: [
        ...d.sections,
        {
          _key: key(),
          name: `Block ${d.sections.length + 1}`,
          exercises: [],
          open: true,
        },
      ],
    }));
  }

  function removeSection(dKey: string, sKey: string) {
    updateDay(dKey, (d) => ({
      ...d,
      sections: d.sections.filter((s) => s._key !== sKey),
    }));
  }

  const updateSection = useCallback(
    (dKey: string, sKey: string, fn: (s: SectionInput) => SectionInput) =>
      updateDay(dKey, (d) => ({
        ...d,
        sections: d.sections.map((s) => (s._key === sKey ? fn(s) : s)),
      })),
    [updateDay]
  );

  // ─── Exercise actions ─────────────────────────────────────────────────────

  function addExercise(dKey: string, sKey: string, ex: ExerciseOption) {
    updateSection(dKey, sKey, (s) => ({
      ...s,
      exercises: [
        ...s.exercises,
        {
          _key: key(),
          exerciseId: ex.id,
          exerciseName: ex.name,
          order: s.exercises.length + 1,
          prescribedSets: [defaultSet(1), defaultSet(2), defaultSet(3)],
          notes: "",
        },
      ],
    }));
  }

  function removeExercise(dKey: string, sKey: string, eKey: string) {
    updateSection(dKey, sKey, (s) => ({
      ...s,
      exercises: s.exercises
        .filter((e) => e._key !== eKey)
        .map((e, i) => ({ ...e, order: i + 1 })),
    }));
  }

  function updateExercise(
    dKey: string,
    sKey: string,
    eKey: string,
    fn: (e: ExerciseInput) => ExerciseInput
  ) {
    updateSection(dKey, sKey, (s) => ({
      ...s,
      exercises: s.exercises.map((e) => (e._key === eKey ? fn(e) : e)),
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

    // Flatten the Day → Section → Exercise tree into the API shape:
    // One Block (the entire program) with workouts (days), exercises tagged with section name
    const globalOrder = { val: 0 };
    const body = {
      name: prog.name.trim(),
      description: prog.description.trim() || null,
      goalTags:
        prog.goals.length || prog.conditions.length
          ? { goals: prog.goals, conditions: prog.conditions }
          : null,
      blocks: [
        {
          id: prog.blockId,
          name: "Program",
          order: 1,
          weeks: prog.durationWeeks,
          workouts: prog.days.map((day) => {
            globalOrder.val = 0;
            const exercises = day.sections.flatMap((section) =>
              section.exercises.map((ex) => {
                globalOrder.val += 1;
                return {
                  id: ex.id,
                  exerciseId: ex.exerciseId,
                  order: globalOrder.val,
                  prescribedSets: ex.prescribedSets,
                  notes: ex.notes || null,
                  section: section.name,
                };
              })
            );
            return {
              id: day.id,
              name: day.name,
              dayOfWeek: day.dayOfWeek,
              order: day.order,
              exercises,
            };
          }),
        },
      ],
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

  // ─── Render ───────────────────────────────────────────────────────────────

  const totalExercises = prog.days.reduce(
    (s, d) => s + d.sections.reduce((ss, sec) => ss + sec.exercises.length, 0),
    0
  );

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

          <div className="flex items-center gap-3">
            <Label>Duration</Label>
            <Input
              type="number"
              min={1}
              value={prog.durationWeeks}
              onChange={(e) =>
                setProg((p) => ({
                  ...p,
                  durationWeeks: Math.max(1, parseInt(e.target.value) || 1),
                }))
              }
              className="h-8 w-20 text-sm text-center"
            />
            <span className="text-sm text-muted-foreground">weeks</span>
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
        </div>
      </div>

      {/* Days */}
      <div className="space-y-4">
        {prog.days.map((day) => (
          <Card key={day._key} className="border-2">
            {/* Day header */}
            <CardHeader className="py-3 px-4">
              <div className="flex items-center gap-3">
                <GripVertical className="w-4 h-4 text-muted-foreground shrink-0" />
                <button
                  type="button"
                  onClick={() => updateDay(day._key, (d) => ({ ...d, open: !d.open }))}
                  className="flex-1 flex items-center gap-2 text-left min-w-0"
                >
                  {day.open ? (
                    <ChevronDown className="w-4 h-4 shrink-0" />
                  ) : (
                    <ChevronRight className="w-4 h-4 shrink-0" />
                  )}
                  <Input
                    value={day.name}
                    onChange={(e) =>
                      updateDay(day._key, (d) => ({ ...d, name: e.target.value }))
                    }
                    onClick={(e) => e.stopPropagation()}
                    className="h-7 font-semibold text-sm border-0 shadow-none p-0 focus-visible:ring-0"
                    placeholder="Day name..."
                  />
                </button>
                <div className="flex items-center gap-2 shrink-0">
                  <Select
                    value={String(day.dayOfWeek)}
                    onValueChange={(v) =>
                      updateDay(day._key, (d) => ({ ...d, dayOfWeek: parseInt(v) }))
                    }
                  >
                    <SelectTrigger className="h-7 w-20 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(DAY_LABELS).map(([v, label]) => (
                        <SelectItem key={v} value={v}>{label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <span className="text-xs text-muted-foreground">
                    {day.sections.reduce((s, sec) => s + sec.exercises.length, 0)} ex
                  </span>
                  <button
                    type="button"
                    onClick={() => removeDay(day._key)}
                    className="text-muted-foreground hover:text-destructive"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </CardHeader>

            {/* Day body — sections */}
            {day.open && (
              <CardContent className="px-4 pb-4 space-y-3">
                {day.sections.map((section) => (
                  <div key={section._key} className="border rounded-md bg-muted/20">
                    {/* Section header */}
                    <div className="flex items-center gap-2 px-3 py-2">
                      <button
                        type="button"
                        onClick={() =>
                          updateSection(day._key, section._key, (s) => ({
                            ...s,
                            open: !s.open,
                          }))
                        }
                        className="flex items-center gap-1.5 min-w-0"
                      >
                        {section.open ? (
                          <ChevronDown className="w-3.5 h-3.5 shrink-0" />
                        ) : (
                          <ChevronRight className="w-3.5 h-3.5 shrink-0" />
                        )}
                      </button>
                      <Input
                        value={section.name}
                        onChange={(e) =>
                          updateSection(day._key, section._key, (s) => ({
                            ...s,
                            name: e.target.value,
                          }))
                        }
                        className="h-6 flex-1 text-sm font-medium border-0 shadow-none p-0 focus-visible:ring-0 bg-transparent"
                        placeholder="Block name..."
                      />
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-xs text-muted-foreground">
                          {section.exercises.length} ex
                        </span>
                        <button
                          type="button"
                          onClick={() => removeSection(day._key, section._key)}
                          className="text-muted-foreground hover:text-destructive"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    {/* Section exercises */}
                    {section.open && (
                      <div className="px-3 pb-3 space-y-3">
                        {section.exercises.map((ex) => (
                          <div key={ex._key} className="bg-background border rounded p-3">
                            <div className="flex items-center justify-between mb-2">
                              <div className="flex items-center gap-2 min-w-0">
                                <span className="text-xs font-medium text-muted-foreground w-4">
                                  {ex.order}.
                                </span>
                                <span className="text-sm font-medium truncate">
                                  {ex.exerciseName}
                                </span>
                              </div>
                              <button
                                type="button"
                                onClick={() =>
                                  removeExercise(day._key, section._key, ex._key)
                                }
                                className="text-muted-foreground hover:text-destructive shrink-0"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                            <SetsTable
                              sets={ex.prescribedSets}
                              onChange={(sets) =>
                                updateExercise(
                                  day._key,
                                  section._key,
                                  ex._key,
                                  (e) => ({ ...e, prescribedSets: sets })
                                )
                              }
                            />
                            <Input
                              value={ex.notes}
                              onChange={(e) =>
                                updateExercise(
                                  day._key,
                                  section._key,
                                  ex._key,
                                  (ex2) => ({ ...ex2, notes: e.target.value })
                                )
                              }
                              placeholder="Exercise notes (optional)..."
                              className="mt-2 h-7 text-xs"
                            />
                          </div>
                        ))}

                        <ExercisePicker
                          onSelect={(ex) => addExercise(day._key, section._key, ex)}
                          placeholder={`+ Add exercise to ${section.name}...`}
                        />
                      </div>
                    )}
                  </div>
                ))}

                {/* Add block within day */}
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="text-xs text-muted-foreground w-full border border-dashed"
                  onClick={() => addSection(day._key)}
                >
                  <Plus className="w-3 h-3 mr-1" />
                  Add block to {day.name}
                </Button>
              </CardContent>
            )}
          </Card>
        ))}

        {/* Add Day */}
        <Button type="button" variant="outline" onClick={addDay} className="w-full">
          <Plus className="w-4 h-4 mr-1.5" />
          Add Day
        </Button>
      </div>

      {/* Save bar */}
      <div className="fixed bottom-0 left-0 right-0 border-t bg-background/95 backdrop-blur p-4 flex items-center justify-between z-40">
        <div className="text-xs text-muted-foreground">
          {prog.days.length > 0
            ? `${prog.durationWeeks} weeks · ${prog.days.length} day${prog.days.length !== 1 ? "s" : ""} · ${totalExercises} exercises`
            : "No days yet"}
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

// Standard section order for display grouping
const SECTION_ORDER = ["Warmup", "Main A", "Main B", "Burner"];

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
        section: string | null;
        exercise: { id: string; name: string };
      }[];
    }[];
  }[];
}): ProgramState {
  // Use the first block as the canonical block (new programs have exactly one)
  const firstBlock = api.blocks[0];
  const durationWeeks = firstBlock?.weeks ?? 4;
  const blockId = firstBlock?.id;

  // Flatten all workouts from all blocks into days
  const allWorkouts = api.blocks.flatMap((b) => b.workouts);

  const days: DayInput[] = allWorkouts.map((w) => {
    // Group exercises by section name
    const sectionMap = new Map<string, typeof w.exercises>();
    for (const ex of w.exercises) {
      const sName = ex.section ?? "Main A";
      if (!sectionMap.has(sName)) sectionMap.set(sName, []);
      sectionMap.get(sName)!.push(ex);
    }

    // Build sections: standard order first, then any extras
    const sectionNames = [
      ...SECTION_ORDER.filter((s) => sectionMap.has(s)),
      ...Array.from(sectionMap.keys()).filter((s) => !SECTION_ORDER.includes(s)),
    ];

    // If no exercises at all, show default empty sections
    const sections: SectionInput[] =
      sectionNames.length > 0
        ? sectionNames.map((name) => ({
            _key: key(),
            name,
            open: false,
            exercises: (sectionMap.get(name) ?? []).map((e) => ({
              _key: key(),
              id: e.id,
              exerciseId: e.exerciseId,
              exerciseName: e.exercise.name,
              order: e.order,
              prescribedSets: (e.prescribedSets as SetDraft[]) ?? [],
              notes: e.notes ?? "",
            })),
          }))
        : makeDefaultSections().map((s) => ({ ...s, open: false }));

    return {
      _key: key(),
      id: w.id,
      blockId,
      name: w.name,
      dayOfWeek: w.dayOfWeek ?? 1,
      order: w.order ?? 1,
      sections,
      open: false,
    };
  });

  return {
    name: api.name,
    description: api.description ?? "",
    durationWeeks,
    goals: api.goalTags?.goals ?? [],
    conditions: api.goalTags?.conditions ?? [],
    days,
    blockId,
  };
}
