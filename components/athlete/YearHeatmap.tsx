"use client";

import { useMemo, useState } from "react";
import { BAND_LABELS, DESKTOP_WEEKS, PHONE_WEEKS, latestTrained, readout, yearGrid, type GridCell, type GridLevel, type HeatDays } from "@/lib/history/year-grid";
import { ModeIcon, MODE_LABEL } from "./HeatIcons";

/** One accent, five bands. Empty days are a very light gray, future days fainter still. */
const BAND: Record<GridLevel, string | undefined> = {
  0: undefined,
  1: "color-mix(in srgb, var(--dusk-teal) 30%, transparent)",
  2: "color-mix(in srgb, var(--dusk-teal) 48%, transparent)",
  3: "color-mix(in srgb, var(--dusk-teal) 66%, transparent)",
  4: "color-mix(in srgb, var(--dusk-teal) 83%, transparent)",
  5: "var(--dusk-teal)",
};
const EMPTY = "bg-ink/[0.07]";
const FUTURE = "bg-ink/[0.035]";
/** The corner icon is dark on the strong bands and light on the pale ones, so it reads on both. */
const iconColor = (l: GridLevel) => (l >= 4 ? "#0f2a27" : "#ece8e1");

/** The challenge ring: a closed circle when the day's rules were met, a circle with a gap when not. */
function Ring({ met }: { met: boolean }) {
  const r = 10.4;
  const c = 2 * Math.PI * r;
  return (
    <svg viewBox="0 0 24 24" className="pointer-events-none absolute inset-0 h-full w-full overflow-visible" aria-hidden>
      <circle
        cx="12"
        cy="12"
        r={r}
        fill="none"
        stroke="#f1e9de"
        strokeWidth="1.6"
        strokeLinecap="round"
        {...(met ? {} : { strokeDasharray: `${(c * 0.72).toFixed(1)} ${(c * 0.28).toFixed(1)}`, transform: "rotate(-70 12 12)" })}
      />
    </svg>
  );
}

/**
 * The year of training, v3: weeks as columns, seven day rows (Monday first). Colour is the work done that day (sets, and minutes of cardio, walking and mobility, as one number) in five
 * fixed bands; the corner icon is how it was done; a ring marks a running challenge's days (closed when met, open when not).
 *
 * A desktop shows 26 weeks and a phone the last 13, right-aligned to today, so each cell is about 24 px and can carry an
 * icon and a ring and still read. The grid is as wide as its box: no sideways scroll.
 *
 * Cells are display-only: touching or hovering one writes a one-line readout under the grid, nothing floats.
 */
export function YearHeatmap({ byDay, today, summary, challenge }: { byDay: HeatDays; today: string; summary: string; challenge: string | null }) {
  const grid = useMemo(() => yearGrid(byDay, { today, weeks: DESKTOP_WEEKS }), [byDay, today]);
  const cells = useMemo(() => new Map(grid.columns.flatMap((c) => c.cells).map((c) => [c.day, c] as const)), [grid]);
  const [picked, setPicked] = useState<string | null>(null);
  const shown: GridCell | null = (picked ? cells.get(picked) : null) ?? latestTrained(grid);
  const hidden = DESKTOP_WEEKS - PHONE_WEEKS;
  const info = challenge ? { name: challenge, today } : null;

  const pick = (e: React.PointerEvent) => {
    const day = (e.target as HTMLElement).closest<HTMLElement>("[data-day]")?.dataset.day;
    if (day) setPicked(day);
  };

  return (
    <div className="fade-in w-full md:max-w-4xl">
      <p className="sr-only">{summary}</p>
      <div role="img" aria-label={summary} className="grid auto-cols-fr grid-flow-col gap-[3px] select-none" onPointerDown={pick} onPointerOver={(e) => e.pointerType === "mouse" && pick(e)}>
        {grid.columns.map((col, i) => (
          <div key={col.monday} className={"grid grid-rows-[16px_repeat(7,auto)] gap-[3px]" + (i < hidden ? " max-md:hidden" : "")}>
            <span aria-hidden className="relative block h-4 text-[11px] font-semibold leading-4 text-ink-mute">
              {col.month && <span className="absolute left-0 whitespace-nowrap">{col.month}</span>}
            </span>
            {col.cells.map((c) => (
              <span
                key={c.day}
                data-day={c.day}
                aria-hidden
                className={"relative block aspect-square rounded-[4px] " + (c.future ? FUTURE : c.level === 0 ? EMPTY : "") + (picked === c.day ? " outline outline-1 outline-offset-1 outline-ink" : "")}
                style={c.level > 0 && !c.future ? { background: BAND[c.level] } : undefined}
              >
                {c.mode && <ModeIcon mode={c.mode} color={iconColor(c.level)} className={"pointer-events-none absolute right-[8%] top-[8%] block h-[38%] " + (c.mode === "M" ? "w-[56%]" : "w-[38%]")} />}
                {c.ring && <Ring met={c.ring === "met"} />}
              </span>
            ))}
          </div>
        ))}
      </div>
      <p aria-live="polite" className="tnum mt-3 min-h-[22px] text-[14px] text-ink-soft">
        {shown ? readout(shown, info) : ""}
      </p>
      <Legend challenge={challenge} />
    </div>
  );
}

/** What the colours, icons and rings mean. Shown the way a map key is: small, below the grid. */
function Legend({ challenge }: { challenge: string | null }) {
  const row = "flex flex-wrap items-center gap-x-4 gap-y-1.5";
  return (
    <div className="mt-4 space-y-2 text-[11px] text-ink-mute">
      <div className={row}>
        <span>work</span>
        {([1, 2, 3, 4, 5] as const).map((l) => (
          <span key={l} className="inline-flex items-center gap-1.5">
            <i className="inline-block h-[11px] w-[11px] rounded-[3px]" style={{ background: BAND[l] }} />
            {BAND_LABELS[l - 1]}
          </span>
        ))}
      </div>
      <div className={row}>
        {(["S", "R", "W", "M"] as const).map((m) => (
          <span key={m} className="inline-flex items-center gap-1.5">
            <ModeIcon mode={m} color="currentColor" className={"block h-3 " + (m === "M" ? "w-5" : "w-3")} />
            {MODE_LABEL[m]}
          </span>
        ))}
      </div>
      {challenge && (
        <div className={row}>
          <span className="inline-flex items-center gap-1.5">
            <span className="relative inline-block h-[14px] w-[14px] text-ink">
              <Ring met />
            </span>
            {challenge} day met
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="relative inline-block h-[14px] w-[14px] text-ink">
              <Ring met={false} />
            </span>
            not met
          </span>
        </div>
      )}
    </div>
  );
}
