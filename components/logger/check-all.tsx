"use client";

import { useRef } from "react";
import { Check } from "lucide-react";
import type { BulkMode } from "@/lib/sessions/check-all";
import { checkAllText } from "@/lib/sessions/check-all";

/**
 * Shared by both loggers. The exercise button sits in the row with Add set / Note / Change, on the left,
 * away from the tick column. 44 px tall, pressed state at once (no transition), no flash, no toast.
 */
export function CheckAllButton({ mode, onClick, name }: { mode: BulkMode; onClick: () => void; name: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`${mode === "check" ? "Check all sets" : "Uncheck all sets"} of ${name}`}
      className="inline-flex min-h-11 items-center gap-1 rounded-lg px-2.5 text-[13px] font-medium text-ink-soft transition-none active:bg-ink/15 active:text-ink"
    >
      <Check className="h-3.5 w-3.5" strokeWidth={3} />
      {mode === "check" ? "Check all" : "Uncheck all"}
    </button>
  );
}

/** "Check all 14 sets?" with Cancel and Check all. Opens like the other sheets, from the bottom. */
export function CheckAllSheet({ count, onCancel, onConfirm }: { count: number; onCancel: () => void; onConfirm: () => void }) {
  // A tap on Check all in the first 400 ms after the sheet opens is a stray (the tap that opened it, a double tap): ignored.
  const openedAt = useRef(typeof performance === "undefined" ? 0 : performance.now());
  const ready = () => typeof performance === "undefined" || performance.now() - openedAt.current > 400;
  return (
    <div className="fade-in fixed inset-0 z-50 flex items-end justify-center bg-night/40 sm:items-center" onClick={onCancel}>
      <div
        className="sheet-up w-full max-w-md rounded-t-[28px] bg-bone p-5 sm:rounded-[28px]"
        style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 20px)" }}
        role="dialog"
        aria-modal="true"
        aria-label={checkAllText(count)}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="font-display text-3xl text-ink">{checkAllText(count)}</h2>
        <div className="mt-5 flex gap-3">
          <button type="button" onClick={onCancel} className="press h-14 flex-1 rounded-2xl border border-line-strong text-[17px] font-semibold text-ink">
            Cancel
          </button>
          <button type="button" onClick={() => ready() && onConfirm()} className="press h-14 flex-[1.4] rounded-2xl bg-dusk-button text-[17px] font-semibold text-dusk-button-text">
            Check all
          </button>
        </div>
      </div>
    </div>
  );
}
