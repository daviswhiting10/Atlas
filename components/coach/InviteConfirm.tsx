"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import { Loader2, X } from "lucide-react";
import { useEscape } from "@/hooks/use-escape";
import { emailTypo } from "@/lib/email-typos";

/**
 * Before an invite (or a new sign-in link) is made: the address it's for, to check. "Sending to … — is that
 * right?", a one-tap fix for an obvious typo (".con"), and a way to change it. Changing it here also changes her
 * login if she has one (PATCH /api/clients/[id]), so a typo can always be corrected.
 */
export function InviteConfirm({
  email,
  onConfirm,
  onSaveEmail,
  onClose,
}: {
  email: string | null;
  onConfirm: () => Promise<void>;
  /** Saves the corrected address; resolves to an error message, or null when saved. */
  onSaveEmail: (email: string) => Promise<string | null>;
  onClose: () => void;
}) {
  const [editing, setEditing] = useState(!email);
  const [draft, setDraft] = useState(email ?? "");
  const [busy, setBusy] = useState<"save" | "send" | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEscape(true, onClose);

  const typo = email ? emailTypo(email) : null;
  const draftTypo = editing ? emailTypo(draft) : null;

  async function save(value: string) {
    setBusy("save");
    setError(null);
    const err = await onSaveEmail(value.trim());
    setBusy(null);
    if (err) setError(err);
    else setEditing(false);
  }

  async function send() {
    setBusy("send");
    await onConfirm();
    setBusy(null);
    onClose();
  }

  const primary = "press flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-dusk-button text-[15px] font-semibold text-dusk-button-text hover:bg-dusk-button/85 disabled:opacity-60";
  const quiet = "press inline-flex min-h-11 items-center text-sm font-medium text-ink-soft underline-offset-4 hover:text-ink hover:underline";

  // Drawn on <body>: inside the page's animated container it would sit under the live-session bar.
  if (typeof document === "undefined") return null;
  return createPortal(
    <div className="fade-in fixed inset-0 z-50 flex items-end justify-center bg-night/40 backdrop-blur-sm sm:items-center" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Check the email"
        onClick={(e) => e.stopPropagation()}
        className="sheet-up w-full max-w-md rounded-t-2xl bg-bone p-6 sm:rounded-2xl"
        style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 24px)" }}
      >
        <div className="flex items-start justify-between gap-4">
          <p className="eyebrow">Invite</p>
          <button type="button" onClick={onClose} aria-label="Close" className="press -mr-2 -mt-2 flex h-11 w-11 items-center justify-center rounded-full text-ink-soft">
            <X className="h-4 w-4" />
          </button>
        </div>

        {editing ? (
          <form
            className="mt-2 space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              void save(draft);
            }}
          >
            <h2 className="text-2xl text-ink">Her email</h2>
            <input
              type="email"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="name@example.com"
              required
              autoFocus
              autoComplete="off"
              className="h-12 w-full rounded-xl border border-line bg-paper px-4 text-[16px] text-ink outline-none focus:border-ink/40"
            />
            {draftTypo && (
              <button type="button" onClick={() => setDraft(draftTypo)} className={quiet}>
                Did you mean {draftTypo}?
              </button>
            )}
            {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
            <button type="submit" disabled={busy !== null} className={primary}>
              {busy === "save" ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save"}
            </button>
            {email && (
              <button type="button" onClick={() => { setEditing(false); setDraft(email); setError(null); }} className={quiet}>
                Cancel
              </button>
            )}
          </form>
        ) : (
          <div className="mt-2 space-y-3">
            <h2 className="text-2xl leading-snug text-ink [overflow-wrap:anywhere]">
              Sending to <strong className="font-semibold">{email}</strong> — is that right?
            </h2>
            {typo && (
              <div className="space-y-1">
                <p className="text-sm text-ink-soft">That address looks like it has a typo.</p>
                <button type="button" onClick={() => void save(typo)} disabled={busy !== null} className="press inline-flex min-h-11 items-center text-sm font-semibold text-ink underline underline-offset-4">
                  Use {typo}
                </button>
              </div>
            )}
            {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
            <button type="button" onClick={() => void send()} disabled={busy !== null} className={primary}>
              {busy === "send" ? <Loader2 className="h-4 w-4 animate-spin" /> : "Yes, make the link"}
            </button>
            <button type="button" onClick={() => setEditing(true)} className={quiet}>
              Change email
            </button>
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}
