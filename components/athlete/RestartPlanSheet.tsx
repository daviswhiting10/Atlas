"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useSheetLock } from "@/hooks/use-sheet-lock";
import { useEscape } from "@/hooks/use-escape";
import { planProgressToReset, resetPlanProgress } from "@/lib/actions/athlete";
import { resetQuestion } from "@/lib/plan/reset-progress";

/**
 * "Restart plan" (Plan ⋯): the live count of sessions on the plan, then a red Restart. Nothing is deleted until it's
 * pressed. With nothing to delete (and nothing skipped) it says so and offers only Close.
 */
export function RestartPlanSheet({ onClose }: { onClose: () => void }) {
  useSheetLock();
  useEscape(true, onClose);
  const router = useRouter();
  const [count, setCount] = useState<{ assignmentId: string; sessions: number; skipped: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const close = useRef(onClose);
  close.current = onClose;

  // Counted once, when the sheet opens.
  useEffect(() => {
    const onClose = () => close.current();
    let live = true;
    planProgressToReset()
      .then((r) => {
        if (!live) return;
        if (r.ok) return setCount({ assignmentId: r.assignmentId, sessions: r.sessions, skipped: r.skipped });
        toast.error(r.error);
        onClose();
      })
      .catch(() => {
        if (!live) return;
        toast.error("Couldn't check your plan. Please try again.");
        onClose();
      });
    return () => {
      live = false;
    };
  }, []);

  const restart = async () => {
    if (!count) return;
    setBusy(true);
    const r = await resetPlanProgress({ assignmentId: count.assignmentId }).catch(() => ({ ok: false as const, error: "Couldn't restart your plan. Please try again." }));
    setBusy(false);
    if (!r.ok) return void toast.error(r.error);
    toast.success("Back to Week 1 Day 1");
    onClose();
    router.push("/plan");
    router.refresh();
  };

  const nothing = count != null && count.sessions === 0 && count.skipped === 0;
  if (typeof document === "undefined") return null;
  return createPortal(
    <div className="fade-in fixed inset-0 z-50 flex items-end justify-center bg-night/40 backdrop-blur-sm sm:items-center" onClick={() => !busy && onClose()}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Restart plan"
        onClick={(e) => e.stopPropagation()}
        className="sheet-up w-full max-w-md rounded-t-2xl bg-bone p-6 sm:rounded-2xl"
        style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 24px)" }}
      >
        <h2 className="text-2xl text-ink">Restart plan</h2>
        <p className="mt-3 min-h-[3em] text-[15px] leading-relaxed text-ink-soft">{count ? resetQuestion(count.sessions, count.skipped) : ""}</p>
        <div className="mt-6 space-y-2">
          {!nothing && (
            <button
              type="button"
              disabled={busy || !count}
              onClick={restart}
              className="press flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-destructive text-[15px] font-semibold text-white disabled:opacity-60"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Restart"}
            </button>
          )}
          <button type="button" onClick={onClose} disabled={busy} className="press flex h-11 w-full items-center justify-center text-sm font-medium text-ink-soft">
            {nothing ? "Close" : "Cancel"}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
