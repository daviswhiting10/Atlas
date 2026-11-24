"use client";

import { SheetLock } from "@/components/ui/sheet-lock";
import { useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { HOW_IT_WORKS } from "@/lib/how-it-works";
import { useEscape } from "@/hooks/use-escape";


/**
 * A "How it works" row that opens the three steps in a sheet. It starts at step 1 every time,
 * with Back, Next and Skip. It only shows: nothing is read or written.
 */
export function HowItWorks({ className, aiDemo = false }: { className?: string; /** The demo: the last step also links to the AI-assistant walkthrough (it used to be its own row on You). */ aiDemo?: boolean }) {
  const [step, setStep] = useState<number | null>(null);
  const open = step != null;
  const close = () => setStep(null);

  useEscape(open, close);

  const last = HOW_IT_WORKS.length - 1;
  return (
    <>
      <button
        type="button"
        onClick={() => setStep(0)}
        className={cn("press flex min-h-[56px] w-full items-center justify-between gap-3 border-y border-line text-left text-[17px] font-semibold text-ink hover:text-ink-soft", className)}
      >
        How it works <ArrowRight className="h-4 w-4 shrink-0 text-ink-soft" />
      </button>
      {open &&
        createPortal(
          <div className="fade-in fixed inset-0 z-50 flex items-end bg-night/50 backdrop-blur-sm sm:items-center" onClick={close}>
          <SheetLock />
            <div
              role="dialog"
              aria-modal="true"
              aria-label="How it works"
              onClick={(e) => e.stopPropagation()}
              className="sheet-up w-full rounded-t-[24px] border-t border-line bg-bone px-5 pt-3 sm:mx-auto sm:max-w-md sm:rounded-[24px] sm:border"
              style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 20px)" }}
            >
              <div className="flex min-h-12 items-center justify-between">
                <span className="tnum font-mono text-sm text-signal" aria-live="polite">
                  {step + 1} of {HOW_IT_WORKS.length}
                </span>
                <button type="button" onClick={close} className="press -mr-2 min-h-11 px-2 text-[15px] font-medium text-ink-soft hover:text-ink">
                  Skip
                </button>
              </div>
              <h2 className="mt-4 text-[28px] font-semibold leading-tight tracking-[-0.02em] text-ink">{HOW_IT_WORKS[step][0]}</h2>
              <p className="mt-2 min-h-[72px] text-[16px] leading-relaxed text-ink-soft">{HOW_IT_WORKS[step][1]}</p>
              {aiDemo && step === last && (
                <Link href="/agents#demo" className="press -mt-2 mb-1 inline-flex min-h-11 items-center gap-1.5 text-[15px] font-semibold text-ink">
                  Watch an AI assistant use this data <ArrowRight className="h-4 w-4 text-ink-soft" />
                </Link>
              )}
              <div className="mt-6 flex gap-3">
                {step > 0 && (
                  <button type="button" onClick={() => setStep(step - 1)} className="press h-14 flex-1 rounded-2xl border border-line-strong text-[17px] font-semibold text-ink">
                    Back
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => (step === last ? close() : setStep(step + 1))}
                  className="press h-14 flex-[2] rounded-2xl bg-dusk-button text-[17px] font-semibold text-dusk-button-text hover:bg-dusk-button/90"
                >
                  {step === last ? "Done" : "Next"}
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}
    </>
  );
}
