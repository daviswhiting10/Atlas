"use client";

import { Sun } from "lucide-react";
import type { WorkoutRow } from "@/lib/goals/rows";
import { TickCircle } from "./TickCircle";
import { useTodayLive } from "./TodayLive";

type Logged = Extract<WorkoutRow, { kind: "workout" }>;

/**
 * The day's workouts: one row for each the goal needs. An empty row is one tap (it logs "Workout, 45 min"
 * in the background); tap a logged row again and it comes back off, at any time while its day can still be
 * changed. A row is only that: there are no minutes to edit. A logged row carries the tag (outdoors) as a
 * toggle. A workout logged with sets can't be taken off from here (only one with no sets loses nothing), so
 * its row isn't a button. Must sit inside <TodayLive>; renders <li>s for a list.
 *
 * `which` picks the day: today's rows, or yesterday's while "Yesterday is still open" (a tap there logs the
 * workout dated to yesterday, and a second tap takes it back the same way).
 */
export function WorkoutRows({ which = "today" }: { which?: "today" | "yesterday" }) {
  const live = useTodayLive();
  const w = live?.view.workout;
  if (!live || !w) return null;
  const mark = w.mark;
  const markLabel = mark ? mark.charAt(0).toUpperCase() + mark.slice(1) : "";
  const when = which === "yesterday" ? " for yesterday" : "";
  // Yesterday's rows sit inside a narrower panel, so the tag is just its icon there (still named for screen readers).
  const iconOnly = which === "yesterday" && mark === "outdoors";
  const chipClass = iconOnly ? "dusk-chip shrink-0 !px-0" : "dusk-chip shrink-0";

  const toggle = (row: Logged) => {
    if (!mark) return null;
    const on = row.sessionId ? live.tagged(row.sessionId, mark, row.tags.includes(mark)) : row.tags.includes(mark);
    return (
      <button type="button" aria-pressed={on} aria-label={markLabel} disabled={row.saving} onClick={() => row.sessionId && live.toggleTag(row.sessionId, mark, on)} className={chipClass}>
        {mark === "outdoors" && <Sun className="h-4 w-4" />} {iconOnly ? null : markLabel}
      </button>
    );
  };

  return (
    <>
      {live.rows[which].map((row, i) => {
        if (row.kind === "empty") {
          return (
            <li key={i} className="flex min-h-[56px] items-center gap-3 py-1.5">
              <button type="button" onClick={() => live.logWorkout(false, which)} aria-label={`Log a ${w.defaultMinutes} minute workout${when}`} className="dusk-row flex min-h-[44px] min-w-0 flex-1 items-center gap-3 text-left">
                <TickCircle on={false} />
                <span className="text-[15px] font-medium text-dusk-mute">Workout · {w.defaultMinutes} min</span>
              </button>
              {mark && (
                <button type="button" aria-pressed={false} onClick={() => live.logWorkout(true, which)} aria-label={`Log a ${w.defaultMinutes} minute workout${when}, ${mark}`} className={chipClass}>
                  {mark === "outdoors" && <Sun className="h-4 w-4" />} {iconOnly ? null : markLabel}
                </button>
              )}
            </li>
          );
        }

        const label = (
          <>
            <TickCircle on />
            <span className="min-w-0 truncate text-[15px] font-medium text-dusk-text">
              {row.title} · {row.minutes != null ? `${row.minutes} min` : <span className="text-dusk-mute">no time</span>}
            </span>
          </>
        );
        return (
          <li key={i} className="flex min-h-[56px] items-center gap-3 py-1.5">
            {row.timeOnly ? (
              <button
                type="button"
                aria-pressed
                onClick={() => live.unlog(row.key, row.sessionId)}
                aria-label={`Undo ${row.title}${row.minutes != null ? `, ${row.minutes} minutes` : ""}${when}`}
                className="dusk-row flex min-h-[44px] min-w-0 flex-1 items-center gap-3 text-left"
              >
                {label}
              </button>
            ) : (
              <div className="flex min-h-[44px] min-w-0 flex-1 items-center gap-3">{label}</div>
            )}
            {toggle(row)}
          </li>
        );
      })}
    </>
  );
}
