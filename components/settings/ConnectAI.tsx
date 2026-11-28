"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown, Loader2 } from "lucide-react";
import { createMcpToken, listMcpTokens, revokeMcpToken } from "@/lib/actions/mcp-tokens";
import { inputClass } from "@/components/athlete/account";
import { claudeCodeCommand, tokenLine } from "@/lib/mcp/connect";
import { cn } from "@/lib/utils";

type Token = Awaited<ReturnType<typeof listMcpTokens>>[number];

const primary = "press flex h-12 items-center justify-center gap-2 rounded-2xl bg-dusk-button px-5 text-[15px] font-semibold text-dusk-button-text hover:bg-dusk-button/85 disabled:opacity-60";
const secondary = "press flex h-12 items-center justify-center rounded-2xl border border-line bg-paper px-5 text-[15px] font-semibold text-ink-soft hover:border-ink/20 disabled:opacity-60";

/** A copy button that says "Copied" for a moment (announced to screen readers). */
function CopyButton({ text, label, className }: { text: string; label: string; className: string }) {
  const [copied, setCopied] = useState(false);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(t);
  }, [copied]);
  return (
    <button
      type="button"
      onClick={() =>
        navigator.clipboard.writeText(text).then(
          () => (setCopied(true), setFailed(false)),
          () => setFailed(true)
        )
      }
      className={className}
    >
      <span aria-live="polite">{copied ? "Copied" : failed ? "Select and copy it" : label}</span>
    </button>
  );
}

/**
 * Connect your AI: personal tokens that let an assistant (Claude Code, for one) use Atlas as an MCP server.
 * A new token is shown once, on this screen only, and is dropped from state at Done.
 */
/**
 * `collapsible` (the athlete's You tab): one "Connect your AI" row that opens in place, so You stays one screen. It opens
 * by itself when the page is reached at #connect-ai (the ⋯ menu's shortcut). Settings shows it open.
 */
