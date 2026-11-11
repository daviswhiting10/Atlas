"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { saveGuestAccount } from "@/lib/actions/account";
import { PASSWORD_MIN } from "@/lib/password-rules";
import { cn } from "@/lib/utils";

/** Signs in with email and password. True on success. */
export async function signInWithPassword(email: string, password: string): Promise<boolean> {
  // Loaded on demand: importing next-auth/react at module level breaks
  // server rendering of any page that includes this component.
  const { signIn } = await import("next-auth/react");
  const res = await signIn("password", { email, password, redirect: false });
  return !!res && !res.error;
}

export const inputClass =
  "h-[52px] w-full rounded-2xl border border-line bg-white px-4 text-[16px] text-ink outline-none transition-shadow placeholder:text-ink-mute/60 focus:border-signal focus:shadow-[0_0_0_3px_rgba(30,107,78,0.18)]";

/** Email + password fields, shared by sign-up, sign-in and saving a guest account. */
export function CredentialFields({
  email,
  password,
  onEmail,
  onPassword,
  newPassword,
}: {
  email: string;
  password: string;
  onEmail: (v: string) => void;
  onPassword: (v: string) => void;
  /** Creating a password (vs. typing an existing one): sets autocomplete and shows the rule. */
  newPassword: boolean;
}) {
  return (
    <div className="space-y-3">
      <label className="block">
        <span className="sr-only">Email</span>
        <input type="email" value={email} onChange={(e) => onEmail(e.target.value)} placeholder="you@example.com" required autoComplete="email" maxLength={254} className={inputClass} />
      </label>
      <label className="block">
        <span className="sr-only">Password</span>
        <input
          type="password"
          value={password}
          onChange={(e) => onPassword(e.target.value)}
          placeholder={newPassword ? `Password (${PASSWORD_MIN}+ characters)` : "Password"}
          required
          minLength={newPassword ? PASSWORD_MIN : undefined}
          maxLength={200}
          autoComplete={newPassword ? "new-password" : "current-password"}
          className={inputClass}
        />
      </label>
    </div>
  );
}

/**
 * Shown to guests on the You screen: add an email and password to keep the
 * account. Everything already logged stays with it.
 */
export function SaveAccountPanel({ className }: { className?: string }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await saveGuestAccount({ email, password });
    if (!res.ok) {
      setError(res.error);
      setBusy(false);
      return;
    }
    // A fresh session carries the new email, so the app stops treating this as a guest.
    if (await signInWithPassword(email, password)) window.location.assign("/you");
    else window.location.assign("/login");
  }

  return (
    <section className={cn("rounded-2xl border border-signal/30 bg-signal/5 p-5", className)}>
      <p className="text-[17px] font-semibold text-ink">Save your account</p>
      <p className="mt-1 text-[14px] leading-relaxed text-ink-soft">
        You&apos;re on a guest account, so this browser is the only way back in. Add an email and password to keep your plan and everything you&apos;ve logged, and sign in from any device.
      </p>
      <form onSubmit={submit} className="mt-4 space-y-3">
        <CredentialFields email={email} password={password} onEmail={setEmail} onPassword={setPassword} newPassword />
        {error && (
          <p role="alert" className="text-sm leading-relaxed text-destructive">
            {error}
          </p>
        )}
        <button type="submit" disabled={busy} className="press flex h-[52px] w-full items-center justify-center gap-2 rounded-2xl bg-ink text-[15px] font-semibold text-white hover:bg-ink/85 disabled:opacity-60">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save my account"}
        </button>
      </form>
    </section>
  );
}
