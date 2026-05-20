"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Plus, Dumbbell, Copy, UserPlus, Trash2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type Program = {
  id: string;
  name: string;
  description: string | null;
  durationWeeks: number;
  isDraft: boolean;
  goalTags: { goals: string[]; conditions: string[] } | null;
  updatedAt: string;
  _count: { assignments: number; blocks: number };
  blocks: { _count: { workouts: number } }[];
};

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

const GOAL_COLORS: Record<string, string> = {
  "Weight Loss": "bg-emerald-50 text-emerald-700 border-emerald-200",
  "Hypertrophy": "bg-blue-50 text-blue-700 border-blue-200",
  "Strength": "bg-violet-50 text-violet-700 border-violet-200",
  "Endurance": "bg-cyan-50 text-cyan-700 border-cyan-200",
  "Athletic Performance": "bg-orange-50 text-orange-700 border-orange-200",
  "General Fitness": "bg-zinc-100 text-zinc-700 border-zinc-200",
  "Corrective": "bg-amber-50 text-amber-700 border-amber-200",
};

export default function ProgramsPage() {
  const router = useRouter();
  const [programs, setPrograms] = useState<Program[]>([]);
  const [loading, setLoading] = useState(true);
  const [goalFilter, setGoalFilter] = useState<string | null>(null);
  const [condFilter, setCondFilter] = useState<string | null>(null);
  const [duplicating, startDuplicate] = useTransition();

  useEffect(() => {
    fetch("/api/programs")
      .then((r) => r.json())
      .then((data) => setPrograms(Array.isArray(data) ? data : []))
      .finally(() => setLoading(false));
  }, []);

  async function deleteProgram(e: React.MouseEvent, id: string, name: string) {
    e.preventDefault();
    e.stopPropagation();
    if (!confirm(`Delete "${name}"? This cannot be undone.`)) return;
    const res = await fetch(`/api/programs/${id}`, { method: "DELETE" });
    if (!res.ok) { toast.error("Delete failed"); return; }
    setPrograms((prev) => prev.filter((p) => p.id !== id));
    toast.success(`"${name}" deleted`);
  }

  async function duplicate(e: React.MouseEvent, id: string, name: string) {
    e.preventDefault();
    e.stopPropagation();
    startDuplicate(async () => {
      const res = await fetch(`/api/programs/${id}/duplicate`, { method: "POST" });
      if (!res.ok) { toast.error("Duplicate failed"); return; }
      const copy = await res.json();
      toast.success(`"${name}" duplicated`);
      router.push(`/programs/${copy.id}`);
    });
  }

  const filtered = programs.filter((p) => {
    const goals = p.goalTags?.goals ?? [];
    const conds = p.goalTags?.conditions ?? [];
    if (goalFilter && !goals.includes(goalFilter)) return false;
    if (condFilter && !conds.includes(condFilter)) return false;
    return true;
  });

  return (
    <div className="p-8 max-w-5xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Programs</h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            {programs.length} template{programs.length !== 1 ? "s" : ""}
            {filtered.length !== programs.length && ` · ${filtered.length} shown`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/programs/idea" className={buttonVariants({ variant: "outline" })}>
            <Sparkles className="w-4 h-4 mr-1.5 text-violet-500" />
            AI Idea
          </Link>
          <Link href="/programs/new" className={buttonVariants()}>
            <Plus className="w-4 h-4 mr-1.5" />
            New Program
          </Link>
        </div>
      </div>

      {/* Filters */}
      {programs.length > 0 && (
        <div className="space-y-2 mb-5">
          <div className="flex flex-wrap gap-1.5">
            <span className="text-xs text-muted-foreground self-center mr-1">Goal:</span>
            {GOAL_OPTIONS.map((g) => (
              <button
                key={g}
                type="button"
                onClick={() => setGoalFilter(goalFilter === g ? null : g)}
                className={cn(
                  "px-2.5 py-0.5 rounded-full text-xs border transition-colors",
                  goalFilter === g
                    ? "bg-primary text-primary-foreground border-primary"
                    : "border-border text-muted-foreground hover:border-primary/40 hover:text-foreground"
                )}
              >
                {g}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap gap-1.5">
            <span className="text-xs text-muted-foreground self-center mr-1">Modifier:</span>
            {CONDITION_OPTIONS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setCondFilter(condFilter === c ? null : c)}
                className={cn(
                  "px-2.5 py-0.5 rounded-full text-xs border transition-colors",
                  condFilter === c
                    ? "bg-amber-500 text-white border-amber-500"
                    : "border-border text-muted-foreground hover:border-amber-400 hover:text-foreground"
                )}
              >
                {c}
              </button>
            ))}
          </div>
        </div>
      )}

      {loading ? (
        <div className="space-y-2">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-20 rounded-lg bg-muted animate-pulse" />
          ))}
        </div>
      ) : programs.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="py-16 flex flex-col items-center text-center">
            <Dumbbell className="w-10 h-10 text-muted-foreground mb-3" />
            <p className="font-medium">No programs yet</p>
            <p className="text-sm text-muted-foreground mt-1 mb-4">
              Build a periodized program template, then assign it to clients.
            </p>
            <Link href="/programs/new" className={buttonVariants()}>
              <Plus className="w-4 h-4 mr-1.5" />
              Build First Program
            </Link>
          </CardContent>
        </Card>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground text-sm">
          No programs match these filters.{" "}
          <button
            className="underline"
            onClick={() => { setGoalFilter(null); setCondFilter(null); }}
          >
            Clear
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((p) => {
            const totalWorkouts = p.blocks.reduce((s, b) => s + b._count.workouts, 0);
            const goals = p.goalTags?.goals ?? [];
            const conditions = p.goalTags?.conditions ?? [];
            return (
              <Link key={p.id} href={`/programs/${p.id}`}>
                <Card className="hover:border-primary/40 transition-colors cursor-pointer group">
                  <CardContent className="py-3.5 px-5">
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-sm font-semibold">{p.name}</p>
                          {p.isDraft && (
                            <Badge variant="outline" className="text-xs text-zinc-500 border-zinc-300 h-4 px-1.5">
                              Draft
                            </Badge>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {p.durationWeeks}wk · {p._count.blocks} block{p._count.blocks !== 1 ? "s" : ""} · {totalWorkouts} workout{totalWorkouts !== 1 ? "s" : ""}
                        </p>
                        {(goals.length > 0 || conditions.length > 0) && (
                          <div className="flex flex-wrap gap-1 mt-1.5">
                            {goals.map((g) => (
                              <span
                                key={g}
                                className={cn(
                                  "inline-flex items-center px-1.5 py-0 rounded text-[10px] border font-medium",
                                  GOAL_COLORS[g] ?? "bg-zinc-100 text-zinc-700 border-zinc-200"
                                )}
                              >
                                {g}
                              </span>
                            ))}
                            {conditions.map((c) => (
                              <span
                                key={c}
                                className="inline-flex items-center px-1.5 py-0 rounded text-[10px] border font-medium bg-amber-50 text-amber-700 border-amber-200"
                              >
                                {c}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <Badge variant="outline" className="text-xs">
                          {p._count.assignments} assigned
                        </Badge>
                        <button
                          type="button"
                          onClick={(e) => duplicate(e, p.id, p.name)}
                          disabled={duplicating}
                          title="Duplicate program"
                          className="opacity-0 group-hover:opacity-100 transition-opacity p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground"
                        >
                          <Copy className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={(e) => deleteProgram(e, p.id, p.name)}
                          title="Delete program"
                          className="opacity-0 group-hover:opacity-100 transition-opacity p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-destructive"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                        <Link
                          href={`/programs/${p.id}/assign`}
                          onClick={(e) => e.stopPropagation()}
                          className="opacity-0 group-hover:opacity-100 transition-opacity p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground"
                          title="Assign to client"
                        >
                          <UserPlus className="w-3.5 h-3.5" />
                        </Link>
                        <span className="text-xs text-muted-foreground">
                          {new Date(p.updatedAt).toLocaleDateString()}
                        </span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
