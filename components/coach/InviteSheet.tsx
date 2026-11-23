"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Check, Copy, Share, X } from "lucide-react";
import { toast } from "sonner";
import { useEscape } from "@/hooks/use-escape";
import { shareInvite } from "@/lib/coach/invite-share";
import { inviteSheetCopy } from "@/lib/coach/invite-sheet-copy";

export type InviteResult = { email: string; emailed: boolean; link: string; expiresInDays: number };

/**
 * After inviting a client (the Invite button, or Assign and invite): the one-time link, a big Copy, and a smaller
 * "Share via…" for the phone's share sheet (Messages, Mail, WhatsApp). It says the email went out only when it did;
 * when it couldn't (no email set up yet), the sheet is "Share this link".
 */
export function InviteSheet({ name, invite, onClose }: { name: string; invite: InviteResult; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  // The share sheet exists on phones and some desktop browsers; checked after the page is up, so it never flickers.
  const [canShare, setCanShare] = useState(false);
  useEffect(() => setCanShare(typeof navigator !== "undefined" && typeof navigator.share === "function"), []);
  const first = name.split(" ")[0];
  const copy = inviteSheetCopy({ first, email: invite.email, emailed: invite.emailed, days: invite.expiresInDays });

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(invite.link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Couldn't copy. Select the link and copy it instead.");
    }
  }
  async function shareLink() {
    // Opened from this tap, so the browser allows it.
    const outcome = await shareInvite(invite, first);
    if (outcome === "unavailable") toast.error("This browser can't open the share sheet. Copy the link instead.");
  }

  useEscape(true, onClose);
  // Drawn on <body>: inside the page's animated container it would sit under the live-session bar.
  if (typeof document === "undefined") return null;
  return createPortal(
    <div className="fade-in fixed inset-0 z-50 flex items-end justify-center bg-night/40 backdrop-blur-sm sm:items-center" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={copy.title}
        onClick={(e) => e.stopPropagation()}
        className="sheet-up w-full max-w-md rounded-t-2xl bg-bone p-6 sm:rounded-2xl"
        style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 24px)" }}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="eyebrow">Invite {first}</p>
            <h2 className="mt-1 text-2xl text-ink">{copy.title}</h2>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="press flex h-11 w-11 items-center justify-center rounded-full bg-ink/5 text-ink-soft">
            <X className="h-4 w-4" />
          </button>
        </div>

        <p className="mt-3 text-[15px] leading-relaxed text-ink-soft">{copy.lead}</p>

        <div className="mt-4 rounded-xl border border-line bg-paper p-3">
          <p className="break-all font-mono text-[12px] leading-relaxed text-ink-soft">{invite.link}</p>
        </div>
        <button
          type="button"
          onClick={copyLink}
          className="press mt-3 flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-dusk-button text-[17px] font-semibold text-dusk-button-text hover:bg-dusk-button/85"
        >
          {copied ? <Check className="h-5 w-5" /> : <Copy className="h-5 w-5" />}
          {copied ? "Copied" : "Copy link"}
        </button>
        {canShare && (
          <button type="button" onClick={shareLink} className="press mt-1 flex min-h-11 w-full items-center justify-center gap-1.5 text-[14px] font-medium text-ink-soft hover:text-ink">
            <Share className="h-4 w-4" /> Share via…
          </button>
        )}

        <p className="mt-3 text-[13px] leading-relaxed text-ink-mute">{copy.foot}</p>
      </div>
    </div>,
    document.body
  );
}
