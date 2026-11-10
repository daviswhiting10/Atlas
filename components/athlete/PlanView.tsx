"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { ArrowRight, Check, ChevronDown, Clock, Dumbbell, Loader2, RotateCcw, SkipForward } from "lucide-react";
import { toast } from "sonner";
import type { PlanOverview, WorkoutSummary } from "@/lib/athlete/data";
import { setWorkoutSkipped } from "@/lib/actions/athlete";
import { cn } from "@/lib/utils";

function WorkoutCard({ w, isNext, open, onToggle }: { w: WorkoutSummary; isNext: boolean; open: boolean; onToggle: () => void }) {
  const [pending, start] = useTransition();
  const logged = w.status === "LOGGED";
  const skipped = w.status === "SKIPPED";

  function toggleSkip() {
    start(async () => {
      try {
        await setWorkoutSkipped({ assignedWorkoutId: w.id, skipped: !skipped });
        toast.success(skipped ? "Back in your plan" : "Skipped — the next workout moves up");
      } catch {
        toast.error("Couldn't update that workout.");
      }
    });
  }

  return (
    <div className={cn("surface overflow-hidden transition-shadow", isNext && "ring-2 ring-blue/30")}>
      <button type="button" onClick={onToggle} aria-expanded={open} className="flex w-full items-center gap-3.5 p-4 text-left sm:p-5">
        <span
          className={cn(
            "flex h-11 w-11 shrink-0 items-center justify-center rounded-full",
            logged ? "bg-blue text-white" : isNext ? "bg-blue/10 text-blue" : "bg-ink/5 text-ink-mute"
          )}
        >
          {logged ? <Check className="h-5 w-5" strokeWidth={3} /> : skipped ? <SkipForward className="h-[18px] w-[18px]" /> : <Dumbbell className="h-[18px] w-[18px]" />}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2">
            <span className={cn("truncate text-base font-semibold", skipped ? "text-ink-mute line-through" : "text-ink")}>{w.name}</span>
            {isNext && <span className="shrink-0 rounded-full bg-blue px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">Up next</span>}
          </span>
          <span className="tnum mt-0.5 flex items-center gap-2 text-[13px] text-ink-mute">
            {logged ? "Logged" : skipped ? "Skipped" : `${w.exercises.length} exercises`}
            <span className="flex items-center gap-1">
              <Clock className="h-3 w-3" /> ~{w.estMinutes} min
            </span>
          </span>
        </span>
        <ChevronDown className={cn("h-5 w-5 shrink-0 text-ink-mute transition-transform duration-200", open && "rotate-180")} />
      </button>

      {open && (
        <div className="fade-in border-t border-line px-4 pb-4 pt-3 sm:px-5 sm:pb-5">
          {w.note && <p className="mb-3 rounded-xl bg-gold/10 px-3 py-2 text-[13px] text-ink-soft">{w.note}</p>}
          <ol className="space-y-2">
            {w.exercises.map((e, i) => (
              <li key={`${e.name}-${i}`} className="flex items-baseline gap-3 text-[15px]">
                <span className="tnum w-4 shrink-0 text-[13px] text-ink-mute">{i + 1}</span>
                <span className="min-w-0 flex-1 truncate text-ink">{e.name}</span>
                <span className="tnum shrink-0 text-ink-mute">
                  {e.sets} × {e.reps}
                </span>
              </li>
            ))}
          </ol>
          <div className="mt-4 flex gap-2">
            <Link
              href={`/workouts/${w.id}`}
              className={cn(
                "press flex h-12 flex-1 items-center justify-center gap-2 rounded-xl text-[15px] font-semibold",
                logged ? "border border-line bg-white text-ink hover:border-ink/20" : "bg-blue text-white hover:bg-blue-deep"
              )}
            >
              {logged ? "Review workout" : "Start this workout"} <ArrowRight className="h-4 w-4" />
            </Link>
            {!logged && (
              <button
                type="button"
                onClick={toggleSkip}
                disabled={pending}
                className="press flex h-12 items-center justify-center gap-2 rounded-xl border border-line bg-white px-4 text-[15px] font-medium text-ink-soft hover:border-ink/20 disabled:opacity-60"
              >
                {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : skipped ? <RotateCcw className="h-4 w-4" /> : <SkipForward className="h-4 w-4" />}
                {skipped ? "Restore" : "Skip"}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export function PlanView({ plan }: { plan: PlanOverview }) {
  const [week, setWeek] = useState(plan.currentWeek);
  const [openId, setOpenId] = useState<string | null>(plan.nextUp?.id ?? null);
  const activeRef = useRef<HTMLButtonElement>(null);

  // Centre the current week in the strip without scrolling the page itself.
  useEffect(() => {
    const el = activeRef.current;
    const strip = el?.parentElement;
    if (el && strip) strip.scrollLeft = el.offsetLeft - strip.clientWidth / 2 + el.clientWidth / 2;
  }, []);

  const weeks = Array.from({ length: plan.totalWeeks }, (_, i) => i + 1);
  const shown = plan.workouts.filter((w) => w.week === week);
  const blockIndex = plan.blocks.length > 0 ? Math.min(Math.floor((week - 1) / 4), plan.blocks.length - 1) : -1;
  const block = blockIndex >= 0 ? plan.blocks[blockIndex] : null;
  const isDeload = plan.blocks.length > 0 && week % 4 === 0;

  return (
    <div className="min-w-0">
      {/* Block timeline */}
      {plan.blocks.length > 0 && (
        <div className="rise rise-1 mb-6 flex gap-2">
          {plan.blocks.map((b, i) => {
            const startWeek = i * 4 + 1;
            const state = plan.currentWeek > startWeek + 3 ? "done" : plan.currentWeek >= startWeek ? "now" : "later";
            const fill = state === "done" ? 100 : state === "now" ? ((plan.currentWeek - startWeek) / 4) * 100 + 12 : 0;
            return (
              <button key={b.name} type="button" onClick={() => setWeek(Math.max(startWeek, Math.min(plan.currentWeek, startWeek + 3)))} className="press flex-1 text-left">
                <div className="h-2 overflow-hidden rounded-full bg-ink/10">
                  <div className="h-full rounded-full bg-blue transition-[width] duration-700" style={{ width: `${Math.min(fill, 100)}%` }} />
                </div>
                <p className={cn("mt-2 text-sm font-semibold", blockIndex === i ? "text-ink" : "text-ink-mute")}>{b.name}</p>
                <p className="tnum text-xs text-ink-mute">
                  Weeks {startWeek}–{startWeek + 3}
                </p>
              </button>
            );
          })}
        </div>
      )}

      {/* Week picker */}
      <div className="no-scrollbar rise rise-2 relative -mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0" role="tablist" aria-label="Week">
        {weeks.map((n) => {
          const ws = plan.workouts.filter((w) => w.week === n);
          const done = ws.length > 0 && ws.every((w) => w.status === "LOGGED" || w.status === "SKIPPED");
          const selected = n === week;
          return (
            <button
              key={n}
              ref={n === plan.currentWeek ? activeRef : undefined}
              type="button"
              role="tab"
              aria-selected={selected}
              onClick={() => setWeek(n)}
              className={cn(
                "press tnum relative flex h-[60px] w-[52px] shrink-0 flex-col items-center justify-center rounded-2xl border text-center",
                selected ? "border-ink bg-ink text-white" : "border-line bg-white text-ink hover:border-ink/20"
              )}
            >
              <span className={cn("text-[10px] font-medium uppercase tracking-wide", selected ? "text-white/60" : "text-ink-mute")}>Wk</span>
              <span className="text-lg font-semibold leading-tight">{n}</span>
              {done ? (
                <span className={cn("absolute bottom-1.5 h-1 w-1 rounded-full", selected ? "bg-white" : "bg-blue")} />
              ) : n === plan.currentWeek ? (
                <span className={cn("absolute bottom-1.5 h-1 w-3 rounded-full", selected ? "bg-white" : "bg-blue")} />
              ) : null}
            </button>
          );
        })}
      </div>

      <div className="mt-5 flex items-baseline justify-between gap-3">
        <h2 className="font-display text-3xl text-ink">
          Week {week}
          {week === plan.currentWeek && <span className="ml-2 align-middle font-body text-sm font-medium text-blue">current</span>}
        </h2>
        {block && <p className="truncate text-sm text-ink-mute">{isDeload ? "Lighter week — recover" : block.focus}</p>}
      </div>

      <div key={week} className="fade-in mt-3 space-y-3">
        {shown.map((w) => (
          <WorkoutCard key={w.id} w={w} isNext={w.id === plan.nextUp?.id} open={openId === w.id} onToggle={() => setOpenId(openId === w.id ? null : w.id)} />
        ))}
        {shown.length === 0 && <p className="surface p-6 text-center text-ink-mute">No workouts scheduled this week.</p>}
      </div>
    </div>
  );
}
