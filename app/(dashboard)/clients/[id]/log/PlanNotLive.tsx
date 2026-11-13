"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { assignDraftPlan } from "@/lib/actions/coach-plan";

/**
 * Log was pressed but the client has no live plan. With a draft (a sheet
 * just uploaded, say), one tap makes it live on its own dates and opens the
 * session. With nothing at all, point to the Plan tab.
 */
export function PlanNotLive({
  clientId,
  firstName,
  draft,
}: {
  clientId: string;
  firstName: string;
  draft: { id: string; name: string; startDate: string } | null;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function makeLive() {
    if (!draft) return;
    setBusy(true);
    const res = await assignDraftPlan({ clientId, assignmentId: draft.id, startDate: draft.startDate });
    if (!res.ok) {
      toast.error(res.error);
      setBusy(false);
      return;
    }
    router.refresh();
  }

  return (
    <div className="mx-auto max-w-md px-5 pt-10">
      <Link href={`/clients/${clientId}`} className="mb-8 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> {firstName}
      </Link>
      {draft ? (
        <>
          <h1 className="text-2xl text-ink">{draft.name}</h1>
          <p className="mt-1 text-sm text-muted-foreground">Not live yet.</p>
          <button
            type="button"
            onClick={makeLive}
            disabled={busy}
            className="press mt-6 flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-ink text-lg font-semibold text-white hover:bg-ink/85 disabled:opacity-70"
          >
            {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : null}
            Make it live and log
          </button>
          <Link href={`/clients/${clientId}/programs/${draft.id}`} className="mt-3 block text-center text-sm text-muted-foreground hover:text-foreground">
            Check it first
          </Link>
          <Link href={`/clients/${clientId}/log-workout`} className="mt-2 block text-center text-sm text-muted-foreground hover:text-foreground">
            Log a workout without a plan
          </Link>
        </>
      ) : (
        <>
          <h1 className="text-2xl text-ink">No plan yet</h1>
          <Link
            href={`/clients/${clientId}?tab=plan`}
            className="press mt-6 flex h-14 w-full items-center justify-center rounded-2xl bg-ink text-lg font-semibold text-white hover:bg-ink/85"
          >
            Add {firstName}&rsquo;s plan
          </Link>
          <Link href={`/clients/${clientId}/log-workout`} className="mt-3 block text-center text-sm text-muted-foreground hover:text-foreground">
            Log a workout without a plan
          </Link>
        </>
      )}
    </div>
  );
}
