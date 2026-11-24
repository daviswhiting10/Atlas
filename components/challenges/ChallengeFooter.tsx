"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

type Act = (raw: { goalId: string }) => Promise<{ ok: boolean; error?: string }>;

/**
 * The foot of a challenge's page: End it (today) while it runs, and Delete it, which asks first. Deleting takes its chip
 * off Home and its row off You.
 */
export function ChallengeFooter({ goalId, name, running, end, remove }: { goalId: string; name: string; running: boolean; end: Act; remove: Act }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [asking, setAsking] = useState<null | "end" | "delete">(null);
  const [error, setError] = useState<string | null>(null);
  const run = (kind: "end" | "delete") =>
    start(async () => {
      const r = await (kind === "end" ? end : remove)({ goalId });
      if (!r.ok) return void setError(r.error ?? "That didn't work.");
      router.replace(kind === "delete" ? "/you" : "/today");
      router.refresh();
    });

  return (
    <div className="mt-8 border-t border-line pt-5">
      {error && <p role="alert" className="mb-3 text-[14px] text-destructive">{error}</p>}
      {asking ? (
        <div className="rounded-2xl border border-line bg-paper p-4">
          <p className="text-[15px] font-semibold text-ink">{asking === "end" ? `End ${name} today?` : `Delete ${name}?`}</p>
          <p className="mt-1 text-[14px] text-ink-mute">
            {asking === "end" ? "It stops now and becomes a chapter you can read in Progress." : "It and its check-ins are removed for good. This can't be undone."}
          </p>
          <div className="mt-3 flex gap-2">
            <button type="button" onClick={() => setAsking(null)} disabled={pending} className="press flex h-12 flex-1 items-center justify-center rounded-xl border border-line-strong text-[15px] font-semibold text-ink">
              Cancel
            </button>
            <button type="button" onClick={() => run(asking)} disabled={pending} className="press flex h-12 flex-1 items-center justify-center gap-2 rounded-xl bg-dusk-button text-[15px] font-semibold text-dusk-button-text">
              {pending && <Loader2 className="h-4 w-4 animate-spin" />}
              {asking === "end" ? "End today" : "Delete"}
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-1 sm:flex-row">
          {running && (
            <button type="button" onClick={() => setAsking("end")} className="press flex min-h-12 flex-1 items-center justify-center rounded-xl border border-line-strong text-[15px] font-semibold text-ink">
              End challenge
            </button>
          )}
          <button type="button" onClick={() => setAsking("delete")} className="press flex min-h-12 flex-1 items-center justify-center rounded-xl text-[15px] font-semibold text-destructive">
            Delete
          </button>
        </div>
      )}
    </div>
  );
}
