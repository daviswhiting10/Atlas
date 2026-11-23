"use client";

import { FINISH_LABELS, markPrompt, unloggedText } from "@/lib/sessions/finish";

/**
 * Finish tapped with sets still unlogged. One sheet for both loggers, the same words:
 * "N sets not logged. Mark them as done and finish?" with three ways out. When every set is logged this never opens.
 */
export function FinishSheet({ unlogged, onMark, onPartial, onCancel }: { unlogged: number; onMark: () => void; onPartial: () => void; onCancel: () => void }) {
  return (
    <div className="fade-in fixed inset-0 z-50 flex items-end justify-center bg-night/40 sm:items-center" onClick={onCancel}>
      <div
        className="sheet-up w-full max-w-md rounded-t-[28px] bg-bone p-5 sm:rounded-[28px]"
        style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 20px)" }}
        role="dialog"
        aria-modal="true"
        aria-label={unloggedText(unlogged)}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="font-display text-3xl text-ink">{unloggedText(unlogged)}</h2>
        <p className="mt-1 text-[15px] text-ink-soft">{markPrompt(unlogged)}</p>
        <div className="mt-5 flex flex-col gap-2.5">
          <button type="button" onClick={onMark} className="press h-14 rounded-2xl bg-dusk-button text-[17px] font-semibold text-dusk-button-text">
            {FINISH_LABELS.mark}
          </button>
          <button type="button" onClick={onPartial} className="press h-14 rounded-2xl border border-line-strong text-[17px] font-semibold text-ink">
            {FINISH_LABELS.partial}
          </button>
          <button type="button" onClick={onCancel} className="press h-12 rounded-2xl text-[16px] font-medium text-ink-soft">
            {FINISH_LABELS.cancel}
          </button>
        </div>
      </div>
    </div>
  );
}
