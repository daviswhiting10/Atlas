"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { SheetLock } from "@/components/ui/sheet-lock";
import { useEscape } from "@/hooks/use-escape";

/** A guest signing out can't get back in (no email, no password): ask first. */
export function LeaveSheet({ onClose }: { onClose: () => void }) {
  useEscape(true, onClose);
  const [leaving, setLeaving] = useState(false);
  async function leave() {
    setLeaving(true);
    const { signOutAndForget } = await import("@/lib/sign-out");
    await signOutAndForget(`${window.location.origin}/`);
  }
  return (
    <div className="fade-in fixed inset-0 z-50 flex items-end justify-center bg-night/40 backdrop-blur-sm sm:items-center" onClick={() => !leaving && onClose()}>
      <SheetLock />
      <div role="dialog" aria-modal="true" aria-label="Leave this guest account?" onClick={(e) => e.stopPropagation()} className="sheet-up w-full max-w-md rounded-t-[28px] bg-bone p-5 sm:rounded-[28px]" style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 20px)" }}>
        <h2 className="text-[22px] font-semibold text-ink">Leave this guest account?</h2>
        <p className="mt-2 text-[15px] leading-relaxed text-ink-soft">Guest accounts have no email or password, so this browser is the only way in. Once you sign out you can&apos;t get back to this one. To keep it, save your account first (You tab).</p>
        <div className="mt-5 flex flex-col gap-2">
          <button type="button" onClick={onClose} disabled={leaving} className="press flex h-[52px] items-center justify-center rounded-2xl border border-line-strong text-[16px] font-semibold text-ink">
            Stay
          </button>
          <button type="button" onClick={leave} disabled={leaving} className="press flex h-[52px] items-center justify-center gap-2 rounded-2xl bg-dusk-button text-[16px] font-semibold text-dusk-button-text">
            {leaving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Sign out"}
          </button>
        </div>
      </div>
    </div>
  );
}
