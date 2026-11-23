"use client";

import { useState } from "react";
import { setTimeUnit, type SheetGrid, type TimedRow } from "@/lib/programs/sheet-plan";

/**
 * The import preview's timed exercises, in minutes. A time whose unit wasn't written
 * ("Bike 15", "15m") was read as minutes; it shows a min / s choice so it can be fixed
 * before saving. Choosing rewrites that exercise's cells in the grid that goes back to save.
 */
export function TimesList({ times, grid, onGrid }: { times: TimedRow[]; grid: unknown; onGrid: (g: unknown) => void }) {
  const [chosen, setChosen] = useState<Record<string, "min" | "s">>({});
  if (times.length === 0) return null;
  const pick = (t: TimedRow, unit: "min" | "s") => {
    setChosen((c) => ({ ...c, [`${t.day}:${t.exercise}`]: unit }));
    onGrid(setTimeUnit(grid as SheetGrid, t.day, t.exercise, unit));
  };
  return (
    <div className="rounded-xl border border-line px-3.5 py-3 text-[13px]" aria-label="Times">
      <p className="font-semibold text-ink">Times</p>
      <ul className="mt-1 space-y-1 text-ink-soft">
        {times.map((t) => {
          const key = `${t.day}:${t.exercise}`;
          const unit = chosen[key];
          const shown = unit === "s" ? t.time.replace(/(\d+) min$/, (_, n) => `${n} s`) : t.time;
          return (
            <li key={key} className="flex min-h-11 items-center justify-between gap-3">
              <span className="tnum">
                {t.name}: {shown}
                {t.unclear && !unit && <span className="block text-[12px] text-warn">No unit written. Read as minutes.</span>}
              </span>
              {t.unclear && (
                <span role="group" aria-label={`${t.name}: minutes or seconds`} className="flex shrink-0 overflow-hidden rounded-lg border border-line">
                  {(["min", "s"] as const).map((u) => (
                    <button
                      key={u}
                      type="button"
                      aria-pressed={(unit ?? "min") === u}
                      onClick={() => pick(t, u)}
                      className={`press min-h-11 min-w-11 px-2 text-[13px] font-medium ${(unit ?? "min") === u ? "bg-ink text-paper" : "text-ink-soft"}`}
                    >
                      {u}
                    </button>
                  ))}
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
