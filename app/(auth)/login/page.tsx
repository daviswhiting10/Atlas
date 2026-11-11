"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRight, Loader2, Play } from "lucide-react";
import { Logo } from "@/components/athlete/Logo";
import { DemoButton } from "@/components/athlete/guest";
import { CredentialFields, GoogleButton, inputClass, signInWithPassword } from "@/components/athlete/account";

const primary =
  "press flex h-[52px] w-full items-center justify-center gap-2 rounded-2xl bg-ink text-[15px] font-semibold text-white hover:bg-ink/85 disabled:opacity-60";

export default function LoginPage() {
  const [mode, setMode] = useState<"password" | "link">("password");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function signInPassword(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    if (await signInWithPassword(email, password)) {
      // The home page sends each account to its own start: Today for athletes, Inbox for coaches.
      window.location.assign("/");
      return;
    }
    setError("That email and password don't match an account. Check them and try again.");
    setLoading(false);
  }

  async function sendLink(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const { signIn } = await import("next-auth/react");
    const res = await signIn("email", { email, redirect: false, callbackUrl: "/" });
    // Unknown addresses are refused server-side; say so rather than promise an email.
    if (res?.error) setError("We couldn't send a link to that address. Links are for existing accounts; to start fresh, create an account below.");
    else setSent(true);
    setLoading(false);
  }

  return (
    <div className="w-full max-w-sm px-6 py-10">
      <Link href="/" aria-label="Atlas home" className="inline-block">
        <Logo />
      </Link>

      {sent ? (
        <div className="rise mt-10">
          <h1 className="font-display text-4xl text-ink">Check your email</h1>
          <p className="mt-3 text-[15px] leading-relaxed text-ink-soft">
            A sign-in link is on its way to <strong className="font-semibold text-ink">{email}</strong>.
          </p>
          <button className="mt-5 text-sm font-medium text-signal underline-offset-4 hover:underline" onClick={() => setSent(false)}>
            Use a different email
          </button>
        </div>
      ) : (
        <div className="rise mt-10">
          <h1 className="font-display text-4xl text-ink">Welcome back</h1>
          <p className="mt-2 text-[15px] text-ink-soft">Sign in to pick up where you left off.</p>

          <GoogleButton callbackUrl="/" className="mt-7" />

          {mode === "password" ? (
            <form onSubmit={signInPassword} className="mt-3 space-y-3">
              <CredentialFields email={email} password={password} onEmail={setEmail} onPassword={setPassword} newPassword={false} />
              {error && (
                <p role="alert" className="text-sm leading-relaxed text-destructive">
                  {error}
                </p>
              )}
              <button type="submit" disabled={loading} className={primary}>
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Sign in"}
              </button>
            </form>
          ) : (
            <form onSubmit={sendLink} className="mt-3 space-y-3">
              <label className="block">
                <span className="sr-only">Email</span>
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" required autoComplete="email" className={inputClass} />
              </label>
              {error && (
                <p role="alert" className="text-sm leading-relaxed text-destructive">
                  {error}
                </p>
              )}
              <button type="submit" disabled={loading} className={primary}>
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Email me a sign-in link"}
              </button>
            </form>
          )}

          <button
            type="button"
            onClick={() => {
              setMode(mode === "password" ? "link" : "password");
              setError(null);
            }}
            className="mt-4 text-sm font-medium text-ink-soft underline-offset-4 hover:text-ink hover:underline"
          >
            {mode === "password" ? "Coach or invited client? Get a sign-in link instead" : "Sign in with a password instead"}
          </button>

          <div className="my-8 flex items-center gap-3 text-xs text-ink-mute">
            <span className="h-px flex-1 bg-line" /> New here? <span className="h-px flex-1 bg-line" />
          </div>

          <div className="space-y-3">
            <Link href="/start" className={primary}>
              Create an account <ArrowRight className="h-4 w-4" />
            </Link>
            <DemoButton className="press flex h-[52px] w-full items-center justify-center gap-2 rounded-2xl border border-line bg-white text-[15px] font-semibold text-ink hover:border-ink/20 disabled:opacity-60">
              <Play className="h-4 w-4 fill-current" /> Explore a live demo
            </DemoButton>
            <p className="text-center text-[13px] text-ink-mute">Answer a few questions and your plan is ready in under a minute.</p>
          </div>
        </div>
      )}
    </div>
  );
}
