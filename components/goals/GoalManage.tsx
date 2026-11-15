"use client";

import { useId, useState } from "react";
import { format, parseISO } from "date-fns";
import { ChevronDown } from "lucide-react";
import type { TodayView } from "@/lib/goals/today";
import { RuleEditor } from "./RuleEditor";
import type { GoalActions } from "./TodayLive";

/**
 * The bottom of the goal card, closed until it is wanted: change the rules, or end the goal.
 * No animation: opening it is a decision, not a moment.
 */
export function GoalManage({ goalId, manage, actions }: { goalId: string; manage: TodayView["manage"]; actions: Pick<GoalActions, "addGoalRule" | "removeGoalRule" | "endGoal"> }) {
  const [open, setOpen] = useState(false);
  const panel = useId();
  return (
    <div className="mt-3">
      <button type="button" aria-expanded={open} aria-controls={panel} onClick={() => setOpen(!open)} className="dusk-chip is-quiet -ml-2">
        Rules &amp; end goal <ChevronDown className={open ? "h-4 w-4 rotate-180" : "h-4 w-4"} />
      </button>
      {open && (
        <div id={panel} className="mt-2">
          {manage.carried && (
            <p className="mb-3 text-[14px] leading-relaxed text-dusk-soft">
              {manage.carried.days} days, {format(parseISO(manage.carried.from), "MMM d")} through {format(parseISO(manage.carried.to), "MMM d")}, happened before Atlas and count as done.
            </p>
          )}
          <RuleEditor goalId={goalId} items={manage.rules} actions={actions} />
        </div>
      )}
    </div>
  );
}
