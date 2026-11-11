"use client";

import { useState } from "react";
import { Check, Copy, X } from "lucide-react";
import { toast } from "sonner";

export type InviteResult = { email: string; emailed: boolean; link: string; expiresInDays: number };

/**
 * After inviting a client: the link itself, to text or send however the coach
 * likes, and an honest line about whether the email went out.
 */
export function InviteSheet({ name, invite, onClose }: { name: string; invite: InviteResult; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  const first = name.split(" ")[0];

  async function copy() {
    try {
      await navigator.clipboard.writeText(invite.link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Couldn't copy. Select the link and copy it instead.");
    }
  }

  return (
    <div className="fade-in fixed inset-0 z-50 flex items-end justify-center bg-night/40 backdrop-blur-sm sm:items-center" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Invite ${name}`}
        onClick={(e) => e.stopPropagation()}
        className="sheet-up w-full max-w-md rounded-t-2xl bg-bone p-6 sm:rounded-2xl"
        style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 24px)" }}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="eyebrow">Invite</p>
            <h2 className="mt-1 text-2xl text-ink">{first}&apos;s link is ready</h2>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="press flex h-9 w-9 items-center justify-center rounded-full bg-ink/5 text-ink-soft">
            <X className="h-4 w-4" />
          </button>
        </div>

        <p className="mt-3 text-[14px] leading-relaxed text-ink-soft">
          {invite.emailed ? (
            <>
              Emailed to <strong className="font-semibold text-ink">{invite.email}</strong>. You can also send the link yourself:
            </>
          ) : (
            <>
              The email couldn&apos;t be sent, so send {first} this link yourself, by text or however you usually reach them.
            </>
          )}
        </p>

        <div className="mt-4 rounded-xl border border-line bg-white p-3">
          <p className="break-all font-mono text-[12px] leading-relaxed text-ink-soft">{invite.link}</p>
        </div>
        <button
          type="button"
          onClick={copy}
          className="press mt-3 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-ink text-[15px] font-semibold text-white hover:bg-ink/85"
        >
          {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
          {copied ? "Copied" : "Copy link"}
        </button>

        <p className="mt-3 text-[13px] leading-relaxed text-ink-mute">
          It works once and expires in {invite.expiresInDays} days. Once {first} is in, they can set a password from their You tab and sign in any time. Inviting again makes a new link.
        </p>
      </div>
    </div>
  );
}
