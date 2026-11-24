"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import type { SessionSummary } from "@/lib/actions/athlete";
import { SheetLock } from "@/components/ui/sheet-lock";
import { useEscape } from "@/hooks/use-escape";

type Load = (id: string) => Promise<SessionSummary | null>;
type Remove = (raw: { workoutLogId: string }) => Promise<{ ok: true } | { ok: false; error: string }>;

const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;

/**
 * A logged day on the Plan calendar: a small summary of the session (what it was, how many sets, how long, the notes) with
 * a way to open it and, when `remove` is given, a red Delete session that asks first. Deleting takes the session, its sets
 * and its notes away, and the day goes back to scheduled.
 */
export function SessionMini({ logId, href, load, remove }: { logId: string; href: string; load: Load; remove?: Remove }) {
  const router = useRouter();
  const [s, setS] = useState<SessionSummary | null | "loading">("loading");
  const [asking, setAsking] = useState(false);
  const [pending, start] = useTransition();
  useEffect(() => {
    let live = true;
    setS("loading");
    load(logId)
      .then((r) => live && setS(r))
      .catch(() => live && setS(null));
    return () => {
      live = false;
    };
  }, [load, logId]);

  const facts = s && s !== "loading" ? [s.setCount != null ? plural(s.setCount, "set") : null, s.minutes ? `${s.minutes} min` : null].filter(Boolean).join(" · ") : "";
  const confirm = () =>
    start(async () => {
      const r = await remove!({ workoutLogId: logId });
      if (!r.ok) return void toast.error(r.error);
      setAsking(false);
      toast.success("Session deleted");
      router.refresh();
    });

  return (
    <div>
      {s === "loading" ? <div className="mt-3 h-14" aria-busy /> : facts ? <p className="mt-0.5 text-[13px] text-ink-mute">{facts}</p> : null}
      {s && s !== "loading" && (s.notes ?? []).length > 0 && (
        <div className="mt-3 space-y-1.5 rounded-xl border border-line px-3 py-2 text-[14px] leading-snug text-ink-soft">
          {(s.notes ?? []).map((n) => (
            <p key={n.label}>
              <span className="mr-1.5 text-[11px] font-semibold uppercase tracking-wider text-ink">{n.label}</span>
              {n.text}
            </p>
          ))}
        </div>
      )}
      <div className="mt-3.5 flex flex-col gap-1">
        <Link href={href} className="press flex h-[52px] w-full items-center justify-center rounded-2xl border border-line-strong text-[17px] font-semibold text-ink">
          View session
        </Link>
        {remove && (
          <button type="button" onClick={() => setAsking(true)} className="press flex min-h-12 w-full items-center justify-center rounded-2xl text-[15px] font-semibold text-destructive">
            Delete session
          </button>
        )}
      </div>
      {asking && <ConfirmDelete pending={pending} onCancel={() => !pending && setAsking(false)} onConfirm={confirm} />}
    </div>
  );
}

function ConfirmDelete({ pending, onCancel, onConfirm }: { pending: boolean; onCancel: () => void; onConfirm: () => void }) {
  useEscape(true, onCancel);
  return (
    <div className="fade-in fixed inset-0 z-50 flex items-end justify-center bg-night/40 backdrop-blur-sm sm:items-center" onClick={onCancel}>
      <SheetLock />
      <div role="dialog" aria-modal="true" aria-label="Delete this session?" onClick={(e) => e.stopPropagation()} className="sheet-up w-full max-w-md rounded-t-[28px] bg-bone p-5 sm:rounded-[28px]" style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 20px)" }}>
        <h2 className="text-[22px] font-semibold text-ink">Delete this session?</h2>
        <p className="mt-2 text-[15px] leading-relaxed text-ink-soft">Sets you logged will be removed. This can&apos;t be undone.</p>
        <div className="mt-5 flex flex-col gap-2">
          <button type="button" onClick={onConfirm} disabled={pending} className="press flex h-[52px] items-center justify-center gap-2 rounded-2xl bg-destructive text-[16px] font-semibold text-white disabled:opacity-60">
            {pending && <Loader2 className="h-4 w-4 animate-spin" />} Delete session
          </button>
          <button type="button" onClick={onCancel} disabled={pending} className="press flex h-12 items-center justify-center rounded-2xl text-[16px] font-semibold text-ink">
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
