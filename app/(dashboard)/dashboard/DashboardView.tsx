"use client";

import Link from "next/link";
import { useState } from "react";
import { applyFilter, type DashFilter, type DashRow } from "@/lib/coach/dashboard";
import { cn } from "@/lib/utils";

const STEP = [undefined, "36%", "58%", "80%", "100%"].map((p) => (p ? `color-mix(in srgb, var(--dusk-teal) ${p}, transparent)` : undefined));

/** Four weeks as 4 rows of 7 days (this week last): the heatmap's colours, no labels. */
function Glimpse({ cells }: { cells: number[] }) {
  return (
    <div aria-hidden className="grid w-28 shrink-0 grid-cols-7 gap-[2px]">
      {cells.map((c, i) => (
        <i key={i} className={cn("block aspect-square rounded-[2px]", c === 0 && "bg-ink/[0.07]", c < 0 && "bg-ink/[0.035]")} style={c > 0 ? { background: STEP[c] } : undefined} />
      ))}
    </div>
  );
}

function Card({ r }: { r: DashRow }) {
  const week = r.thisWeek ? `${r.thisWeek.done} of ${r.thisWeek.planned} workouts this week` : "No plan this week";
  return (
    <Link href={`/clients/${r.id}`} className={cn("press block rounded-[20px] border bg-paper p-4", "border-line")} aria-label={`${r.name}, ${r.standing === "overdue" ? "overdue" : r.standing === "no-plan" ? "no plan" : "on track"}, ${week}, last session ${r.lastLabel}`}>
      <div className="flex items-start justify-between gap-3">
        <span className="flex min-w-0 items-center gap-3">
          <span className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-full bg-signal/15 font-semibold text-signal">{r.name.charAt(0)}</span>
          <span className="min-w-0">
            <span className="block truncate text-[17px] font-semibold tracking-[-0.01em] text-ink">{r.name}</span>
            <span className="block truncate text-[13px] text-ink-mute">{[`Last: ${r.lastLabel}`, r.lastWorkout].filter(Boolean).join(" · ")}</span>
          </span>
        </span>
        {/* Overdue is a filter the coach chooses, not a tag on every card. */}
        {r.standing === "on-track" ? (
          <span className="shrink-0 text-[11px] font-bold uppercase tracking-[0.05em] text-signal">On track</span>
        ) : (
          <span className="shrink-0 text-[11px] font-bold uppercase tracking-[0.05em] text-ink-mute">No plan</span>
        )}
      </div>
      <div className="mt-3 flex items-end justify-between gap-3">
        <p className="tnum text-[26px] font-semibold leading-none tracking-[-0.03em] text-ink">
          {r.thisWeek ? `${r.thisWeek.done}/${r.thisWeek.planned}` : "–"}
          <span className="ml-1 text-[13px] font-medium tracking-normal text-ink-mute">this week</span>
        </p>
        <Glimpse cells={r.glimpse} />
      </div>
    </Link>
  );
}

export function DashboardView({ rows }: { rows: DashRow[] }) {
  const [filter, setFilter] = useState<DashFilter>("all");
  const counts = { all: rows.length, overdue: rows.filter((r) => r.standing === "overdue").length, today: rows.filter((r) => r.trainedToday).length };
  const shown = applyFilter(rows, filter);
  const chip = (f: DashFilter, label: string, n: number) => (
    <button key={f} type="button" aria-pressed={filter === f} onClick={() => setFilter(f)} className={cn("press inline-flex h-10 shrink-0 items-center rounded-full border px-3.5 text-[14px] font-semibold", filter === f ? "border-signal bg-signal/15 text-ink" : "border-line-strong text-ink-soft")}>
      {label} {n}
    </button>
  );
  return (
    <div>
      <div className="rise flex items-baseline justify-between gap-3">
        <h1 className="text-4xl leading-none text-ink">Clients</h1>
        <p className="text-[14px] text-ink-soft">{rows.length} active</p>
      </div>
      {rows.length === 0 ? (
        <div className="mt-6 rounded-[20px] border border-line bg-paper p-7 text-center">
          <p className="text-[17px] font-semibold text-ink">No clients yet</p>
          <p className="mt-1 text-[14px] text-ink-mute">Invite your first client, or import a list.</p>
          <Link href="/clients" className="press mt-4 inline-flex h-[52px] w-full max-w-xs items-center justify-center rounded-2xl bg-dusk-button text-[16px] font-semibold text-dusk-button-text">
            Add a client
          </Link>
        </div>
      ) : (
        <>
          <div className="mt-4 flex gap-2" role="group" aria-label="Filter">
            {chip("all", "All", counts.all)}
            {chip("overdue", "Overdue", counts.overdue)}
            {chip("today", "Today", counts.today)}
          </div>
          {shown.length === 0 ? (
            <p className="mt-6 text-center text-[15px] text-ink-soft">{filter === "overdue" ? "Nobody is overdue." : "Nobody has trained today yet."}</p>
          ) : (
            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {shown.map((r) => (
                <Card key={r.id} r={r} />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
