"use client";

import { useState } from "react";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import { requestPasswordReset, resetPassword, setAccountPassword, snoozePasswordStep } from "@/lib/actions/account";
import { inputClass, signInWithPassword } from "@/components/athlete/account";
import { PASSWORD_MIN } from "@/lib/password-rules";

const primary =
  "press flex h-[52px] w-full items-center justify-center gap-2 rounded-2xl bg-ink text-[15px] font-semibold text-white hover:bg-ink/85 disabled:opacity-60";
const quiet = "text-sm font-medium text-ink-soft underline-offset-4 hover:text-ink hover:underline";

function Problem({ text }: { text: string | null }) {
  if (!text) return null;
  return (
    <p role="alert" className="text-sm leading-relaxed text-destructive">
      {text}
    </p>
  );
}

function NewPasswordInput({ value, onChange, autoFocus }: { value: string; onChange: (v: string) => void; autoFocus?: boolean }) {
  return (
    <label className="block">
      <span className="sr-only">New password</span>
      <input
        type="password"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={`New password (${PASSWORD_MIN}+ characters)`}
        required
        minLength={PASSWORD_MIN}
        maxLength={200}
        autoComplete="new-password"
        autoFocus={autoFocus}
        className={inputClass}
      />
    </label>
  );
}

/** /forgot-password: ask for a reset link. The answer never says whether the address has an account. */
export function ForgotPasswordForm() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await requestPasswordReset({ email });
    setBusy(false);
    if (res.ok) setSent(true);
    else setError(res.error);
  }

  if (sent) {
    return (
      <div className="rise mt-10">
        <h1 className="font-display text-4xl text-ink">Check your email</h1>
        <p className="mt-3 text-[15px] leading-relaxed text-ink-soft">
          If <strong className="font-semibold text-ink">{email}</strong> has an Atlas account, a link to choose a new password is on its way. It works for 30 minutes.
        </p>
        <Link href="/login" className={`mt-5 inline-block ${quiet}`}>
          Back to sign in
        </Link>
      </div>
    );
  }

  return (
    <div className="rise mt-10">
      <h1 className="font-display text-4xl text-ink">Forgot your password?</h1>
      <p className="mt-2 text-[15px] text-ink-soft">We&apos;ll email you a link to choose a new one.</p>
      <form onSubmit={submit} className="mt-7 space-y-3">
        <label className="block">
          <span className="sr-only">Email</span>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" required autoComplete="email" maxLength={254} autoFocus className={inputClass} />
        </label>
        <Problem text={error} />
        <button type="submit" disabled={busy} className={primary}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Email me a link"}
        </button>
      </form>
      <Link href="/login" className={`mt-4 inline-block ${quiet}`}>
        Back to sign in
      </Link>
    </div>
  );
}

/** /reset-password?token=…: choose a new password, then sign straight in. */
export function ResetPasswordForm({ token }: { token: string }) {
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expired, setExpired] = useState(!token);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await resetPassword({ token, password });
    if (!res.ok) {
      setBusy(false);
      setError(res.error);
      if (res.expired) setExpired(true);
      return;
    }
    if (await signInWithPassword(res.email, password)) window.location.assign("/");
    else window.location.assign("/login");
  }

  if (expired) {
    return (
      <div className="rise mt-10">
        <h1 className="font-display text-4xl text-ink">Link expired</h1>
        <p className="mt-3 text-[15px] leading-relaxed text-ink-soft">This link has expired or has already been used. Reset links work once, for 30 minutes.</p>
        <Link href="/forgot-password" className={`mt-7 ${primary}`}>
          Get a new link
        </Link>
      </div>
    );
  }

  return (
    <div className="rise mt-10">
      <h1 className="font-display text-4xl text-ink">Choose a new password</h1>
      <p className="mt-2 text-[15px] text-ink-soft">You&apos;ll be signed out everywhere else.</p>
      <form onSubmit={submit} className="mt-7 space-y-3">
        <NewPasswordInput value={password} onChange={setPassword} autoFocus />
        <Problem text={error} />
        <button type="submit" disabled={busy} className={primary}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save and sign in"}
        </button>
      </form>
    </div>
  );
}

/** /set-password: the step for signed-in accounts without a password. */
export function SetPasswordStep({ email, canSnooze }: { email: string; canSnooze: boolean }) {
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState<"save" | "snooze" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy("save");
    setError(null);
    const res = await setAccountPassword({ password });
    if (!res.ok) {
      setBusy(null);
      setError(res.error);
      return;
    }
    window.location.assign("/");
  }

  async function snooze() {
    setBusy("snooze");
    setError(null);
    const res = await snoozePasswordStep();
    if (!res.ok) {
      setBusy(null);
      setError(res.error);
      return;
    }
    window.location.assign("/");
  }

  async function signOutNow() {
    const { signOut } = await import("next-auth/react");
    await signOut({ callbackUrl: `${window.location.origin}/login` });
  }

  return (
    <div className="rise mt-10">
      <h1 className="font-display text-4xl text-ink">Set a password</h1>
      <p className="mt-2 text-[15px] leading-relaxed text-ink-soft">
        So you can sign in as <strong className="font-semibold text-ink">{email}</strong> on any device, including the app on your home screen, without waiting for an email.
      </p>
      <form onSubmit={save} className="mt-7 space-y-3">
        {/* Lets password managers file the new password under the right account. */}
        <input type="email" value={email} readOnly autoComplete="username" className="sr-only" tabIndex={-1} aria-hidden />
        <NewPasswordInput value={password} onChange={setPassword} autoFocus />
        <Problem text={error} />
        <button type="submit" disabled={busy !== null} className={primary}>
          {busy === "save" ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save password"}
        </button>
      </form>
      <div className="mt-4 flex items-center justify-between">
        {canSnooze ? (
          <button type="button" onClick={snooze} disabled={busy !== null} className={quiet}>
            {busy === "snooze" ? "One moment…" : "Not now"}
          </button>
        ) : (
          <span />
        )}
        <button type="button" onClick={signOutNow} className={quiet}>
          Sign out
        </button>
      </div>
    </div>
  );
}
