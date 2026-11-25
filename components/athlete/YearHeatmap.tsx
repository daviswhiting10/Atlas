"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { BAND_LABELS, DESKTOP_STEP, hasEarlier, PHONE_STEP, PHONE_WEEKS, rangeLabel, readout, YEAR_WEEKS, yearGrid, type GridCell, type GridLevel, type HeatDays } from "@/lib/history/year-grid";
import { cn } from "@/lib/utils";
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

/**
 * The year of training, v3: weeks as columns, seven day rows (Monday first). Colour is the work done that day (sets, and minutes of cardio, walking and mobility, as one number) in five
 * fixed bands; the corner icon is how it was done.
 *
 * A desktop shows the whole year; a phone the last 13 weeks (three months), right-aligned, so the squares are big enough
 * to hit and stay off the screen edge. Arrows above the grid move the window back (and forward again), a phone by its
 * 13 weeks and a desktop by a year. The grid is as wide as its box: columns share it equally, no sideways scroll.
 *
 * Colour is the answer: there is no line of text under the grid. Touching or hovering a day opens a small tooltip over it
 * with that day's detail (the same words, "Tue Nov 11 · Lower A · 14 sets").
 */
export function YearHeatmap({ byDay, today, summary, onOpenDay }: { byDay: HeatDays; today: string; summary: string; /** A tap (or click) on a day that already shows its tooltip opens that day's sessions. */ onOpenDay?: (day: string) => void }) {
  const [back, setBack] = useState(0);
  const grid = useMemo(() => yearGrid(byDay, { today, weeks: YEAR_WEEKS, back }), [byDay, today, back]);
  const cells = useMemo(() => new Map(grid.columns.flatMap((c) => c.cells).map((c) => [c.day, c] as const)), [grid]);
  const [tip, setTip] = useState<{ day: string; x: number; y: number; w: number } | null>(null);
  const [touch, setTouch] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const hidden = YEAR_WEEKS - PHONE_WEEKS;
  const cols = grid.columns;
  const last = cols[cols.length - 1].monday;
  const shown: GridCell | null = tip ? (cells.get(tip.day) ?? null) : null;

  // A tap anywhere else closes the tooltip.
  useEffect(() => {
    if (!tip) return;
    const away = (e: PointerEvent) => {
      if (!(e.target as HTMLElement).closest?.("[data-day]")) setTip(null);
    };
    document.addEventListener("pointerdown", away);
    return () => document.removeEventListener("pointerdown", away);
  }, [tip]);

  const pick = (e: React.PointerEvent) => {
    const el = (e.target as HTMLElement).closest<HTMLElement>("[data-day]");
    const wrap = box.current;
    if (!el || !wrap) return;
    const day = el.dataset.day!;
    setTouch(e.pointerType !== "mouse");
    // The tooltip first (a mouse has it from hovering, a finger from the first tap); the same day again opens its sessions.
    const c = cells.get(day);
    if (onOpenDay && tip?.day === day && c && !c.future && c.titles.length > 0) {
      setTip(null);
      return void onOpenDay(day);
    }
    const r = el.getBoundingClientRect();
    const w = wrap.getBoundingClientRect();
    setTip({ day, x: r.left - w.left + r.width / 2, y: r.top - w.top, w: w.width });
  };

  const go = (dir: 1 | -1) => {
    const wide = typeof window !== "undefined" && window.matchMedia("(min-width: 768px)").matches;
    setBack((b) => Math.max(0, b + dir * (wide ? DESKTOP_STEP : PHONE_STEP)));
    setTip(null);
  };

  /** The arrows and the period they show, for one size (the phone's three months, or the desktop's year). */
  const nav = (first: number, cls: string) => (
    <div className={cn("mb-2 items-center justify-between", cls)}>
      <button type="button" onClick={() => go(1)} disabled={!hasEarlier(byDay, cols[first].monday)} aria-label="Earlier" className="press flex h-11 w-11 items-center justify-center rounded-full text-ink-soft disabled:opacity-25">
        <ChevronLeft className="h-5 w-5" />
      </button>
      <span className="text-[13px] font-medium text-ink-soft">{rangeLabel(cols[first].monday, last)}</span>
      <button type="button" onClick={() => go(-1)} disabled={back === 0} aria-label="Later" className="press flex h-11 w-11 items-center justify-center rounded-full text-ink-soft disabled:opacity-25">
        <ChevronRight className="h-5 w-5" />
      </button>
    </div>
  );

  return (
    <div className="fade-in w-full md:max-w-4xl">
      <p className="sr-only">{summary}</p>
      {nav(hidden, "flex md:hidden")}
      {nav(0, "hidden md:flex")}
      <div ref={box} className="relative">
        <div
          role="img"
          aria-label={summary}
          className="grid auto-cols-fr grid-flow-col gap-[2px] select-none"
          onPointerDown={pick}
          onPointerOver={(e) => e.pointerType === "mouse" && pick(e)}
          onPointerLeave={(e) => e.pointerType === "mouse" && setTip(null)}
        >
          {cols.map((col, i) => (
            <div key={col.monday} className={"grid grid-rows-[16px_repeat(7,auto)] gap-[2px]" + (i < hidden ? " max-md:hidden" : "")}>
              <span aria-hidden className="relative block h-4 text-[11px] font-semibold leading-4 text-ink-mute">
                {col.month && <span className="absolute left-0 whitespace-nowrap">{col.month}</span>}
              </span>
              {col.cells.map((c) => (
                <span
                  key={c.day}
                  data-day={c.day}
                  aria-hidden
                  className={"relative block aspect-square rounded-[3px] " + (c.future ? FUTURE : c.level === 0 ? EMPTY : "") + (tip?.day === c.day ? " outline outline-1 outline-offset-1 outline-ink" : "")}
                  style={c.level > 0 && !c.future ? { background: BAND[c.level] } : undefined}
                >
                  {c.mode && <ModeIcon mode={c.mode} color={iconColor(c.level)} className={"pointer-events-none absolute right-[8%] top-[8%] block h-[38%] " + (c.mode === "M" ? "w-[56%]" : "w-[38%]")} />}
                </span>
              ))}
            </div>
          ))}
        </div>
        {tip && shown && (
          <div
            role="tooltip"
            className="tnum pointer-events-none absolute z-10 -mt-1.5 whitespace-nowrap rounded-lg border border-line-strong bg-bone px-2.5 py-1.5 text-[13px] text-ink shadow-lg"
            // Centred over the day, and slid toward the nearer edge so it never leaves the box.
            style={{ left: tip.x, top: tip.y, transform: `translate(-${(tip.x / tip.w) * 100}%, -100%)` }}
          >
            {readout(shown)}
            {onOpenDay && !shown.future && shown.titles.length > 0 && <span className="ml-2 text-ink-mute">{touch ? "Tap again to open" : "Click to open"}</span>}
          </div>
        )}
      </div>
      <p aria-live="polite" className="sr-only">
        {shown ? readout(shown) : ""}
      </p>
      <Legend />
    </div>
  );
}

/** What the colours and icons mean. Shown the way a map key is: small, below the grid. */
function Legend() {
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
    </div>
  );
}
