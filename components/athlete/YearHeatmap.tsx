"use client";

import { useMemo, useState } from "react";
import type { CalendarSession } from "@/lib/history/calendar";
import { latestTrained, PHONE_WEEKS, readout, YEAR_WEEKS, yearGrid, type GridCell } from "@/lib/history/year-grid";

/** One accent, four steps. Empty days are a very light gray, future days fainter still. */
const STEP = ["", "36%", "58%", "80%", "100%"].map((p) => (p ? `color-mix(in srgb, var(--dusk-teal) ${p}, transparent)` : undefined));
const EMPTY = "bg-ink/[0.07]";
const FUTURE = "bg-ink/[0.035]";

/**
 * The year of training: weeks as columns, seven day rows (Monday first), small rounded squares with an even 2 px gap, a
 * month name above the first week of each month. Intensity is logged sets in the day (lib/history/year-grid).
 *
 * A desktop shows the whole year. A phone shows the last 26 weeks, right-aligned to today, so cells stay near 12 px and
 * the page never scrolls sideways (the grid is as wide as its box: columns share it equally).
 *
 * Cells are display-only: touching or hovering one writes a one-line readout under the grid, nothing floats.
 */
export function YearHeatmap({ byDay, today, summary }: { byDay: Record<string, CalendarSession[]>; today: string; summary: string }) {
  const grid = useMemo(() => yearGrid(byDay, { today, weeks: YEAR_WEEKS }), [byDay, today]);
  const cells = useMemo(() => new Map(grid.columns.flatMap((c) => c.cells).map((c) => [c.day, c] as const)), [grid]);
  const [picked, setPicked] = useState<string | null>(null);
  const shown: GridCell | null = (picked ? cells.get(picked) : null) ?? latestTrained(grid);
  const hidden = YEAR_WEEKS - PHONE_WEEKS;

  const pick = (e: React.PointerEvent) => {
    const day = (e.target as HTMLElement).dataset.day;
    if (day) setPicked(day);
  };

  return (
    <div className="fade-in w-full md:max-w-4xl">
      <p className="sr-only">{summary}</p>
      <div
        role="img"
        aria-label={summary}
        className="grid auto-cols-fr grid-flow-col gap-[2px] select-none"
        onPointerDown={pick}
        onPointerOver={(e) => e.pointerType === "mouse" && pick(e)}
      >
        {grid.columns.map((col, i) => (
          <div key={col.monday} className={"grid grid-rows-[16px_repeat(7,auto)] gap-[2px]" + (i < hidden ? " max-md:hidden" : "")}>
            <span aria-hidden className="relative block h-4 text-[11px] font-semibold leading-4 text-ink-mute">
              {col.month && <span className="absolute left-0 whitespace-nowrap">{col.month}</span>}
            </span>
            {col.cells.map((c) => (
              <span
                key={c.day}
                data-day={c.day}
                aria-hidden
                className={"block aspect-square rounded-[3px] " + (c.future ? FUTURE : c.level === 0 ? EMPTY : "") + (picked === c.day ? " ring-1 ring-ink" : "")}
                style={c.level > 0 && !c.future ? { background: STEP[c.level] } : undefined}
              />
            ))}
          </div>
        ))}
      </div>
      <p aria-live="polite" className="tnum mt-3 min-h-[22px] text-[14px] text-ink-soft">
        {shown ? readout(shown) : ""}
      </p>
    </div>
  );
}
