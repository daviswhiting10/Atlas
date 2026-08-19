"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ChevronDown, ChevronRight, ClipboardList } from "lucide-react";
import { cn } from "@/lib/utils";

type SetShape = { setNumber: number; weight: number | null; unit?: "reps" | "secs"; repMin: number; repMax: number };
type Exercise = { id: string; prescribedSets: SetShape[]; exercise: { name: string } };
type Workout = {
  id: string;
  name: string;
  scheduledDate: string;
  status: "PLANNED" | "LOGGED" | "SKIPPED" | "RESCHEDULED";
  exercises: Exercise[];
};
type Plan = {
  id: string;
  name: string;
  startDate: string;
  sourceProgram: { name: string };
  assignedWorkouts: Workout[];
} | null;

const STATUS_STYLE: Record<string, string> = {
  PLANNED: "border-border bg-muted text-muted-foreground",
  LOGGED: "border-green-300 bg-green-50 text-green-700",
  SKIPPED: "border-amber-300 bg-amber-50 text-amber-700",
  RESCHEDULED: "border-blue-300 bg-blue-50 text-blue-700",
};

function repRange(s: SetShape): string {
  if (s.unit === "secs") return `${s.repMax}s`;
  return s.repMin === s.repMax ? String(s.repMax) : `${s.repMin}–${s.repMax}`;
}

function groupByWeek(workouts: Workout[], startDate: string) {
  const start = new Date(startDate);
  const weeks: Record<number, Workout[]> = {};
  for (const w of workouts) {
    const diffDays = Math.floor((new Date(w.scheduledDate).getTime() - start.getTime()) / 86400000);
    const week = Math.floor(diffDays / 7) + 1;
    (weeks[week] ??= []).push(w);
  }
  return weeks;
}

export default function PlanPage() {
  const [plan, setPlan] = useState<Plan | undefined>(undefined);
  const [openId, setOpenId] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/client/plan")
      .then((r) => r.json())
      .then(setPlan);
  }, []);

  if (plan === undefined) {
    return (
      <div className="p-6 max-w-lg mx-auto">
        <div className="h-6 w-40 bg-muted rounded animate-pulse mb-4" />
        <div className="space-y-2">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-14 bg-muted rounded-xl animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  if (!plan) {
    return (
      <div className="p-6 max-w-lg mx-auto">
        <h1 className="text-xl font-bold tracking-tight mb-6">Your plan</h1>
        <Card className="border-dashed">
          <CardContent className="py-16 flex flex-col items-center text-center">
            <ClipboardList className="w-8 h-8 text-muted-foreground mb-3" />
            <p className="font-semibold">No active program yet</p>
            <p className="text-sm text-muted-foreground mt-1">
              Your trainer hasn&apos;t assigned a program. Check back soon.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const weekGroups = groupByWeek(plan.assignedWorkouts, plan.startDate);
  const weeks = Object.keys(weekGroups).map(Number).sort((a, b) => a - b);
  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="p-6 max-w-lg mx-auto">
      <div className="mb-6">
        <h1 className="text-xl font-bold tracking-tight">{plan.name}</h1>
        <p className="text-sm text-muted-foreground mt-0.5">{plan.sourceProgram.name}</p>
      </div>

      <div className="space-y-6">
        {weeks.map((weekNum) => (
          <div key={weekNum}>
            <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
              Week {weekNum}
            </h2>
            <div className="space-y-2">
              {weekGroups[weekNum].map((w) => {
                const isOpen = openId === w.id;
                const isToday = w.scheduledDate.slice(0, 10) === today;
                return (
                  <Card key={w.id} className={cn(isToday && "border-primary/40")}>
                    <CardContent className="py-3 px-4">
                      <button
                        type="button"
                        onClick={() => setOpenId(isOpen ? null : w.id)}
                        className="w-full flex items-center gap-3 text-left"
                      >
                        {isOpen ? (
                          <ChevronDown className="w-4 h-4 shrink-0 text-muted-foreground" />
                        ) : (
                          <ChevronRight className="w-4 h-4 shrink-0 text-muted-foreground" />
                        )}
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium truncate">{w.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {new Date(w.scheduledDate).toLocaleDateString("en-US", {
                              weekday: "short",
                              month: "short",
                              day: "numeric",
                            })}
                            {" · "}
                            {w.exercises.length} exercise{w.exercises.length !== 1 ? "s" : ""}
                          </p>
                        </div>
                        <Badge variant="outline" className={cn("text-xs shrink-0", STATUS_STYLE[w.status])}>
                          {w.status}
                        </Badge>
                      </button>

                      {isOpen && (
                        <div className="mt-3 pl-7 space-y-2">
                          {w.exercises.map((ex, i) => (
                            <div key={ex.id} className="text-sm">
                              <span className="text-muted-foreground mr-1">{i + 1}.</span>
                              {ex.exercise.name}
                              <span className="text-xs text-muted-foreground ml-1.5">
                                {ex.prescribedSets.length} × {repRange(ex.prescribedSets[0])}
                              </span>
                            </div>
                          ))}
                          {w.status !== "LOGGED" && (
                            <Link
                              href={`/workouts/${w.id}`}
                              className="inline-block text-xs font-medium text-primary mt-1 hover:underline"
                            >
                              Log this workout →
                            </Link>
                          )}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
