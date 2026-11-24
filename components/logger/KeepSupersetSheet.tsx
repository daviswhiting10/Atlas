"use client";

import { useSheetLock } from "@/hooks/use-sheet-lock";
import { useRef } from "react";

/**
 * Asked once, right after a superset is made (or one the plan has is split) mid-session: just today (this phone, as before),
 * or kept in the plan for this workout from now on. Tapping outside is "Just today".
 */
export function KeepSupersetSheet({ split, onToday, onKeep }: { split: boolean; onToday: () => void; onKeep: () => void }) {
  useSheetLock();
  // A tap in the first 400 ms is a stray (the end of the drop that opened it): ignored.
  const openedAt = useRef(typeof performance === "undefined" ? 0 : performance.now());
  const ready = () => typeof performance === "undefined" || performance.now() - openedAt.current > 400;
  const title = split ? "Split for good?" : "Keep this superset?";
  return (
    <div className="fade-in fixed inset-0 z-50 flex items-end justify-center bg-night/40 sm:items-center" onClick={() => ready() && onToday()}>
      <div
        className="sheet-up w-full max-w-md rounded-t-[28px] bg-bone p-5 sm:rounded-[28px]"
        style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 20px)" }}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="font-display text-3xl text-ink">{title}</h2>
        <div className="mt-5 flex flex-col gap-3">
          <button type="button" onClick={() => ready() && onKeep()} className="press h-14 rounded-2xl bg-dusk-button text-[17px] font-semibold text-dusk-button-text">
            Keep for this workout from now on
          </button>
          <button type="button" onClick={() => ready() && onToday()} className="press h-14 rounded-2xl border border-line-strong text-[17px] font-semibold text-ink">
            Just today
          </button>
        </div>
      </div>
    </div>
  );
}
