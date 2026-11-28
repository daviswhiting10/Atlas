"use client";

import { useState } from "react";
import Link from "next/link";
import { Check, Plus, ChevronLeft, ChevronRight, Dumbbell, Footprints, PersonStanding } from "lucide-react";
import type { PlanOverview, WorkoutSummary } from "@/lib/plan/overview";
import { cueOf } from "@/lib/plan/up-next";
import { addDays, defaultDay, openingMonday, planWeekOf, weekBounds, weekGrid, weekRange, type DayCell, type DayItem } from "@/lib/plan/week-grid";
import { cn } from "@/lib/utils";
import type { SessionSummary } from "@/lib/actions/athlete";
import { SessionMini, type ChangeDate, type SlotWeek } from "@/components/athlete/SessionMini";
import { slotsByWeek } from "@/lib/sessions/reassign";

const DOW = ["M", "T", "W", "T", "F", "S", "S"];
const KIND_LABEL = { strength: "strength", cardio: "cardio", mobility: "mobility" } as const;

/** The day's icon: a dumbbell, a shoe, a stretch, or (an open day) a dot. */
function DayIcon({ kind, className }: { kind: DayCell["kind"]; className?: string }) {
  if (kind === "cardio") return <Footprints className={cn("h-5 w-5 text-signal", className)} aria-hidden />;
  if (kind === "mobility") return <PersonStanding className={cn("h-5 w-5 text-signal", className)} aria-hidden />;
  if (kind === "strength") return <Dumbbell className={cn("h-5 w-5 text-signal", className)} aria-hidden />;
  return <span aria-hidden className="flex h-5 w-5 items-center justify-center"><span className="h-1.5 w-1.5 rounded-full bg-current" /></span>;
}
const SHOWN = 3;
const longDay = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
const rx = (e: WorkoutSummary["exercises"][number]) => `${e.sets} × ${e.reps}${e.weight != null ? ` at ${e.weight}` : ""}`;
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;

/**
 * The Plan tab's first screen: the calendar week, Monday to Sunday (day number, an icon, done days ticked, the next workout
 * outlined, today dotted), above the tapped day's cards. Workouts sit on their dates; a done one on the day it was really
 * logged. It opens on today's week. The grid never scrolls.
 */
