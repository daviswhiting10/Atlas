"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dumbbell, Moon } from "lucide-react";

type SetShape = {
  setNumber: number;
  weight: number | null;
  repMin: number;
  repMax: number;
  rpe: number | null;
  restSeconds: number | null;
};

type Exercise = {
  id: string;
  order: number;
  prescribedSets: SetShape[];
  notes: string | null;
  exercise: { id: string; name: string; equipment: string };
};

type TodayWorkout = {
  id: string;
  name: string;
  scheduledDate: string;
  programAssignment: { name: string };
  exercises: Exercise[];
} | null;

export default function TodayPage() {
  const [workout, setWorkout] = useState<TodayWorkout | undefined>(undefined);

  useEffect(() => {
    fetch("/api/client/today")
      .then((r) => r.json())
      .then((data) => setWorkout(data));
  }, []);

  const today = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  if (workout === undefined) {
    return (
      <div className="p-6 max-w-lg mx-auto">
        <div className="h-6 w-48 bg-muted rounded animate-pulse mb-2" />
        <div className="h-4 w-32 bg-muted rounded animate-pulse mb-6" />
        <div className="h-40 bg-muted rounded-xl animate-pulse" />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-lg mx-auto">
      <div className="mb-6">
        <h1 className="text-xl font-bold tracking-tight">Today</h1>
        <p className="text-sm text-muted-foreground mt-0.5">{today}</p>
      </div>

      {!workout ? (
        <Card className="border-dashed">
          <CardContent className="py-16 flex flex-col items-center text-center">
            <Moon className="w-8 h-8 text-muted-foreground mb-3" />
            <p className="font-semibold">Rest Day</p>
            <p className="text-sm text-muted-foreground mt-1">
              No workout scheduled for today. Recover well.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          <div className="flex items-start justify-between">
            <div>
              <h2 className="font-bold text-lg">{workout.name}</h2>
              <p className="text-xs text-muted-foreground mt-0.5">{workout.programAssignment.name}</p>
            </div>
            <Dumbbell className="w-5 h-5 text-muted-foreground mt-1" />
          </div>

          {workout.exercises.map((ex) => (
            <Card key={ex.id}>
              <CardHeader className="pb-2 pt-4">
                <CardTitle className="text-sm font-semibold flex items-center justify-between">
                  <span>{ex.order}. {ex.exercise.name}</span>
                  <Badge variant="outline" className="text-xs font-normal">{ex.exercise.equipment}</Badge>
                </CardTitle>
                {ex.notes && <p className="text-xs text-muted-foreground">{ex.notes}</p>}
              </CardHeader>
              <CardContent className="pb-4">
                <div className="grid grid-cols-4 gap-1 text-xs text-muted-foreground mb-1.5 px-1">
                  <span>Set</span>
                  <span className="text-center">Reps</span>
                  <span className="text-center">Weight</span>
                  <span className="text-center">Rest</span>
                </div>
                {ex.prescribedSets.map((s) => (
                  <div
                    key={s.setNumber}
                    className="grid grid-cols-4 gap-1 text-sm py-2 px-1 border-t border-border/50 first:border-t-0"
                  >
                    <span className="font-medium text-muted-foreground">{s.setNumber}</span>
                    <span className="text-center">
                      {s.repMin === s.repMax ? s.repMin : `${s.repMin}–${s.repMax}`}
                    </span>
                    <span className="text-center text-muted-foreground">
                      {s.weight ? `${s.weight} lbs` : "—"}
                    </span>
                    <span className="text-center text-muted-foreground">
                      {s.restSeconds ? `${s.restSeconds}s` : "—"}
                    </span>
                  </div>
                ))}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
