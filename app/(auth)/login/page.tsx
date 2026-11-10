"use client";

import { useState } from "react";
import Link from "next/link";
import { signIn } from "next-auth/react";
import { ArrowRight, Loader2, Play } from "lucide-react";
import { Logo } from "@/components/athlete/Logo";
import { DemoButton } from "@/components/athlete/guest";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    await signIn("email", { email, redirect: false, callbackUrl: "/inbox" });
    setSent(true);
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
          <button className="mt-5 text-sm font-medium text-blue underline-offset-4 hover:underline" onClick={() => setSent(false)}>
            Use a different email
          </button>
        </div>
      ) : (
        <div className="rise mt-10">
          <h1 className="font-display text-4xl text-ink">Welcome back</h1>
          <p className="mt-2 text-[15px] text-ink-soft">Coaches and invited clients sign in with a link sent by email.</p>

          <form onSubmit={handleSubmit} className="mt-7 space-y-3">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
              autoComplete="email"
              className="h-13 h-[52px] w-full rounded-2xl border border-line bg-white px-4 text-ink outline-none transition-shadow placeholder:text-ink-mute/60 focus:border-blue focus:shadow-[0_0_0_3px_rgba(43,107,255,0.14)]"
            />
            <button
              type="submit"
              disabled={loading}
              className="press flex h-[52px] w-full items-center justify-center gap-2 rounded-2xl bg-ink text-[15px] font-semibold text-white hover:bg-ink/85 disabled:opacity-60"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Email me a sign-in link"}
            </button>
          </form>

          <div className="my-8 flex items-center gap-3 text-xs text-ink-mute">
            <span className="h-px flex-1 bg-line" /> New here? <span className="h-px flex-1 bg-line" />
          </div>

          <div className="space-y-3">
            <Link
              href="/start"
              className="press flex h-[52px] w-full items-center justify-center gap-2 rounded-2xl bg-blue text-[15px] font-semibold text-white shadow-[0_12px_24px_-12px_rgba(43,107,255,0.9)] hover:bg-blue-deep"
            >
              Build my plan <ArrowRight className="h-4 w-4" />
            </Link>
            <DemoButton className="press flex h-[52px] w-full items-center justify-center gap-2 rounded-2xl border border-line bg-white text-[15px] font-semibold text-ink hover:border-ink/20 disabled:opacity-60">
              <Play className="h-4 w-4 fill-current" /> Explore a live demo
            </DemoButton>
            <p className="text-center text-[13px] text-ink-mute">No email or password needed for either.</p>
          </div>
        </div>
      )}
    </div>
  );
}
