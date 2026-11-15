"use client";

import { useState } from "react";
import { Sun } from "lucide-react";
import { toast } from "sonner";
import { WorkoutMinutes, type WorkoutRow } from "@/lib/goals/rows";
import { TickCircle } from "./TickCircle";
import { useTodayLive } from "./TodayLive";

type Logged = Extract<WorkoutRow, { kind: "workout" }>;

/**
 * The day's workouts: one row for each the goal needs. An empty row is one tap (it logs "Workout, 45 min"
 * in the background); a logged row shows its minutes, which can be edited right there, and carries the
 * tag (outdoors) as a toggle. Must sit inside <TodayLive>; renders <li>s for a list.
 */
export function WorkoutRows() {
  const live = useTodayLive();
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const w = live?.view.workout;
  if (!live || !w) return null;
  const mark = w.mark;
  const markLabel = mark ? mark.charAt(0).toUpperCase() + mark.slice(1) : "";

  const open = (row: Logged) => {
    if (!row.sessionId) return; // still saving: a moment
    setDraft(row.minutes != null ? String(row.minutes) : "");
    setEditing(row.sessionId);
  };
  const commit = (row: Logged) => {
    const n = Number(draft);
    const ok = WorkoutMinutes.safeParse(n);
    if (!ok.success) return void toast("Enter the minutes, 1 to 600.", { duration: 3500 });
    setEditing(null);
    if (row.sessionId && n !== row.minutes) live.editMinutes(row.sessionId, n);
  };

  const toggle = (row: Logged) => {
    if (!mark) return null;
    const on = row.sessionId ? live.tagged(row.sessionId, mark, row.tags.includes(mark)) : row.tags.includes(mark);
    return (
      <button type="button" aria-pressed={on} disabled={row.saving} onClick={() => row.sessionId && live.toggleTag(row.sessionId, mark, on)} className="dusk-chip shrink-0">
        {mark === "outdoors" && <Sun className="h-4 w-4" />} {markLabel}
      </button>
    );
  };

  return (
    <>
      {live.rows.map((row, i) => {
        if (row.kind === "empty") {
          return (
            <li key={i} className="flex min-h-[56px] items-center gap-3 py-1.5">
              <button type="button" onClick={() => live.logWorkout(false)} aria-label={`Log a ${w.defaultMinutes} minute workout`} className="dusk-row flex min-h-[44px] min-w-0 flex-1 items-center gap-3 text-left">
                <TickCircle on={false} />
                <span className="text-[15px] font-medium text-dusk-mute">Workout · {w.defaultMinutes} min</span>
              </button>
              {mark && (
                <button type="button" aria-pressed={false} onClick={() => live.logWorkout(true)} aria-label={`Log a ${w.defaultMinutes} minute workout, ${mark}`} className="dusk-chip shrink-0">
                  {mark === "outdoors" && <Sun className="h-4 w-4" />} {markLabel}
                </button>
              )}
            </li>
          );
        }

        if (editing != null && editing === row.sessionId) {
          return (
            <li key={i} className="py-2">
              <div className="flex min-h-[44px] flex-wrap items-center gap-x-3 gap-y-2">
                <TickCircle on />
                <span className="text-[15px] font-medium text-dusk-text">{row.title} ·</span>
                <input
                  autoFocus
                  inputMode="numeric"
                  aria-label="Minutes"
                  value={draft}
                  onChange={(e) => setDraft(e.target.value.replace(/\D/g, ""))}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") commit(row);
                    if (e.key === "Escape") setEditing(null);
                  }}
                  className="dusk-input w-[72px] text-center tabular-nums"
                />
                <span className="text-[14px] text-dusk-mute">min</span>
                <button type="button" onClick={() => commit(row)} className="dusk-button !px-4">
                  Done
                </button>
                {row.timeOnly && row.sessionId && (
                  <button
                    type="button"
                    onClick={() => {
                      setEditing(null);
                      live.removeRow(row.sessionId as string);
                    }}
                    className="dusk-chip is-quiet"
                  >
                    Remove
                  </button>
                )}
              </div>
            </li>
          );
        }

        return (
          <li key={i} className="flex min-h-[56px] items-center gap-3 py-1.5">
            <button type="button" disabled={row.saving} onClick={() => open(row)} aria-label="Edit minutes" className="dusk-row flex min-h-[44px] min-w-0 flex-1 items-center gap-3 text-left">
              <TickCircle on />
              <span className="min-w-0 truncate text-[15px] font-medium text-dusk-text">
                {row.title} · {row.minutes != null ? `${row.minutes} min` : <span className="text-dusk-peach">add time</span>}
              </span>
            </button>
            {toggle(row)}
          </li>
        );
      })}
    </>
  );
}
