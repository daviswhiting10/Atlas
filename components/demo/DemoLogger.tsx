"use client";

import { useSyncExternalStore } from "react";
import { WorkoutLogger } from "@/components/athlete/WorkoutLogger";
import { demoActions } from "@/lib/demo/actions";
import { demoStore } from "@/lib/demo/store";
import type { LoggerData } from "@/lib/athlete/data";

/** The real logger on the sample workout, with in-memory saves; what was ticked since the demo opened comes back. */
export function DemoLogger({ data }: { data: LoggerData }) {
  // Re-drawn from the sample when Reset empties the store.
  const version = useSyncExternalStore(
    (cb) => demoStore.subscribe(cb),
    () => demoStore.size(),
    () => 0
  );
  const merged: LoggerData = {
    ...data,
    status: demoStore.isFinished(data.id) ? "LOGGED" : data.status,
    exercises: data.exercises.map((e) => ({
      ...e,
      sets: e.sets.map((s) => {
        const m = demoStore.getSet(data.id, e.aweId, s.setNumber);
        return m ? { ...s, weight: m.weight, reps: m.reps, done: m.done, setLogId: s.setLogId ?? `demo-set-${e.aweId}-${s.setNumber}` } : s;
      }),
    })),
  };
  return <WorkoutLogger key={`${data.id}-${version === 0 ? "fresh" : "kept"}`} data={merged} actions={demoActions} base="/demo" />;
}
