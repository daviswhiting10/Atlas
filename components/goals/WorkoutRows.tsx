"use client";

import { Sun } from "lucide-react";
import type { WorkoutRow } from "@/lib/goals/rows";
import { TickCircle } from "./TickCircle";
import { useTodayLive } from "./TodayLive";
import { useLongPress } from "@/hooks/use-long-press";

type Logged = Extract<WorkoutRow, { kind: "workout" }>;
type Live = NonNullable<ReturnType<typeof useTodayLive>>;

/**
 * The day's workouts: one row for each the goal needs. An empty row is one tap (it logs "Workout, 45 min"
 * in the background); tap a logged row again and it comes back off, at any time while its day can still be
 * changed. A row is only that: there are no minutes to edit. A workout logged with sets can't be taken off
 * from here (only one with no sets loses nothing), so its row isn't a tap target.
 *
 * The goal's tag (outdoors) is a press-and-hold on the row: hold an empty row to log it outdoors, hold a
 * logged one to switch outdoors on or off. A tagged row shows a sun, as a status, never as a button.
 * Keyboard and screen-reader users get the same as a visually hidden button.
 *
 * `which` picks the day: today's rows, or yesterday's while "Yesterday is still open" (a tap there logs the
 * workout dated to yesterday, and a second tap takes it back the same way). Must sit inside <TodayLive>;
 * renders <li>s for a list.
 */
export function WorkoutRows({ which = "today" }: { which?: "today" | "yesterday" }) {
  const live = useTodayLive();
  const w = live?.view.workout;
  if (!live || !w) return null;
  const mark = w.mark;
  return (
    <>
      {live.rows[which].map((row, i) =>
        row.kind === "empty" ? (
          <EmptyRow key={i} live={live} minutes={w.defaultMinutes} mark={mark} which={which} />
        ) : (
          <LoggedRow key={i} live={live} row={row} mark={mark} which={which} />
        )
      )}
      {/* Once, under today's rows: the hold is otherwise invisible. */}
      {mark === "outdoors" && which === "today" && <li className="pb-1 text-[12px] text-dusk-mute">Hold a workout to mark it outdoors.</li>}
    </>
  );
}

const rowClass = "dusk-row flex min-h-[44px] min-w-0 flex-1 select-none items-center gap-3 text-left [-webkit-touch-callout:none]";
const hidden = "sr-only focus:not-sr-only focus:rounded-lg focus:px-3 focus:py-2 focus:text-sm";

function EmptyRow({ live, minutes, mark, which }: { live: Live; minutes: number; mark: string | null | undefined; which: "today" | "yesterday" }) {
  const when = which === "yesterday" ? " for yesterday" : "";
  const press = useLongPress(
    () => (mark ? live.logWorkout(true, which) : live.logWorkout(false, which)),
    () => live.logWorkout(false, which)
  );
  return (
    <li className="flex min-h-[56px] items-center gap-3 py-1.5">
      <button type="button" {...press} aria-label={`Log a ${minutes} minute workout${when}`} className={rowClass}>
        <TickCircle on={false} />
        <span className="text-[15px] font-medium text-dusk-mute">Workout · {minutes} min</span>
      </button>
      {mark && (
        <button type="button" onClick={() => live.logWorkout(true, which)} className={hidden}>
          Log a {minutes} minute workout{when}, {mark}
        </button>
      )}
    </li>
  );
}

function LoggedRow({ live, row, mark, which }: { live: Live; row: Logged; mark: string | null | undefined; which: "today" | "yesterday" }) {
  const when = which === "yesterday" ? " for yesterday" : "";
  const on = mark ? (row.sessionId ? live.tagged(row.sessionId, mark, row.tags.includes(mark)) : row.tags.includes(mark)) : false;
  const toggleTag = () => {
    if (mark && row.sessionId && !row.saving) live.toggleTag(row.sessionId, mark, on);
  };
  const press = useLongPress(toggleTag, row.timeOnly ? () => live.unlog(row.key, row.sessionId) : undefined);
  const markLabel = mark ? mark.charAt(0).toUpperCase() + mark.slice(1) : "";

  const label = (
    <>
      <TickCircle on />
      <span className="min-w-0 truncate text-[15px] font-medium text-dusk-text">
        {row.title} · {row.minutes != null ? `${row.minutes} min` : <span className="text-dusk-mute">no time</span>}
      </span>
      {on && (
        <span className="ml-auto flex shrink-0 items-center gap-1 text-[13px] text-dusk-mute">
          {mark === "outdoors" && <Sun className="h-4 w-4" aria-hidden />} {markLabel}
        </span>
      )}
    </>
  );
  return (
    <li className="flex min-h-[56px] items-center gap-3 py-1.5">
      {row.timeOnly ? (
        <button
          type="button"
          aria-pressed
          {...press}
          aria-label={`Undo ${row.title}${row.minutes != null ? `, ${row.minutes} minutes` : ""}${when}${on ? `, ${mark}` : ""}`}
          className={rowClass}
        >
          {label}
        </button>
      ) : (
        <div {...press} className="flex min-h-[44px] min-w-0 flex-1 select-none items-center gap-3 [-webkit-touch-callout:none]">
          {label}
        </div>
      )}
      {mark && row.sessionId && (
        <button type="button" aria-pressed={on} onClick={toggleTag} disabled={row.saving} className={hidden}>
          {markLabel}
        </button>
      )}
    </li>
  );
}
