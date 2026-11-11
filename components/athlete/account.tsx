"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { saveGuestAccount, setAccountPassword } from "@/lib/actions/account";
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

/**
 * Set (or change) the password on a signed-in account. For people who came
 * in by link, it means they can sign in any time without an email.
 */
export function PasswordPanel({ email, hasPassword, className }: { email: string; hasPassword: boolean; className?: string }) {
  const [has, setHas] = useState(hasPassword);
  const [open, setOpen] = useState(!hasPassword);
  const [current, setCurrent] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await setAccountPassword({ password, current: has ? current : undefined });
    setBusy(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setHas(true);
    setOpen(false);
    setCurrent("");
    setPassword("");
    setDone(true);
  }

  return (
    <section className={cn("rounded-2xl border border-line bg-white p-5", className)}>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-[17px] font-semibold text-ink">{has ? "Password" : "Set a password"}</p>
          <p className="mt-1 text-[14px] leading-relaxed text-ink-soft">
            {done
              ? "Saved. Sign in any time with your email and this password."
              : has
                ? `You sign in as ${email} with a password.`
                : `So you can sign in as ${email} any time, without waiting for an email link.`}
          </p>
        </div>
        {has && !open && (
          <button type="button" onClick={() => setOpen(true)} className="press shrink-0 text-sm font-semibold text-signal hover:underline">
            Change
          </button>
        )}
      </div>
      {open && (
        <form onSubmit={submit} className="mt-4 space-y-3">
          {/* Lets password managers file the new password under the right account. */}
          <input type="email" value={email} readOnly autoComplete="username" className="sr-only" tabIndex={-1} aria-hidden />
          {has && (
            <input
              type="password"
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
              placeholder="Current password"
              required
              autoComplete="current-password"
              maxLength={200}
              className={inputClass}
            />
          )}
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={`New password (${PASSWORD_MIN}+ characters)`}
            required
            minLength={PASSWORD_MIN}
            maxLength={200}
            autoComplete="new-password"
            className={inputClass}
          />
          {error && (
            <p role="alert" className="text-sm leading-relaxed text-destructive">
              {error}
            </p>
          )}
          <div className="flex gap-2">
            {has && (
              <button type="button" onClick={() => setOpen(false)} className="press h-12 flex-1 rounded-2xl border border-line bg-white text-[15px] font-semibold text-ink-soft hover:border-ink/20">
                Cancel
              </button>
            )}
            <button type="submit" disabled={busy} className="press flex h-12 flex-[2] items-center justify-center gap-2 rounded-2xl bg-ink text-[15px] font-semibold text-white hover:bg-ink/85 disabled:opacity-60">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save password"}
            </button>
          </div>
        </form>
      )}
    </section>
  );
}

/** Where the plan wizard parks its answers while the athlete signs in with Google. */
export const PENDING_PLAN_KEY = "atlas-pending-plan";

/**
 * "Continue with Google", shown only when Google sign-in is configured on the
 * server. `beforeRedirect` runs first (the wizard uses it to keep the answers).
 */
export function GoogleButton({ callbackUrl, label = "Continue with Google", beforeRedirect, className }: { callbackUrl: string; label?: string; beforeRedirect?: () => void; className?: string }) {
  const [enabled, setEnabled] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let live = true;
    fetch("/api/auth/providers")
      .then((r) => (r.ok ? r.json() : {}))
      .then((p: Record<string, unknown>) => live && setEnabled(Boolean(p?.google)))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, []);

  if (!enabled) return null;
  return (
    <button
      type="button"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        beforeRedirect?.();
        const { signIn } = await import("next-auth/react");
        await signIn("google", { callbackUrl });
      }}
      className={cn(
        "press flex h-[52px] w-full items-center justify-center gap-2.5 rounded-2xl border border-line bg-white text-[15px] font-semibold text-ink hover:border-ink/25 disabled:opacity-60",
        className
      )}
    >
      {busy ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" aria-hidden="true">
          <path fill="#4285F4" d="M23.5 12.27c0-.85-.08-1.67-.22-2.45H12v4.63h6.46a5.52 5.52 0 0 1-2.4 3.62v3h3.88c2.27-2.09 3.56-5.17 3.56-8.8z" />
          <path fill="#34A853" d="M12 24c3.24 0 5.96-1.07 7.94-2.91l-3.88-3.01c-1.07.72-2.45 1.15-4.06 1.15-3.12 0-5.77-2.11-6.71-4.95H1.28v3.11A12 12 0 0 0 12 24z" />
          <path fill="#FBBC05" d="M5.29 14.28A7.2 7.2 0 0 1 4.91 12c0-.79.14-1.56.38-2.28V6.61H1.28A12 12 0 0 0 0 12c0 1.94.46 3.77 1.28 5.39l4.01-3.11z" />
          <path fill="#EA4335" d="M12 4.77c1.76 0 3.34.61 4.59 1.8l3.44-3.44C17.95 1.19 15.24 0 12 0A12 12 0 0 0 1.28 6.61l4.01 3.11C6.23 6.88 8.88 4.77 12 4.77z" />
        </svg>
      )}
      {label}
    </button>
  );
}
