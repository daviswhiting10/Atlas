"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Send, Trash2 } from "lucide-react";
import { assignDraftPlan, discardDraftPlan } from "@/lib/actions/coach-plan";

/** Assign a draft to the client, or throw it away. */
export function AssignPanel({ clientId, clientName, assignmentId, startDate, hasLivePlan }: { clientId: string; clientName: string; assignmentId: string; startDate: string; hasLivePlan: boolean }) {
  const router = useRouter();
  const [date, setDate] = useState(startDate);
  const [pending, start] = useTransition();
  const [confirmDiscard, setConfirmDiscard] = useState(false);

  function assign() {
    start(async () => {
      const res = await assignDraftPlan({ clientId, assignmentId, startDate: date });
      if (!res.ok) return void toast.error(res.error);
      toast.success(`Assigned to ${clientName}`);
      router.refresh();
    });
  }

  function discard() {
    start(async () => {
      const res = await discardDraftPlan({ clientId, assignmentId });
      if (!res.ok) return void toast.error(res.error);
      toast.success("Draft discarded");
      router.push(`/clients/${clientId}`);
    });
  }

  return (
    <div className="surface p-5">
      <p className="eyebrow">Draft</p>
      <p className="mt-1.5 text-[15px] leading-relaxed text-ink-soft">
        {clientName} can&apos;t see this yet. Edit anything, then assign it.
        {hasLivePlan ? " Assigning replaces their current plan; what they've logged stays." : ""}
      </p>
      <label className="mt-4 block">
        <span className="eyebrow">Starts</span>
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="mt-1.5 h-11 w-full rounded-lg border border-line bg-white px-3 text-[15px] text-ink outline-none focus:border-ink/40"
        />
      </label>
      <button
        type="button"
        onClick={assign}
        disabled={pending || !date}
        className="press mt-3 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-ink text-[15px] font-semibold text-white hover:bg-ink/85 disabled:opacity-50"
      >
        {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Assign to {clientName.split(" ")[0]}
      </button>
      {confirmDiscard ? (
        <div className="mt-3 flex items-center justify-between gap-2 text-sm">
          <span className="text-ink-soft">Discard this draft?</span>
          <span className="flex gap-1.5">
            <button type="button" onClick={() => setConfirmDiscard(false)} className="press h-9 rounded-lg px-3 font-medium text-ink-soft">
              Keep
            </button>
            <button type="button" onClick={discard} disabled={pending} className="press h-9 rounded-lg bg-ink px-3 font-semibold text-white">
              Discard
            </button>
          </span>
        </div>
      ) : (
        <button type="button" onClick={() => setConfirmDiscard(true)} className="press mt-2 flex h-10 w-full items-center justify-center gap-1.5 rounded-lg text-sm font-medium text-ink-mute hover:bg-ink/5 hover:text-ink">
          <Trash2 className="h-4 w-4" /> Discard draft
        </button>
      )}
    </div>
  );
}
