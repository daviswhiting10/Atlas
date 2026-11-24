"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createPortal } from "react-dom";
import { Dumbbell, Flame, Footprints, Plus, Waves, Target, Play } from "lucide-react";
import { logOptions } from "@/lib/actions/athlete";
import { QuickCardioSheet, type QuickKind } from "@/components/athlete/QuickCardioSheet";
import { SheetLock } from "@/components/ui/sheet-lock";
import { useEscape } from "@/hooks/use-escape";

/**
 * One "+ Log" pill on Today (the way Strava has one): it opens a short list of what can be logged. Continue the workout that
 * was started (only when there is one), log today's challenge (only while one is running), a walk, a run, a swim, other
 * cardio, or a workout with sets. Each goes straight to the right place.
 */
export function LogPill({ challengeId }: { /** The running challenge, when there is one. */ challengeId: string | null }) {
  const [open, setOpen] = useState(false);
  const [cardio, setCardio] = useState<QuickKind | null>(null);
  const [inProgress, setInProgress] = useState<{ id: string; name: string } | null>(null);

  // Whether there is a session to continue is looked up when the sheet opens (never held on the page, which can be an old copy).
  useEffect(() => {
    if (!open) return;
    let live = true;
    logOptions()
      .then((r) => live && setInProgress(r.inProgress))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [open]);
  useEscape(open, () => setOpen(false));

  const row = "press flex min-h-14 w-full items-center gap-3 border-t border-line px-1 text-left text-[17px] font-semibold text-ink first:border-t-0";
  const icon = "h-5 w-5 shrink-0 text-signal";
  const cardioRow = (kind: QuickKind, label: string, Icon: typeof Footprints) => (
    <li key={kind}>
      <button
        type="button"
        onClick={() => {
          setOpen(false);
          setCardio(kind);
        }}
        className={row}
      >
        <Icon className={icon} /> {label}
      </button>
    </li>
  );

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} aria-haspopup="dialog" className="press inline-flex h-11 items-center gap-1.5 rounded-full bg-dusk-button px-4 text-[15px] font-semibold text-dusk-button-text hover:brightness-110">
        <Plus className="h-4 w-4" strokeWidth={2.6} /> Log
      </button>

      {/* Drawn on <body>: inside the page's animated header, a fixed sheet would be placed against the header, not the screen. */}
      {open && typeof document !== "undefined" && createPortal(
        <div className="fade-in fixed inset-0 z-50 flex items-end justify-center bg-night/40 backdrop-blur-sm sm:items-center" onClick={() => setOpen(false)}>
          <SheetLock />
          <div role="dialog" aria-modal="true" aria-label="Log" onClick={(e) => e.stopPropagation()} className="sheet-up w-full max-w-md rounded-t-[28px] bg-bone px-4 pt-4 sm:rounded-[28px]" style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 16px)" }}>
            <h2 className="text-[22px] font-semibold text-ink">Log</h2>
            <ul className="mt-2">
              {inProgress && (
                <li>
                  <Link href={`/workouts/${inProgress.id}`} className={row}>
                    <Play className={icon} /> <span className="min-w-0 truncate">Continue workout <span className="font-normal text-ink-mute">· {inProgress.name}</span></span>
                  </Link>
                </li>
              )}
              {challengeId && (
                <li>
                  <Link href={`/challenges/${challengeId}`} className={row}>
                    <Target className={icon} /> Log today&apos;s challenge
                  </Link>
                </li>
              )}
              {cardioRow("WALK", "Walk", Footprints)}
              {cardioRow("RUN", "Run", Flame)}
              {cardioRow("SWIM", "Swim", Waves)}
              {cardioRow("OTHER", "Other cardio", Flame)}
              <li>
                <Link href="/workouts/new" className={row}>
                  <Dumbbell className={icon} /> A workout with sets
                </Link>
              </li>
            </ul>
            <button type="button" onClick={() => setOpen(false)} className="press mt-1 flex h-12 w-full items-center justify-center text-[15px] font-semibold text-ink-soft">
              Cancel
            </button>
          </div>
        </div>,
        document.body
      )}

      <QuickCardioSheet open={cardio != null} initial={cardio ?? undefined} onClose={() => setCardio(null)} />
    </>
  );
}
