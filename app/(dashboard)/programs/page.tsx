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
  goal: string;
  durationWeeks: number;
  status: string;
  createdAt: string;
  client: { id: string; fullName: string };
};

const GOAL_LABELS: Record<string, string> = {
  weight_loss: "Weight Loss",
  hypertrophy: "Hypertrophy",
  pain_mgmt: "Pain Management",
  performance: "Performance",
  general: "General Fitness",
};

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-zinc-100 text-zinc-600 border-zinc-200",
  approved: "bg-blue-50 text-blue-700 border-blue-200",
  active: "bg-emerald-50 text-emerald-700 border-emerald-200",
  archived: "bg-zinc-50 text-zinc-400 border-zinc-100",
};

export default function ProgramsPage() {
  const [programs, setPrograms] = useState<Program[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/programs")
      .then((r) => r.json())
      .then(setPrograms)
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="p-8 max-w-4xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Programs</h1>
          <p className="text-muted-foreground text-sm mt-0.5">{programs.length} total</p>
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
              Generate an AI-powered periodized program for any client
            </p>
            <Link href="/programs/new" className={buttonVariants()}>
              <Plus className="w-4 h-4 mr-1.5" />
              Generate First Program
            </Link>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {programs.map((p) => (
            <Card key={p.id} className="hover:border-primary/40 transition-colors">
              <CardContent className="py-4 px-5 flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold">{p.name}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {p.client.fullName} · {GOAL_LABELS[p.goal] ?? p.goal} · {p.durationWeeks}wk
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className={`text-xs capitalize ${STATUS_COLORS[p.status] ?? ""}`}>
                    {p.status}
                  </Badge>
                  <span className="text-xs text-muted-foreground">
                    {new Date(p.createdAt).toLocaleDateString()}
                  </span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
