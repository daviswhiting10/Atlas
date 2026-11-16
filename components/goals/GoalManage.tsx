"use client";

import { useId, useState, type ReactNode } from "react";
import { format, parseISO } from "date-fns";
import { ChevronDown } from "lucide-react";
import type { TodayView } from "@/lib/goals/today";
import { GoalSettings } from "./GoalSettings";
import type { GoalActions } from "./TodayLive";

/**
 * The foot of the goal card: whatever `lead` is (the link to log a workout with sets), and a toggle for the
 * closed "Diet & end goal" area. No animation: opening it is a decision, not a moment.
 */
export function GoalManage({ goalId, manage, actions, lead }: { goalId: string; manage: TodayView["manage"]; actions: Pick<GoalActions, "setDiet" | "endGoal">; lead?: ReactNode }) {
  const [open, setOpen] = useState(false);
  const panel = useId();
  return (
    <div className="mt-3">
      <div className="flex flex-wrap items-center gap-2">
        {lead}
        <button type="button" aria-expanded={open} aria-controls={panel} onClick={() => setOpen(!open)} className="dusk-chip is-quiet">
          {manage.diet != null ? "Diet & end goal" : "End goal"} <ChevronDown className={open ? "h-4 w-4 rotate-180" : "h-4 w-4"} />
        </button>
      </div>
      {open && (
        <div id={panel} className="mt-2">
          {manage.carried && (
            <p className="mb-3 text-[14px] leading-relaxed text-dusk-soft">
              {manage.carried.days} days, {format(parseISO(manage.carried.from), "MMM d")} through {format(parseISO(manage.carried.to), "MMM d")}, happened before Atlas and count as done.
            </p>
          )}
          <GoalSettings goalId={goalId} diet={manage.diet} actions={actions} />
        </div>
      )}
    </div>
  );
}
