"use client";

import { useEffect, useRef, useState } from "react";
import { Minus, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { bumpSeconds, formatClock, parseClock, type BareUnit } from "@/lib/sessions/duration";

/**
 * One m:ss field for a timed set. The value is seconds (what is stored); the field shows 15:00, − and + move it
 * by 30 s (1 min above 10:00), and a typed time is read as you type: 15:30, 15 min, 90s, or a bare number
 * (minutes for steady cardio, seconds for a hold). Same size and look as the reps stepper. No animation.
 */
export function DurationStepper({
  value,
  bare,
  label,
  onChange,
  dim,
  settled,
}: {
  value: number | null;
  bare: BareUnit;
  label: string;
  onChange: (v: number | null) => void;
  dim: boolean;
  /** False just after cards fold, open or move: a +/− tapped now was meant for what was there. */
  settled: () => boolean;
}) {
  const [draft, setDraft] = useState<string | null>(null); // what is typed, while the field has focus
  const focused = useRef(false);
  // A − or + while typing, or a change from outside, shows the new time.
  useEffect(() => {
    if (!focused.current) setDraft(null);
  }, [value]);
  const bump = (dir: 1 | -1) => {
    if (!settled()) return;
    setDraft(null);
    onChange(bumpSeconds(value, dir));
  };
  return (
    <div className={cn("flex h-[52px] min-w-0 flex-1 items-center rounded-2xl border bg-dusk-raised", dim ? "border-signal/25 bg-signal/[0.04]" : "border-line-strong")}>
      <button type="button" onClick={() => bump(-1)} aria-label={`Decrease ${label}`} className="press relative flex h-full w-9 shrink-0 items-center justify-center text-ink-mute before:absolute before:-inset-x-1 before:inset-y-0 hover:text-ink">
        <Minus className="h-4 w-4" />
      </button>
      <label className="flex min-w-0 flex-1 flex-col items-center justify-center self-stretch">
        <input
          type="text"
          inputMode="decimal"
          enterKeyHint="done"
          autoComplete="off"
          value={draft ?? formatClock(value)}
          placeholder="0:00"
          aria-label={label}
          onFocus={(e) => {
            focused.current = true;
            setDraft(formatClock(value));
            e.target.select();
          }}
          onChange={(e) => {
            setDraft(e.target.value);
            if (e.target.value.trim() === "") return onChange(null);
            const secs = parseClock(e.target.value, bare);
            if (secs != null) onChange(secs);
          }}
          onBlur={() => {
            focused.current = false;
            setDraft(null);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.currentTarget.blur();
          }}
          className="tnum w-full bg-transparent text-center text-[17px] font-semibold leading-none text-ink outline-none placeholder:text-ink-mute"
        />
        <span className="mt-0.5 text-[10px] font-medium uppercase tracking-wide text-ink-mute">min:sec</span>
      </label>
      <button type="button" onClick={() => bump(1)} aria-label={`Increase ${label}`} className="press relative flex h-full w-9 shrink-0 items-center justify-center text-ink-mute before:absolute before:-inset-x-1 before:inset-y-0 hover:text-ink">
        <Plus className="h-4 w-4" />
      </button>
    </div>
  );
}
