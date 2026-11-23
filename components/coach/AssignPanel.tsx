"use client";

import { useRef, useState, useTransition } from "react";
import { DayInput } from "@/components/ui/day-input";
import { dayFrom } from "@/lib/day-field";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Send, Trash2 } from "lucide-react";
import { assignDraftPlan, discardDraftPlan } from "@/lib/actions/coach-plan";
import { InviteSheet, type InviteResult } from "@/components/coach/InviteSheet";

/**
 * Assign a draft to the client, or throw it away. A client who isn't invited yet (an email, no login) is invited in the
 * same tap: "Assign and invite", the same invite as the Invite button.
 */
export function AssignPanel({
  clientId,
  clientName,
  assignmentId,
  startDate,
  hasLivePlan,
  notInvited = false,
}: {
  clientId: string;
  clientName: string;
  assignmentId: string;
  startDate: string;
  hasLivePlan: boolean;
  notInvited?: boolean;
}) {
  const router = useRouter();
  const [date, setDate] = useState(startDate);
  const dateRef = useRef<HTMLInputElement>(null);
  const [pending, start] = useTransition();
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [shareLink, setShareLink] = useState<InviteResult | null>(null);

  function assign() {
    start(async () => {
      const res = await assignDraftPlan({ clientId, assignmentId, startDate: dayFrom(dateRef, date), invite: notInvited });
      if (!res.ok) return void toast.error(res.error);
      const inv = res.invite;
      if (!inv) toast.success(`Assigned to ${clientName}`);
      else if (!inv.sent) toast.warning(`Assigned to ${clientName}. The invite didn't go: ${inv.error}`);
      else if (inv.emailed) toast.success(`Assigned to ${clientName} and invite emailed`);
      // The email couldn't go out: the coach gets the link to share (Copy, or Share via…). Never "sent".
      else setShareLink({ email: inv.email, emailed: false, link: inv.link, expiresInDays: inv.expiresInDays });
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
        {notInvited ? ` They aren't invited yet: this also sends their invite.` : ""}
      </p>
      <label className="mt-4 block">
        <span className="eyebrow">Starts</span>
        <DayInput
          ref={dateRef}
          value={date}
          onDay={setDate}
          className="mt-1.5 h-11 w-full rounded-lg border border-line-strong bg-dusk-raised px-3 text-[15px] text-ink outline-none focus:border-ink/40"
        />
      </label>
      <button
        type="button"
        onClick={assign}
        disabled={pending || !date}
        className="press mt-3 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-dusk-button text-[15px] font-semibold text-dusk-button-text hover:bg-dusk-button/85 disabled:opacity-50"
      >
        {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} {notInvited ? "Assign and invite" : `Assign to ${clientName.split(" ")[0]}`}
      </button>
      {confirmDiscard ? (
        <div className="mt-3 flex items-center justify-between gap-2 text-sm">
          <span className="text-ink-soft">Discard this draft?</span>
          <span className="flex gap-1.5">
            <button type="button" onClick={() => setConfirmDiscard(false)} className="press h-9 rounded-lg px-3 font-medium text-ink-soft">
              Keep
            </button>
            <button type="button" onClick={discard} disabled={pending} className="press h-9 rounded-lg bg-dusk-button px-3 font-semibold text-dusk-button-text">
              Discard
            </button>
          </span>
        </div>
      ) : (
        <button type="button" onClick={() => setConfirmDiscard(true)} className="press mt-2 flex h-10 w-full items-center justify-center gap-1.5 rounded-lg text-sm font-medium text-ink-mute hover:bg-ink/5 hover:text-ink">
          <Trash2 className="h-4 w-4" /> Discard draft
        </button>
      )}
      {shareLink && <InviteSheet name={clientName} invite={shareLink} onClose={() => setShareLink(null)} />}
    </div>
  );
}