export function PlanWeek({ plan, today, timeZone = "UTC", totalWeeks, base = "", summary, deleteSession, changeDate, reassign }: { plan: PlanOverview; today: string; /** The athlete's timezone: a session is drawn on its day there. */ timeZone?: string; totalWeeks: number; /** A logged day's mini summary (the real one, or the demo's). */ summary?: (id: string) => Promise<SessionSummary | null>; /** Change the calendar day a logged session was done on (not in the demo). */ changeDate?: ChangeDate; /** Delete a logged session (not in the demo). */ deleteSession?: (raw: { workoutLogId: string }) => Promise<{ ok: true } | { ok: false; error: string }>; /** Move a logged session to another day of the plan. */ reassign?: (raw: { workoutLogId: string; toAssignedWorkoutId: string }) => Promise<{ ok: true } | { ok: false; error: string }>; /** Prefix for links ("/demo" keeps the demo inside /demo). */ base?: string }) {
  const [monday, setMonday] = useState(() => openingMonday(plan, today, timeZone));
  const grid = weekGrid(plan, monday, today, timeZone);
  const bounds = weekBounds(plan, today, timeZone);
  // Labelled by the plan week its Monday falls in (a plan that starts on a Saturday has its weeks run Saturday to Friday).
  const week = planWeekOf(monday, plan.startDate, totalWeeks);
  const thisWeek = monday <= today && today < addDays(monday, 7);
  const [pick, setPick] = useState<number | null>(null);
  const cells = grid?.cells ?? [];
  const sel = cells.length ? (pick != null && pick < cells.length ? pick : defaultDay(cells)) : 0;
  const cell = cells[sel];
  const go = (k: number) => {
    setMonday(addDays(monday, 7 * k));
    setPick(null);
  };

  return (
    <div className="max-w-xl">
      <div className="mb-3 flex items-center justify-between gap-2">
        <button type="button" onClick={() => go(-1)} disabled={monday <= bounds.first} aria-label="Previous week" className="press flex h-11 w-11 items-center justify-center rounded-full border border-line text-ink-soft disabled:opacity-30">
          <ChevronLeft className="h-5 w-5" />
        </button>
        <p className="text-center text-[15px] font-semibold leading-tight text-ink">
          {weekRange(monday)}
          {(week != null || thisWeek) && (
            <span className="block text-[12px] font-medium text-ink-mute">{[week != null && `Week ${week} of ${totalWeeks}`, thisWeek && "This week"].filter(Boolean).join(" · ")}</span>
          )}
        </p>
        <button type="button" onClick={() => go(1)} disabled={monday >= bounds.last} aria-label="Next week" className="press flex h-11 w-11 items-center justify-center rounded-full border border-line text-ink-soft disabled:opacity-30">
          <ChevronRight className="h-5 w-5" />
        </button>
      </div>

      {grid ? (
        <>
          <div className="grid grid-cols-7 gap-1.5" role="group" aria-label={`Week of ${weekRange(monday)}`}>
            {DOW.map((d, i) => (
              <span key={i} className="text-center text-[11px] font-bold uppercase tracking-[0.08em] text-ink-mute">
                {d}
              </span>
            ))}
            {cells.map((c) => (
              <DayButton key={c.date} c={c} selected={c.index === sel} onPick={() => setPick(c.index)} />
            ))}
          </div>
          <p className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-ink-mute">
            <span className="inline-flex items-center gap-1"><DayIcon kind="strength" className="h-3.5 w-3.5" /> Strength</span>
            <span className="inline-flex items-center gap-1"><DayIcon kind="cardio" className="h-3.5 w-3.5" /> Cardio</span>
            <span className="inline-flex items-center gap-1"><DayIcon kind="mobility" className="h-3.5 w-3.5" /> Mobility</span>
            <span className="inline-flex items-center gap-1"><DayIcon kind={null} className="h-3.5 w-3.5" /> Open</span>
            <span className="inline-flex items-center gap-1"><span className="h-3 w-3 rounded border-2 border-signal" /> Up next</span>
            <span className="inline-flex items-center gap-1"><Check className="h-3.5 w-3.5 text-signal" /> Done</span>
          </p>
          {cell.items.length === 0 ? (
            <OpenCard cell={cell} base={base} />
          ) : (
            cell.items.map((item, i) => (
              <DayCard key={item.workout.id} cell={cell} item={item} first={i === 0} base={base} today={today} summary={summary} deleteSession={deleteSession} changeDate={changeDate} reassign={reassign} weeks={slotsByWeek(plan.workouts, item.workout.id)} />
            ))
          )}
        </>
      ) : (
        <p className="rise mt-6 rounded-2xl border border-line bg-paper p-4 text-[15px] text-ink-soft">Nothing planned this week.</p>
      )}

      <div className="mt-1.5 flex items-center justify-between">
        <Link href={`${base}/plan?view=all`} className="press inline-flex min-h-11 items-center text-[14px] font-medium text-ink-soft">
          All {totalWeeks} weeks
        </Link>
      </div>
    </div>
  );
}

function DayButton({ c, selected, onPick }: { c: DayCell; selected: boolean; onPick: () => void }) {
  const done = c.done;
  const what = c.items.map((x) => `${x.workout.name} (${KIND_LABEL[x.kind]})${x.done ? ", done" : x.upNext ? ", up next" : ""}`).join("; ");
  const label = `${longDay(c.date)}${c.items.length ? `, ${what}` : ", open"}${c.today ? ", today" : ""}`;
  return (
    <button
      type="button"
      onClick={onPick}
      aria-label={label}
      aria-pressed={selected}
      className={cn(
        "press relative flex h-[76px] flex-col items-center justify-between rounded-[14px] border py-2",
        c.items.length === 0 && "border-dashed border-line bg-transparent text-ink-mute",
        c.items.length > 0 && !done && "border-line bg-paper text-ink",
        done && "border-signal/35 bg-signal/10 text-ink",
        c.upNext && "border-2 border-signal",
        selected && "ring-2 ring-signal ring-offset-2 ring-offset-bone"
      )}
    >
      {done && (
        <span className="absolute -right-1 -top-1.5 flex h-[18px] w-[18px] items-center justify-center rounded-full bg-signal text-dusk-button-text">
          <Check className="h-3 w-3" strokeWidth={3.5} />
        </span>
      )}
      <span className="tnum text-[15px] font-semibold">{Number(c.date.slice(8))}</span>
      {/* Two or more on one day: the first one's icon and how many. */}
      <span className="flex items-center gap-0.5">
        <DayIcon kind={c.kind} />
        {c.items.length > 1 && <span className="tnum text-[11px] font-bold leading-none">{c.items.length}</span>}
      </span>
      {c.today && <span aria-hidden className="absolute -bottom-2.5 h-1.5 w-1.5 rounded-full bg-signal" />}
    </button>
  );
}

