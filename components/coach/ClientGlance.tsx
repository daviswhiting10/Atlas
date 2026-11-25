"use client";

import { useState } from "react";
import { barTip, type DayBar, type Stat } from "@/lib/coach/glance";
import { SessionSheet } from "@/components/athlete/SessionSheet";
import { clientSessionSummary } from "@/lib/actions/workout-logger";

/**
 * The client page's first glance, quiet on purpose: the last 30 days as small bars (sets a day), then one row of numbers
 * (this week, sessions, strength). Hover a bar (a mouse) for its date, workout and sets; tap or click one to open that session.
 */
export function ClientGlance({ days, stats }: { days: DayBar[]; stats: Stat[] }) {
  const max = Math.max(1, ...days.map((d) => d.sets));
  const total = days.reduce((n, d) => n + d.sets, 0);
  const [tip, setTip] = useState<number | null>(null);
  const [open, setOpen] = useState<DayBar | null>(null);
  /** The index of the day under a pointer, or null when that day has no session. */
  const dayAt = (e: React.PointerEvent<HTMLElement> | React.MouseEvent<HTMLElement>): number | null => {
    const r = e.currentTarget.getBoundingClientRect();
    const i = Math.min(days.length - 1, Math.max(0, Math.floor(((e.clientX - r.left) / r.width) * days.length)));
    return days[i].sessions.length > 0 ? i : null;
  };
  return (
    <section aria-label="Last 30 days" className="mb-5 sm:max-w-md">
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-[12px] font-semibold uppercase tracking-[0.1em] text-ink-mute">Last 30 days</p>
        <p className="text-[12px] text-ink-mute">{total} sets</p>
      </div>
      <div className="relative mt-2" onPointerLeave={() => setTip(null)}>
        <svg role="img" aria-label={`Sets a day, last 30 days: ${total} in all`} viewBox="0 0 300 48" preserveAspectRatio="none" className="h-12 w-full text-signal">
          {days.map((d, i) => {
            const h = d.sets === 0 ? 2 : Math.max(5, (d.sets / max) * 44);
            return <rect key={d.day} x={i * 10 + 1.5} y={46 - h} width={7} height={h} rx={2} fill="currentColor" opacity={d.sets === 0 ? 0.18 : 1} />;
          })}
        </svg>
        {/* One touch surface over the chart. The day under the pointer is worked out from its position, so a tap beside a bar
            never lands on a neighbour (a row of small buttons gets "helped" onto the nearest one by touch screens). */}
        <div
          className={tip != null ? "absolute inset-0 cursor-pointer" : "absolute inset-0"}
          onPointerMove={(e) => e.pointerType === "mouse" && setTip(dayAt(e))}
          onClick={(e) => {
            const i = dayAt(e);
            if (i != null) setOpen(days[i]);
          }}
        />
        {tip != null && (
          <div
            role="tooltip"
            className="tnum pointer-events-none absolute bottom-full z-10 mb-1 whitespace-nowrap rounded-lg border border-line-strong bg-bone px-2.5 py-1.5 text-[13px] text-ink shadow-lg"
            style={{ left: `${((tip + 0.5) / days.length) * 100}%`, transform: `translateX(-${Math.min(100, Math.max(0, ((tip + 0.5) / days.length) * 100))}%)` }}
          >
            {barTip(days[tip])}
          </div>
        )}
      </div>
      <p className="mt-3 flex flex-wrap items-baseline gap-x-5 gap-y-1">
        {stats.map((s) => (
          <span key={s.label} className="text-[14px] text-ink-soft">
            <span className="tnum mr-1 text-[17px] font-semibold text-ink">{s.value}</span>
            {s.label}
          </span>
        ))}
      </p>
      {/* For a keyboard or a screen reader: the same days, as buttons. */}
      <div className="sr-only">
        {days.filter((d) => d.sessions.length > 0).map((d) => (
          <button key={d.day} type="button" onClick={() => setOpen(d)}>
            {barTip(d)}
          </button>
        ))}
      </div>
      {open && (
        <SessionSheet
          eyebrow={new Date(`${open.day}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric", timeZone: "UTC" })}
          sessions={open.sessions}
          load={clientSessionSummary}
          onClose={() => setOpen(null)}
        />
      )}
    </section>
  );
}
