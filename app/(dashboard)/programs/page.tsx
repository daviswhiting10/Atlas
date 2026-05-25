"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Plus, Dumbbell, Copy, UserPlus, Trash2, Sparkles } from "lucide-react";
import { toast } from "sonner";

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

// Goal tag inline styles — outlined, token-based
const GOAL_TAG_STYLE: Record<string, { border: string; bg: string; color: string }> = {
  "Weight Loss":          { border: "rgba(31,122,77,0.30)",  bg: "rgba(31,122,77,0.07)",   color: "var(--success)" },
  "Hypertrophy":          { border: "rgba(43,107,255,0.30)", bg: "rgba(43,107,255,0.07)",  color: "var(--blue)" },
  "Strength":             { border: "rgba(109,40,217,0.25)", bg: "rgba(109,40,217,0.06)",  color: "#6D28D9" },
  "Endurance":            { border: "rgba(6,182,212,0.30)",  bg: "rgba(6,182,212,0.07)",   color: "#0891B2" },
  "Athletic Performance": { border: "rgba(43,107,255,0.30)", bg: "rgba(43,107,255,0.07)",  color: "var(--blue)" },
  "General Fitness":      { border: "var(--line)",           bg: "rgba(11,15,26,0.04)",    color: "var(--ink-soft)" },
  "Corrective":           { border: "rgba(180,83,9,0.30)",   bg: "rgba(180,83,9,0.07)",    color: "var(--warn)" },
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
    <div className="px-5 pt-7 md:px-8 md:pt-8 md:max-w-5xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1
            className="font-display leading-[1.04] tracking-[-0.01em]"
            style={{ fontSize: "clamp(2.5rem, 5vw, 3rem)", color: "var(--ink)" }}
          >
            Programs
          </h1>
          <p className="font-body text-sm mt-1" style={{ color: "var(--ink-mute)" }}>
            {programs.length} template{programs.length !== 1 ? "s" : ""}
            {filtered.length !== programs.length && ` · ${filtered.length} shown`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/programs/idea" className={buttonVariants({ variant: "outline" })}>
            <Sparkles className="w-4 h-4 mr-1.5" style={{ color: "var(--blue)" }} />
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
                className="px-2.5 py-0.5 rounded-full font-body text-xs border transition-all"
                style={
                  goalFilter === g
                    ? {
                        background: "var(--blue)",
                        color: "#fff",
                        borderColor: "var(--blue)",
                      }
                    : {
                        borderColor: "var(--line)",
                        color: "var(--ink-soft)",
                      }
                }
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
                className="px-2.5 py-0.5 rounded-full font-body text-xs border transition-all"
                style={
                  condFilter === c
                    ? {
                        background: "var(--warn)",
                        color: "#fff",
                        borderColor: "var(--warn)",
                      }
                    : {
                        borderColor: "var(--line)",
                        color: "var(--ink-soft)",
                      }
                }
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
        <Card>
          <CardContent className="py-16 flex flex-col items-center text-center">
            <div
              className="w-14 h-14 rounded-full flex items-center justify-center mb-5"
              style={{ background: "rgba(43,107,255,0.08)" }}
            >
              <Dumbbell className="w-7 h-7" style={{ color: "var(--blue)" }} />
            </div>
            <h3 className="font-display text-xl mb-1" style={{ color: "var(--ink)" }}>No programs yet</h3>
            <p className="font-body text-sm mb-5 max-w-xs" style={{ color: "var(--ink-mute)" }}>
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
                <Card lift className="cursor-pointer group card-lift">
                  <CardContent className="py-3.5 px-4 sm:px-5">

                    {/* ── Row 1: name + badges ── */}
                    <div className="flex items-start justify-between gap-2 mb-0.5">
                      <div className="flex items-start gap-2 min-w-0 flex-1">
                        <p className="font-body text-sm font-medium leading-snug min-w-0" style={{ color: "var(--ink)" }}>{p.name}</p>
                        {p.isDraft && (
                          <Badge variant="secondary" className="h-4 px-1.5 shrink-0 mt-px">
                            Draft
                          </Badge>
                        )}
                      </div>
                      {/* Actions — always visible on mobile, hover-only on desktop */}
                      <div className="flex items-center gap-0.5 shrink-0 sm:opacity-0 sm:group-hover:opacity-100 sm:transition-opacity">
                        <button
                          type="button"
                          onClick={(e) => duplicate(e, p.id, p.name)}
                          disabled={duplicating}
                          title="Duplicate"
                          className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground touch-manipulation"
                        >
                          <Copy className="w-3.5 h-3.5" />
                        </button>
                        <Link
                          href={`/programs/${p.id}/assign`}
                          onClick={(e) => e.stopPropagation()}
                          className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground touch-manipulation"
                          title="Assign to client"
                        >
                          <UserPlus className="w-3.5 h-3.5" />
                        </Link>
                        <button
                          type="button"
                          onClick={(e) => deleteProgram(e, p.id, p.name)}
                          title="Delete"
                          className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-destructive touch-manipulation"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    {/* ── Row 2: stats + assigned ── */}
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs text-muted-foreground">
                        {p.durationWeeks}wk · {p._count.blocks} block{p._count.blocks !== 1 ? "s" : ""} · {totalWorkouts} workout{totalWorkouts !== 1 ? "s" : ""}
                      </p>
                      <Badge variant="outline" className="text-xs shrink-0">
                        {p._count.assignments} assigned
                      </Badge>
                    </div>

                    {/* ── Row 3: goal / condition tags ── */}
                    {(goals.length > 0 || conditions.length > 0) && (
                      <div className="flex flex-wrap gap-1 mt-1.5">
                        {goals.map((g) => {
                          const s = GOAL_TAG_STYLE[g] ?? GOAL_TAG_STYLE["General Fitness"];
                          return (
                            <span
                              key={g}
                              className="inline-flex items-center px-1.5 py-0 rounded font-body text-[10px] border font-medium"
                              style={{ background: s.bg, color: s.color, borderColor: s.border }}
                            >
                              {g}
                            </span>
                          );
                        })}
                        {conditions.map((c) => (
                          <span
                            key={c}
                            className="inline-flex items-center px-1.5 py-0 rounded font-body text-[10px] border font-medium"
                            style={{
                              background: "rgba(180,83,9,0.07)",
                              color: "var(--warn)",
                              borderColor: "rgba(180,83,9,0.30)",
                            }}
                          >
                            {c}
                          </span>
                        ))}
                      </div>
                    )}

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