export function ConnectAI({ className, collapsible = false }: { className?: string; collapsible?: boolean }) {
  const [open, setOpen] = useState(!collapsible);
  const [tokens, setTokens] = useState<Token[] | null>(null);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<{ name: string; token: string } | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [revoking, setRevoking] = useState(false);
  const [revokeError, setRevokeError] = useState<string | null>(null);
  const shownRef = useRef<HTMLDivElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);

  function load() {
    return listMcpTokens()
      .then(setTokens)
      .catch(() => setError("Couldn't load your tokens."));
  }
  useEffect(() => {
    if (open) void load();
  }, [open]);
  useEffect(() => {
    // Reached at #connect-ai (the ⋯ menu's shortcut): open it (You) and bring it into view (You and Settings). The
    // browser's own jump to the hash runs before this section has drawn, so it doesn't land.
    const fromHash = () => {
      if (window.location.hash !== "#connect-ai") return;
      setOpen(true);
      requestAnimationFrame(() => document.getElementById("connect-ai")?.scrollIntoView({ block: "start" }));
    };
    fromHash();
    window.addEventListener("hashchange", fromHash);
    return () => window.removeEventListener("hashchange", fromHash);
  }, []);
  useEffect(() => {
    if (created) shownRef.current?.focus();
  }, [created]);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await createMcpToken({ name, timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone }).catch(() => ({ ok: false as const, error: "Couldn't create a token. Please try again." }));
    setBusy(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setCreated({ name: res.name, token: res.token });
    setName("");
    void load();
  }

  function done() {
    setCreated(null);
    // After the token box is gone, back to the name field.
    requestAnimationFrame(() => nameRef.current?.focus());
  }

  async function revoke(id: string) {
    setRevoking(true);
    setRevokeError(null);
    const res = await revokeMcpToken({ id }).catch(() => ({ ok: false as const, error: "Couldn't revoke it. Please try again." }));
    setRevoking(false);
    if (!res.ok) {
      setRevokeError(res.error);
      return;
    }
    setConfirming(null);
    setTokens((ts) => ts?.map((t) => (t.id === id ? { ...t, revokedAt: new Date().toISOString() } : t)) ?? ts);
    void load();
  }

  return (
    <section aria-labelledby="connect-ai" className={cn("rounded-2xl border border-line bg-paper px-5 py-4", className)}>
      {collapsible ? (
        <h2 id="connect-ai" className="scroll-mt-24 text-[17px] font-semibold text-ink">
          <button type="button" aria-expanded={open} aria-controls="connect-ai-body" onClick={() => setOpen((o) => !o)} className="press -my-2 flex min-h-11 w-full items-center justify-between gap-3 text-left">
            Connect your AI
            <ChevronDown aria-hidden className={cn("h-4 w-4 shrink-0 text-ink-soft transition-transform", open && "rotate-180")} />
          </button>
        </h2>
      ) : (
        <h2 id="connect-ai" className="scroll-mt-24 text-[17px] font-semibold text-ink">
          Connect your AI
        </h2>
      )}
      {open && (
      <div id="connect-ai-body">
      <p className="mt-1 text-[14px] leading-relaxed text-ink-soft">Let an AI assistant read and log your training. Revoke any time.</p>

      {created ? (
        <div ref={shownRef} tabIndex={-1} className="mt-4 space-y-3 outline-none" aria-label={`Token for ${created.name}`}>
          <p className="text-[15px] font-semibold text-ink">{created.name}</p>
          <code className="block break-all rounded-2xl border border-line-strong bg-dusk-raised px-4 py-3 font-mono text-[14px] text-ink">{created.token}</code>
          <CopyButton text={created.token} label="Copy token" className={cn(primary, "w-full")} />
          <p className="pt-2 text-sm font-medium text-ink">For Claude Code, paste this in a terminal:</p>
          <code className="block break-all rounded-2xl border border-line bg-dusk-raised px-4 py-3 font-mono text-[13px] leading-relaxed text-ink-soft">
            {claudeCodeCommand(window.location.origin, created.token)}
          </code>
          <CopyButton text={claudeCodeCommand(window.location.origin, created.token)} label="Copy command" className={cn(secondary, "w-full")} />
          <p className="pt-2 text-sm font-semibold text-ink">You won&apos;t see this again.</p>
          <button type="button" onClick={done} className={cn(secondary, "w-full")}>
            Done
          </button>
        </div>
      ) : (
        <form onSubmit={create} className="mt-4 flex gap-2">
          <label className="min-w-0 flex-1">
            <span className="sr-only">Token name</span>
            <input ref={nameRef} value={name} onChange={(e) => setName(e.target.value)} placeholder="Claude on my laptop" required maxLength={80} className={inputClass} />
          </label>
          <button type="submit" disabled={busy || !name.trim()} className={cn(primary, "h-[52px] shrink-0")}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-label="Creating" /> : "Create"}
          </button>
        </form>
      )}
      {error && (
        <p role="alert" className="mt-2 text-sm leading-relaxed text-destructive">
          {error}
        </p>
      )}

      {tokens && tokens.length > 0 && (
        <ul className="mt-4 divide-y divide-line border-t border-line" aria-label="Your tokens">
          {tokens.map((t) => (
            <li key={t.id} className="py-3">
              <div className="flex min-h-11 items-center justify-between gap-3">
                <div className={cn("min-w-0", t.revokedAt && "opacity-50")}>
                  <p className={cn("truncate text-[15px] font-semibold text-ink", t.revokedAt && "line-through decoration-ink-mute")}>{t.name}</p>
                  <p className="text-[13px] text-ink-mute">{tokenLine(t)}</p>
                </div>
                {!t.revokedAt && confirming !== t.id && (
                  <button
                    type="button"
                    onClick={() => (setConfirming(t.id), setRevokeError(null))}
                    aria-label={`Revoke ${t.name}`}
                    className="press -mr-2 flex min-h-11 min-w-11 shrink-0 items-center justify-center px-2 text-sm font-semibold text-ink-soft hover:text-destructive"
                  >
                    Revoke
                  </button>
                )}
              </div>
              {confirming === t.id && (
                <div role="group" aria-label={`Revoke ${t.name}?`} className="mt-2 space-y-2">
                  <p className="text-sm text-ink-soft">Anything using it stops working right away.</p>
                  {revokeError && (
                    <p role="alert" className="text-sm text-destructive">
                      {revokeError}
                    </p>
                  )}
                  <div className="flex gap-2">
                    <button type="button" onClick={() => setConfirming(null)} className={cn(secondary, "flex-1")}>
                      Cancel
                    </button>
                    <button type="button" autoFocus disabled={revoking} onClick={() => void revoke(t.id)} className="press flex h-12 flex-1 items-center justify-center gap-2 rounded-2xl bg-destructive text-[15px] font-semibold text-destructive-foreground hover:bg-destructive/85 disabled:opacity-60">
                      {revoking ? <Loader2 className="h-4 w-4 animate-spin" aria-label="Revoking" /> : "Revoke"}
                    </button>
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      </div>
      )}
    </section>
  );
}
