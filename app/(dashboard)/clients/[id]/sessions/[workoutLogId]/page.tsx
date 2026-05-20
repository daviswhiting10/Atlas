"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Save } from "lucide-react";
import { toast } from "sonner";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

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
    programAssignment: { id: string; name: string };
  } | null;
  sets: SetLog[];
};

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
      map.set(key, {
        exerciseId: key,
        exerciseName: s.exercise?.name ?? "Unknown exercise",
        sets: [],
      });
    }
    map.get(key)!.sets.push(s);
  }

  return order.map((k) => map.get(k)!);
}

export default function SessionDetailPage() {
  const { id: clientId, workoutLogId } = useParams<{ id: string; workoutLogId: string }>();
  const [session, setSession] = useState<SessionDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [dateValue, setDateValue] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch(`/api/sessions/${workoutLogId}`)
      .then((r) => r.json())
      .then((data: SessionDetail) => {
        setSession(data);
        // Use the raw date string (YYYY-MM-DD) for the input value — no timezone conversion needed
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

      {/* Header */}
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
          <label className="text-xs text-muted-foreground w-20 shrink-0">Session date</label>
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
                {/* Column headers */}
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

      {/* Link to assigned workout if applicable */}
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
    </div>
  );
}
