"use client";

import { TickCircle } from "./TickCircle";
import { useTodayLive } from "./TodayLive";
import { WorkoutRows } from "./WorkoutRows";

/**
 * The day's checklist: the workout rows, then the daily ticks. A tap shows at once and is saved in the
 * background; if the save fails it is put back with a quiet note (state and saving: TodayLive.tsx).
 * Must sit inside <TodayLive>.
 */
export function GoalChecklist() {
  const live = useTodayLive();
  if (!live) return null;
  const { view, ticked, toggleTick } = live;

  return (
    <div>
      {view.behind && (
        <div className="dusk-panel mb-4 text-[14px] text-dusk-soft">
          <p className="flex items-center gap-2 font-medium text-dusk-text">
            <span className="h-1.5 w-1.5 rounded-full bg-dusk-peach" aria-hidden /> Yesterday is still open
          </p>
          <ul className="mt-1 divide-y divide-dusk-line">
            {/* Yesterday's workouts are the same one-tap rows as today's (dated to yesterday), while a workout rule is still open. */}
            {view.behind.workout && view.behind.items.some((i) => i.kind === "sessions") && <WorkoutRows which="yesterday" />}
            {view.behind.items.map((it) =>
              it.kind === "check_in" ? (
                <li key={it.key}>
                  <button type="button" onClick={() => toggleTick(it.key, view.behind!.day, ticked(it.key, "open", view.behind!.day))} className="dusk-row flex min-h-[44px] w-full items-center gap-3 text-left">
                    <TickCircle on={ticked(it.key, "open", view.behind!.day)} />
                    <span>{it.label}</span>
                  </button>
                </li>
              ) : view.behind!.workout ? null : (
                <li key={it.key} className="flex min-h-[44px] items-center gap-3">
                  <span className="h-8 w-8 shrink-0" /> <span>{it.label}: log it for yesterday.</span>
                </li>
              )
            )}
          </ul>
        </div>
      )}

      <ul className="divide-y divide-dusk-line">
        <WorkoutRows />
        {view.rules.map((r) => {
          if (r.kind === "check_in") {
            const on = ticked(r.key, r.state, view.today);
            return (
              <li key={r.key}>
                <button type="button" aria-pressed={on} onClick={() => toggleTick(r.key, view.today, on)} className="dusk-row flex min-h-[56px] w-full items-center gap-3 py-3 text-left">
                  <TickCircle on={on} />
                  <span className="text-[15px] font-medium text-dusk-text">{r.label}</span>
                </button>
              </li>
            );
          }
          // The workout rows cover the workout rules. A goal with workouts but no plain per-day rule shows them as they are.
          if (view.workout) return null;
          return (
            <li key={r.key} className="flex min-h-[56px] items-center gap-3 py-3">
              <TickCircle on={r.state === "met"} needs={r.state === "needs_duration"} />
              <span className="min-w-0 flex-1 text-[15px] font-medium text-dusk-text">{r.label}</span>
              <span className="text-[13px] tabular-nums text-dusk-mute">
                {r.have} of {r.need}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
