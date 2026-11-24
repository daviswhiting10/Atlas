"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { addedSentence } from "@/lib/sessions/added";

const key = (workoutId: string) => `atlas:added-card:${workoutId}`;

/**
 * "Last time you added Cable Row and Face Pulls." One card for both loggers, at the top of the workout. Add them to
 * today only, or (when this person may edit the plan) to the plan from now on. Dismissed, it stays away for this session.
 */
export function AddedLastTime({
  workoutId,
  names,
  canPlan,
  busy,
  onAdd,
}: {
  workoutId: string;
  names: string[];
  /** May add to the later workouts of the plan too. */
  canPlan: boolean;
  busy: boolean;
  /** Resolves true when they were added (the card then goes). */
  onAdd: (fromNowOn: boolean) => Promise<boolean>;
}) {
  // Shown once mounted: whether it was dismissed is only known on this device.
  const [shown, setShown] = useState(false);
  useEffect(() => {
    let dismissed = false;
    try {
      dismissed = window.localStorage.getItem(key(workoutId)) === "1";
    } catch {}
    setShown(!dismissed);
  }, [workoutId]);
  if (!shown || names.length === 0) return null;

  const dismiss = () => {
    setShown(false);
    try {
      window.localStorage.setItem(key(workoutId), "1");
    } catch {}
  };
  const add = async (fromNowOn: boolean) => {
    if (await onAdd(fromNowOn)) setShown(false);
  };

  return (
    <section aria-label="Added last time" className="relative rounded-2xl border border-line bg-paper px-4 pb-3 pt-3">
      <p className="pr-9 text-[15px] leading-snug text-ink">{addedSentence(names)}</p>
      <button type="button" onClick={dismiss} aria-label="Dismiss" className="press absolute right-1 top-1 flex h-11 w-11 items-center justify-center rounded-full text-ink-mute hover:text-ink">
        <X className="h-4 w-4" />
      </button>
      <div className="mt-2 flex flex-wrap gap-2">
        <button type="button" disabled={busy} onClick={() => void add(false)} className="press min-h-11 rounded-full border border-line-strong px-4 text-sm font-semibold text-ink disabled:opacity-60">
          Add to today only
        </button>
        {canPlan && (
          <button type="button" disabled={busy} onClick={() => void add(true)} className="press min-h-11 rounded-full px-3 text-sm font-semibold text-signal disabled:opacity-60">
            Add to plan from now on
          </button>
        )}
      </div>
    </section>
  );
}
