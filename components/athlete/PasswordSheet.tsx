"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { SheetLock } from "@/components/ui/sheet-lock";
import { useEscape } from "@/hooks/use-escape";
import { passwordStatus } from "@/lib/actions/account";
import { PasswordPanel } from "@/components/athlete/account";

/** Set or change the password: opens from the ⋯ menu (it used to take a panel on the You screen). */
export function PasswordSheet({ onClose }: { onClose: () => void }) {
  useEscape(true, onClose);
  const [status, setStatus] = useState<{ email: string; hasPassword: boolean } | null | "loading">("loading");
  useEffect(() => {
    let live = true;
    passwordStatus().then((s) => live && setStatus(s), () => live && setStatus(null));
    return () => {
      live = false;
    };
  }, []);
  return (
    <div className="fade-in fixed inset-0 z-50 flex items-end justify-center bg-night/40 backdrop-blur-sm sm:items-center" onClick={onClose}>
      <SheetLock />
      <div role="dialog" aria-modal="true" aria-label="Password" onClick={(e) => e.stopPropagation()} className="sheet-up max-h-[85dvh] w-full max-w-md overflow-y-auto rounded-t-[28px] bg-bone p-5 sm:rounded-[28px]" style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 20px)" }}>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-[22px] font-semibold text-ink">Password</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="press -mr-2 flex h-11 w-11 items-center justify-center rounded-full text-ink-mute hover:text-ink">
            <X className="h-5 w-5" />
          </button>
        </div>
        {status === "loading" ? <div className="h-16" aria-busy /> : status ? <PasswordPanel email={status.email} hasPassword={status.hasPassword} /> : <p className="text-[15px] text-ink-soft">Couldn&apos;t load your account. Try again.</p>}
      </div>
    </div>
  );
}
