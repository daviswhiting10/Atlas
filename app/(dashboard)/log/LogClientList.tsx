"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRight, Search, UserPlus } from "lucide-react";

export type LogRow = { id: string; name: string; hasPlan: boolean; next: string | null; lastTime: number };

export function LogClientList({ rows }: { rows: LogRow[] }) {
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const shown = q ? rows.filter((r) => r.name.toLowerCase().includes(q)) : rows;

  return (
    <div className="rise rise-1 space-y-4">
      {rows.length > 6 && (
        <label className="flex h-12 items-center gap-2 rounded-xl border border-line-strong bg-dusk-raised px-3.5 focus-within:border-ink/40">
          <Search className="h-4 w-4 shrink-0 text-ink-mute" />
          <span className="sr-only">Find a client</span>
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Find a client" className="min-w-0 flex-1 bg-transparent text-[16px] text-ink outline-none placeholder:text-ink-mute" />
        </label>
      )}

      {rows.length === 0 ? (
        <div className="surface p-6 text-center">
          <p className="text-[15px] font-semibold text-ink">No clients yet</p>
          <p className="mt-1 text-sm text-ink-soft">Add or import your clients, then log their sessions here.</p>
          <Link href="/clients" className="press mt-4 inline-flex h-11 items-center gap-2 rounded-xl bg-dusk-button px-5 text-sm font-semibold text-dusk-button-text hover:bg-dusk-button/85">
            <UserPlus className="h-4 w-4" /> Go to roster
          </Link>
        </div>
      ) : (
        <ul className="surface divide-y divide-line overflow-hidden">
          {shown.map((r) => (
            <li key={r.id} className="flex items-stretch">
              {/* The name and the line under it open the client's profile. */}
              <Link href={`/clients/${r.id}`} className="press flex min-h-[64px] min-w-0 flex-1 items-center gap-3 py-3 pl-4 pr-3 hover:bg-ink/[0.03]">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-ink/10 text-sm font-semibold text-ink">{r.name.charAt(0).toUpperCase()}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[16px] font-semibold text-ink">{r.name}</span>
                  <span className="block text-[13px] text-ink-mute">{r.hasPlan ? (r.next ?? "Plan finished") : "No plan yet"}</span>
                </span>
              </Link>
              {/* The shortcut: its own button, set apart by a divider and a gap so the two taps can't be mixed up. */}
              <div className="flex shrink-0 items-center border-l border-line pl-3 pr-4">
                <Link
                  href={r.hasPlan ? `/clients/${r.id}/log` : `/clients/${r.id}?tab=build`}
                  aria-label={`${r.hasPlan ? "Log a session for" : "Set up a plan for"} ${r.name}`}
                  className={r.hasPlan ? "press flex h-11 min-w-[72px] items-center justify-center gap-1 rounded-lg bg-dusk-button px-3 text-sm font-semibold text-dusk-button-text hover:bg-dusk-button/85" : "press flex h-11 min-w-[72px] items-center justify-center rounded-lg border border-line px-3 text-sm font-medium text-ink-soft"}
                >
                  {r.hasPlan ? (
                    <>
                      Log <ArrowRight className="h-3.5 w-3.5" />
                    </>
                  ) : (
                    "Set up plan"
                  )}
                </Link>
              </div>
            </li>
          ))}
          {shown.length === 0 && <li className="px-4 py-5 text-center text-sm text-ink-mute">No client matches &ldquo;{query}&rdquo;</li>}
        </ul>
      )}
    </div>
  );
}
