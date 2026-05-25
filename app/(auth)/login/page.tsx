"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { Zap } from "lucide-react";

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

  if (sent) {
    return (
      <div className="w-full max-w-sm text-center space-y-3 px-6">
        <h1
          className="font-display text-3xl"
          style={{ color: "var(--ink)" }}
        >
          Check your email
        </h1>
        <p className="text-sm" style={{ color: "var(--ink-mute)" }}>
          A sign-in link was sent to{" "}
          <strong style={{ color: "var(--ink-soft)" }}>{email}</strong>. Click
          the link to access Atlas.
        </p>
        <p className="text-xs pt-2" style={{ color: "var(--ink-mute)" }}>
          No email? Check your spam folder, or{" "}
          <button
            className="underline underline-offset-2 transition-colors hover:opacity-80"
            style={{ color: "var(--blue)" }}
            onClick={() => setSent(false)}
          >
            try again
          </button>
          .
        </p>
      </div>
    );
  }

  return (
    <div className="w-full max-w-sm space-y-8 px-6">
      {/* Logo mark */}
      <div className="flex flex-col items-center gap-4 text-center">
        <div
          className="w-12 h-12 rounded-xl flex items-center justify-center"
          style={{
            background: "var(--blue)",
            boxShadow: "0 0 24px 4px rgba(37,99,235,0.35)",
          }}
        >
          <Zap className="w-6 h-6 text-white" strokeWidth={2.5} />
        </div>
        <div className="space-y-1">
          <h1
            className="font-display text-4xl"
            style={{ color: "var(--ink)" }}
          >
            Atlas
          </h1>
          <p className="text-sm" style={{ color: "var(--ink-mute)" }}>
            Enter your email to receive a sign-in link.
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-3">
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          required
          autoFocus
          className="w-full rounded-lg px-3 py-2.5 text-sm outline-none transition-all"
          style={{
            border: "1px solid var(--line)",
            background: "var(--paper)",
            color: "var(--ink)",
            fontFamily: "var(--font-body), Georgia, serif",
          }}
          onFocus={(e) => {
            e.currentTarget.style.borderColor = "var(--blue)";
            e.currentTarget.style.boxShadow = "0 0 0 3px rgba(37,99,235,0.15)";
          }}
          onBlur={(e) => {
            e.currentTarget.style.borderColor = "var(--line)";
            e.currentTarget.style.boxShadow = "none";
          }}
        />
        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-lg px-4 py-2.5 text-sm font-medium text-white transition-all disabled:opacity-50"
          style={{
            background: loading ? "var(--blue-deep)" : "var(--blue)",
          }}
        >
          {loading ? "Sending…" : "Send magic link"}
        </button>
      </form>
    </div>
  );
}
