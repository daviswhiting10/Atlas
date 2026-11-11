import type { Metadata } from "next";
import Link from "next/link";
import { Play } from "lucide-react";
import { Logo } from "@/components/athlete/Logo";
import { ConnectTabs, type ConnectOption } from "@/components/athlete/ConnectTabs";
import { AgentDemo } from "@/components/agents/AgentDemo";
import { TOOLS } from "@/lib/mcp/server";

export const metadata: Metadata = {
  title: "For AI assistants",
  description: "Atlas speaks the Model Context Protocol: an AI assistant can read a training plan, analyse progress and log workouts, scoped to exactly one athlete.",
};

const GUARANTEES = [
  {
    title: "Scoped to one person",
    body: "The caller is resolved once and bound into every tool. No tool accepts a workspace or user id, so an assistant cannot widen its own access.",
    code: 'get_workout_history\n  {"clientId": "someone-else"}\n→ 404 not found',
  },
  {
    title: "404, never 403",
    body: "Reaching for another athlete's data says “not found”, not “forbidden”, so a refusal never confirms that a record exists.",
    code: "save_program\n→ 403 role may not use this tool\nget_program_details\n→ 404 not yours, or not there",
  },
  {
    title: "Every call is logged",
    body: "Reads, writes and refusals each write one audit row: who, which tool, on whom, the outcome. Arguments are stored as a hash, never in the clear.",
    code: "tool: log_workout · role: CLIENT\noutcome: ok · args: sha256 a41f…9c",
  },
];

const CONNECT: ConnectOption[] = [
  {
    label: "Claude Code",
    code: "claude mcp add atlas -e ATLAS_MCP_AS=demo -- npm run --silent mcp",
    note: "Run it from the Atlas repo. It serves a demo athlete with nine weeks of history; nothing real is exposed.",
  },
  {
    label: "Cursor",
    code: '{\n  "mcpServers": {\n    "atlas": {\n      "command": "npm",\n      "args": ["run", "--silent", "mcp"],\n      "env": { "ATLAS_MCP_AS": "demo" }\n    }\n  }\n}',
    note: "Save as .cursor/mcp.json in the Atlas repo. The repo already ships the same file as .mcp.json for clients that read it.",
  },
  {
    label: "As yourself",
    code: "ATLAS_MCP_USER_EMAIL=you@example.com npm run mcp",
    note: "Serves an existing Atlas account. Its role and workspace apply, exactly as they do in the app.",
  },
  {
    label: "HTTP",
    code: "POST /api/mcp\nAccept: application/json, text/event-stream\n\n{ \"jsonrpc\": \"2.0\", \"id\": 1, \"method\": \"tools/list\" }",
    note: "Streamable HTTP, authenticated by the same signed-in session as the app. Remote assistants need OAuth 2.1, which is the next phase and is deliberately not faked with ad-hoc tokens.",
  },
];

const PERMISSION_LABEL = { read: "Read", write: "Write", generate: "Generate" } as const;