function OpenCard({ cell, base }: { cell: DayCell; base: string }) {
  return (
    <section aria-label="Day" className="rise mt-6 rounded-2xl border border-line bg-paper p-4">
      {/* Not on the plan isn't a rest day: the plan only says which days have a workout. */}
      <p className="eyebrow">{`${longDay(cell.date)} · Open`}</p>
      <Link href={`${base}/workouts/new`} className="press mt-2 flex h-[52px] w-full items-center justify-center gap-1.5 rounded-2xl border border-line-strong text-[16px] font-semibold text-ink">
        <Plus className="h-4 w-4" /> Log a workout
      </Link>
    </section>
  );
}

/** One workout on the tapped day: a done one's mini summary (View session, delete, move), or a planned one's lifts and Start. */
function DayCard({ cell, item, first, weeks, reassign, base, today, summary, deleteSession, changeDate }: { changeDate?: ChangeDate; cell: DayCell; item: DayItem; first: boolean; base: string; today: string; weeks: SlotWeek[]; reassign?: (raw: { workoutLogId: string; toAssignedWorkoutId: string }) => Promise<{ ok: true } | { ok: false; error: string }>; summary?: (id: string) => Promise<SessionSummary | null>; deleteSession?: (raw: { workoutLogId: string }) => Promise<{ ok: true } | { ok: false; error: string }> }) {
  const w = item.workout;
  const eyebrow = (s: string) => <p className="eyebrow">{`${longDay(cell.date)} · ${s}`}</p>;
  const done = item.done;
  const meta = `${plural(w.exercises.length, "exercise")} · ~${w.estMinutes} min`;
  return (
    <section aria-label={item.upNext ? "Up next" : "Day"} className={cn("rise rounded-2xl border border-line bg-paper p-4", first ? "mt-6" : "mt-3")}>
      {eyebrow(done ? "Done" : item.upNext ? "Up next" : cell.date < today ? "Not done" : "Planned")}
      <p className="mt-1 text-[22px] font-semibold leading-tight text-ink">
        {w.name}
        {w.deload && <span className="ml-2 inline-block rounded-full bg-ink px-2 py-0.5 align-middle text-[10px] font-bold uppercase tracking-[0.06em] text-paper">Lighter week</span>}
      </p>
      <p className="mt-0.5 text-[13px] text-ink-mute">{meta}</p>
      {done && w.logId && summary ? (
        <SessionMini logId={w.logId} href={`${base}/workouts/${w.id}`} load={summary} remove={deleteSession} changeDate={changeDate} day={cell.date} move={reassign} weeks={weeks} />
      ) : (
        <>
      <ul className="mb-3.5 mt-3">
          {w.exercises.slice(0, SHOWN).map((e, i) => {
            const cue = cueOf(e.note);
            return (
              <li key={`${e.aweId}-${i}`} className="border-t border-line py-2 text-[14px] text-ink-soft first:border-t-0">
                <div className="flex justify-between gap-3">
                  <span className="min-w-0 truncate">{e.name}</span>
                  <span className="tnum shrink-0">{rx(e)}</span>
                </div>
                {cue && <p className="mt-0.5 text-[13px] leading-snug text-ink-mute">{cue}</p>}
              </li>
            );
          })}
          {w.exercises.length > SHOWN && <li className="border-t border-line py-2 text-[14px] text-ink-soft">+ {w.exercises.length - SHOWN} more</li>}
        </ul>
        <Link
          href={`${base}/workouts/${w.id}`}
          // Only the tapped day's card is on screen, so this is one prefetch per day picked: the logger opens at the tap.
          prefetch
          className={cn(
            "press flex h-[52px] w-full items-center justify-center rounded-2xl text-[17px] font-semibold",
            // Any day that isn't done can be started: past, today or ahead. Only a finished one is a quiet "View session".
            done ? "border border-line-strong text-ink" : "bg-dusk-button text-dusk-button-text hover:brightness-110"
          )}
        >
          {done ? "View session" : "Start"}
        </Link>
        </>
      )}
    </section>
  );
}
