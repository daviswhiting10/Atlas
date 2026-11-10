"use client";

import { useState } from "react";
import { Loader2, LogOut } from "lucide-react";

export function SignOutButton({ isGuest }: { isGuest: boolean }) {
  const [confirming, setConfirming] = useState(false);
  const [leaving, setLeaving] = useState(false);

  async function leave() {
    setLeaving(true);
    const { signOut } = await import("next-auth/react");
    await signOut({ callbackUrl: `${window.location.origin}/` });
  }

  if (isGuest && confirming) {
    return (
      <div className="rounded-2xl border border-line bg-white p-4">
        <p className="text-[15px] font-semibold text-ink">Leave this guest account?</p>
        <p className="mt-1 text-sm leading-relaxed text-ink-soft">Guest accounts live in this browser only. Once you sign out you can&apos;t get back into this one.</p>
        <div className="mt-4 flex gap-2">
          <button type="button" onClick={() => setConfirming(false)} className="press h-11 flex-1 rounded-xl border border-line bg-white text-sm font-semibold text-ink hover:border-ink/20">
            Stay
          </button>
          <button type="button" onClick={leave} disabled={leaving} className="press flex h-11 flex-1 items-center justify-center rounded-xl bg-ink text-sm font-semibold text-white hover:bg-ink/85 disabled:opacity-60">
            {leaving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Sign out"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => (isGuest ? setConfirming(true) : leave())}
      disabled={leaving}
      className="press flex h-12 w-full items-center justify-center gap-2 rounded-2xl border border-line bg-white text-[15px] font-semibold text-ink-soft hover:border-ink/20 hover:text-ink disabled:opacity-60"
    >
      {leaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogOut className="h-4 w-4" />} Sign out
    </button>
  );
}
