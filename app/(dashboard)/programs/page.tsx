"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Plus, Dumbbell } from "lucide-react";

type Program = {
  id: string;
  name: string;
  description: string | null;
  durationWeeks: number;
  goalTags: { goals: string[]; conditions: string[] } | null;
  updatedAt: string;
  _count: { assignments: number };
  blocks: { _count: { workouts: number } }[];
};

export default function ProgramsPage() {
  const [programs, setPrograms] = useState<Program[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/programs")
      .then((r) => r.json())
      .then((data) => setPrograms(Array.isArray(data) ? data : []))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="p-8 max-w-4xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Programs</h1>
          <p className="text-muted-foreground text-sm mt-0.5">{programs.length} template{programs.length !== 1 ? "s" : ""}</p>
        </div>
        <Link href="/programs/new" className={buttonVariants()}>
          <Plus className="w-4 h-4 mr-1.5" />
          New Program
        </Link>
      </div>

      {loading ? (
        <div className="space-y-2">
          {[...Array(3)].map((_, i) => (
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
      ) : (
        <div className="space-y-2">
          {programs.map((p) => {
            const totalWorkouts = p.blocks.reduce((s, b) => s + b._count.workouts, 0);
            const goals = p.goalTags?.goals ?? [];
            return (
              <Link key={p.id} href={`/programs/${p.id}`}>
                <Card className="hover:border-primary/40 transition-colors cursor-pointer">
                  <CardContent className="py-4 px-5 flex items-center justify-between">
                    <div>
                      <p className="text-sm font-semibold">{p.name}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {p.durationWeeks}wk · {p.blocks.length} block{p.blocks.length !== 1 ? "s" : ""} · {totalWorkouts} workouts
                        {goals.length > 0 && ` · ${goals.join(", ")}`}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="text-xs">
                        {p._count.assignments} assigned
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        {new Date(p.updatedAt).toLocaleDateString()}
                      </span>
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