export default function AgentsPage() {
  const everyone = TOOLS.filter((t) => t.roles.includes("CLIENT")).length;

  return (
    <div className="app-ui min-h-screen bg-bone">
      <header className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5 sm:h-20 sm:px-8">
        <Link href="/" aria-label="Atlas home">
          <Logo />
        </Link>
        <nav className="flex items-center gap-1.5 sm:gap-3">
          <Link href="/agents" aria-current="page" className="hidden rounded-full px-3 py-2 text-sm font-semibold text-ink sm:block">
            For AI assistants
          </Link>
          <Link href="/start" className="press rounded-full bg-ink px-4 py-2 text-sm font-semibold text-white hover:bg-ink/85">
            Get started
          </Link>
        </nav>
      </header>

      <main>
        {/* ── Hero ─────────────────────────────────────────────────────── */}
        <section className="mx-auto max-w-4xl px-5 pb-12 pt-8 text-center sm:px-8 sm:pt-14">
          <div className="rise">
            <p className="eyebrow">/agents · Atlas for AI assistants</p>
            <h1 className="mx-auto mt-4 max-w-3xl text-[44px] leading-[1.02] text-ink sm:text-[60px]">Your assistant can read your training. And log it.</h1>
            <p className="mt-5 text-lg font-semibold text-ink">It works on your plan. It stays inside your data.</p>
            <p className="mx-auto mt-3 max-w-2xl text-[16px] leading-relaxed text-ink-soft">
              Atlas is also a Model Context Protocol server. An assistant connects once and can see the plan, analyse progress, spot a stalled lift and log
              the session, through the same rules the app itself uses.
            </p>
            <div className="mt-7 flex flex-col justify-center gap-3 sm:flex-row">
              <a href="#demo" className="press flex h-12 items-center justify-center gap-2 rounded-xl bg-ink px-6 text-[15px] font-semibold text-white hover:bg-ink/85">
                <Play className="h-4 w-4 fill-current" /> Watch the demo
              </a>
              <a href="#tools" className="press flex h-12 items-center justify-center rounded-xl border border-line bg-white px-6 text-[15px] font-semibold text-ink hover:border-ink/25">
                See the {TOOLS.length} tools
              </a>
            </div>
          </div>
        </section>

        {/* ── Demo ─────────────────────────────────────────────────────── */}
        <section id="demo" className="mx-auto max-w-6xl scroll-mt-6 px-5 pb-16 sm:px-8">
          <div className="rise rise-1 mb-6 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
            <h2 className="text-3xl text-ink">See it in action.</h2>
            <p className="text-[15px] text-ink-soft">One athlete, one assistant, fourteen steps. Press play.</p>
          </div>
          <div className="rise rise-1">
            <AgentDemo />
          </div>
        </section>

        {/* ── Facts strip ──────────────────────────────────────────────── */}
        <div className="mx-auto max-w-6xl px-5 sm:px-8">
          <p className="rule flex flex-wrap items-center justify-center gap-x-3 gap-y-1 border-b border-line py-5 text-center text-[13px] text-ink-mute">
            <code className="font-mono text-ink-soft">/api/mcp</code>
            <span aria-hidden="true">·</span> Streamable HTTP and STDIO
            <span aria-hidden="true">·</span> <code className="font-mono text-ink-soft">npm run mcp</code>
            <span aria-hidden="true">·</span> {TOOLS.length} tools, 4 resources
            <span aria-hidden="true">·</span> Works with Claude Code, Cursor and any MCP client
          </p>
        </div>

        {/* ── Why ──────────────────────────────────────────────────────── */}
        <section className="mx-auto max-w-4xl px-5 py-16 sm:px-8 sm:py-20">
          <p className="eyebrow">Why this exists</p>
          <p className="mt-5 text-[26px] font-medium leading-[1.35] tracking-tight text-ink sm:text-[32px]">
            People already ask an assistant what to lift today. It answers from memory and guesswork. Atlas gives it the real thing: the plan as written,
            every set as logged, and the same progression rules the app coaches with, so the answer is the athlete&apos;s own data and not a generic one.
          </p>
          <dl className="rule mt-10 grid gap-8 pt-8 sm:grid-cols-3">
            <div>
              <dt className="text-4xl font-semibold tracking-tight text-ink">{TOOLS.length}</dt>
              <dd className="mt-1.5 text-sm leading-relaxed text-ink-soft">tools, {everyone} of them open to an athlete on their own data</dd>
            </div>
            <div>
              <dt className="text-4xl font-semibold tracking-tight text-ink">0</dt>
              <dd className="mt-1.5 text-sm leading-relaxed text-ink-soft">AI-written advice in recommendations: every value traces to a rule in the code</dd>
            </div>
            <div>
              <dt className="text-4xl font-semibold tracking-tight text-ink">1 row</dt>
              <dd className="mt-1.5 text-sm leading-relaxed text-ink-soft">in the audit log for every call, including the ones that were refused</dd>
            </div>
          </dl>
        </section>

        {/* ── Guarantees ───────────────────────────────────────────────── */}
        <section className="border-y border-line bg-white/60">
          <div className="mx-auto max-w-6xl px-5 py-16 sm:px-8 sm:py-20">
            <h2 className="text-3xl text-ink sm:text-4xl">Built to be trusted with someone&apos;s data.</h2>
            <p className="mt-3 max-w-2xl text-[16px] leading-relaxed text-ink-soft">
              Typed inputs, structured results, and one pipeline for every call: role gate, validation, scoping, handler, audit.
            </p>
            <div className="mt-9 grid gap-4 md:grid-cols-3">
              {GUARANTEES.map((g) => (
                <div key={g.title} className="surface flex flex-col p-6">
                  <h3 className="text-lg text-ink">{g.title}</h3>
                  <p className="mt-2 flex-1 text-[15px] leading-relaxed text-ink-soft">{g.body}</p>
                  <pre className="mt-5 whitespace-pre-wrap break-words rounded-lg border border-line bg-bone p-3.5 font-mono text-[12px] leading-relaxed text-ink-soft">
                    <code>{g.code}</code>
                  </pre>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── Tools ────────────────────────────────────────────────────── */}
        <section id="tools" className="mx-auto max-w-6xl scroll-mt-8 px-5 py-16 sm:px-8 sm:py-20">
          <h2 className="text-3xl text-ink sm:text-4xl">The tools.</h2>
          <p className="mt-3 max-w-2xl text-[16px] leading-relaxed text-ink-soft">
            This list is generated from the server&apos;s own definitions, so it is always what the server actually exposes.
          </p>
          <div className="rule mt-8 divide-y divide-line border-b border-line">
            {TOOLS.map((t) => (
              <div key={t.name} className="grid gap-x-6 gap-y-1 py-4 sm:grid-cols-[minmax(0,260px)_minmax(0,1fr)_auto] sm:items-baseline">
                <code className="font-mono text-[13.5px] font-medium text-ink">{t.name}</code>
                <p className="text-[15px] leading-relaxed text-ink-soft">{t.description}</p>
                <p className="flex gap-2 text-xs text-ink-mute sm:justify-end">
                  <span className={t.permission === "read" ? "" : "font-semibold text-signal"}>{PERMISSION_LABEL[t.permission]}</span>
                  <span aria-hidden="true">·</span>
                  <span>{t.roles.includes("CLIENT") ? "Athlete and coach" : "Coach only"}</span>
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* ── Connect ──────────────────────────────────────────────────── */}
        <section id="connect" className="scroll-mt-8 border-t border-line bg-white/60">
          <div className="mx-auto max-w-4xl px-5 py-16 sm:px-8 sm:py-20">
            <h2 className="text-3xl text-ink sm:text-4xl">Connect in one step.</h2>
            <p className="mt-3 max-w-2xl text-[16px] leading-relaxed text-ink-soft">
              The local server runs from the repository and talks to your assistant over STDIO. Start with the demo athlete.
            </p>
            <div className="mt-8">
              <ConnectTabs options={CONNECT} />
            </div>
          </div>
        </section>
      </main>

      <footer className="mx-auto flex max-w-6xl flex-col items-start justify-between gap-3 px-5 py-8 text-sm text-ink-mute sm:flex-row sm:items-center sm:px-8">
        <Link href="/" aria-label="Atlas home">
          <Logo />
        </Link>
        <p>Model Context Protocol · role-aware · audited. The authorization matrix for every tool is unit-tested.</p>
      </footer>
    </div>
  );
}
