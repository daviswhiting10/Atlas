"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CloudOff } from "lucide-react";
import { toast } from "sonner";
import { createExercise, type PickerExercise } from "@/lib/actions/exercises";
import { addPendingAdd, clearPendingAdd, readPendingAdds, type PendingAdd, type PendingTarget } from "@/lib/exercises/pending-adds";
import { isNetworkError } from "@/lib/sessions/pending";

const store = () => (typeof window === "undefined" ? null : window.localStorage);

/**
 * Exercises typed with no connection, for one workout. Each is kept on the phone, shown at once, and
 * saved and put into the workout when the connection returns (also on the next visit to the workout).
 * `apply` puts one exercise in (or swaps it in) and says whether that worked.
 */
export function usePendingExercises(workoutId: string, apply: (op: PendingAdd, exercise: PickerExercise) => Promise<boolean>) {
  const [list, setList] = useState<PendingAdd[]>([]);
  const applyRef = useRef(apply);
  applyRef.current = apply;
  const flushing = useRef(false);

  const refresh = useCallback(() => setList(readPendingAdds(store(), workoutId)), [workoutId]);

  const flush = useCallback(async () => {
    if (flushing.current || (typeof navigator !== "undefined" && navigator.onLine === false)) return;
    flushing.current = true;
    try {
      for (const op of readPendingAdds(store(), workoutId)) {
        try {
          const made = await createExercise(op.name);
          if (!made.ok) {
            toast.error(`${op.name}: ${made.error}`);
            clearPendingAdd(store(), workoutId, op.id);
            continue;
          }
          const ok = await applyRef.current(op, made.exercise);
          // Not worked and still online: the app has told the person why. Don't try forever.
          if (ok || navigator.onLine !== false) clearPendingAdd(store(), workoutId, op.id);
          else break;
        } catch (e) {
          if (isNetworkError(e)) break; // still no connection: keep it for the next time
          clearPendingAdd(store(), workoutId, op.id);
        }
      }
    } finally {
      flushing.current = false;
      refresh();
    }
  }, [workoutId, refresh]);

  useEffect(() => {
    refresh();
    void flush();
    // A moment after the connection returns, not in the instant it does: a request sent into a half-ready network is cut off.
    let timer: number | undefined;
    const online = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => void flush(), 600);
    };
    window.addEventListener("online", online);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("online", online);
    };
  }, [refresh, flush]);

  const add = useCallback(
    (name: string, target: PendingTarget) => {
      addPendingAdd(store(), workoutId, { name, target });
      refresh();
      toast("You're offline. It's saved on this phone and added when you're back.", { id: "pending-exercise" });
    },
    [workoutId, refresh]
  );

  return { pending: list, add };
}

/** What's waiting for a connection, so the person can see it wasn't lost. */
export function PendingExercises({ pending }: { pending: PendingAdd[] }) {
  if (pending.length === 0) return null;
  return (
    <ul className="mt-3 space-y-2" aria-label="Waiting for a connection">
      {pending.map((p) => (
        <li key={p.id} className="flex min-h-11 items-center gap-2.5 rounded-xl border border-dashed border-line-strong px-3.5 py-2 text-[14px] text-ink-soft">
          <CloudOff className="h-4 w-4 shrink-0" />
          <span className="min-w-0">
            <span className="font-semibold text-ink">{p.name}</span> {p.target.mode === "swap" ? "swaps in" : "is added"} when you&apos;re back online
          </span>
        </li>
      ))}
    </ul>
  );
}
