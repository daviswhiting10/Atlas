"use client";

import { X } from "lucide-react";
import { SessionMini } from "@/components/athlete/SessionMini";
import { SheetLock } from "@/components/ui/sheet-lock";
import { useEscape } from "@/hooks/use-escape";
import type { SessionSummary } from "@/lib/actions/athlete";

/** A tapped session on a chart: the same mini summary the Plan calendar opens, read-only, in a sheet. */
export function SessionSheet({ eyebrow, sessions, load, onClose }: { eyebrow: string; sessions: Array<{ id: string; title: string; href: string | null }>; load: (id: string) => Promise<SessionSummary | null>; onClose: () => void }) {
  useEscape(true, onClose);
  return (
    <div className="fade-in fixed inset-0 z-50 flex items-end justify-center bg-night/40 backdrop-blur-sm sm:items-center" onClick={onClose}>
      <SheetLock />
      <div role="dialog" aria-modal="true" aria-label={eyebrow} onClick={(e) => e.stopPropagation()} className="sheet-up max-h-[85dvh] w-full max-w-md overflow-y-auto rounded-t-[28px] bg-bone p-5 sm:rounded-[28px]" style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 20px)" }}>
        <div className="flex items-start justify-between gap-3">
          <p className="eyebrow">{eyebrow}</p>
          <button type="button" onClick={onClose} aria-label="Close" className="press -mr-2 -mt-2 flex h-11 w-11 items-center justify-center rounded-full text-ink-mute hover:text-ink">
            <X className="h-5 w-5" />
          </button>
        </div>
        {sessions.map((s) => (
          <div key={s.id} className="mt-2 border-t border-line pt-3 first:border-t-0 first:pt-0">
            <p className="text-[22px] font-semibold leading-tight text-ink">{s.title}</p>
            <SessionMini logId={s.id} href={s.href ?? "#"} load={load} />
          </div>
        ))}
      </div>
    </div>
  );
}
