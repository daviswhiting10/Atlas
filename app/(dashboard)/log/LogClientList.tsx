"use client";

import { useState } from "react";
import Link from "next/link";
import { Activity, ArrowRight, Search, UserPlus } from "lucide-react";

export type LogRow = { id: string; name: string; hasPlan: boolean; next: string | null; lastLogged: string | null; lastTime: number };

export function LogClientList({ rows }: { rows: LogRow[] }) {
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const shown = q ? rows.filter((r) => r.name.toLowerCase().includes(q)) : rows;

  return (
    <div className="rise rise-1 space-y-4">
      {/* The coach's own training, one tap away too. */}
      <Link href="/today" className="press flex items-center gap-3 rounded-2xl bg-signal px-4 py-3.5 text-white hover:bg-signal/90">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/15">
          <Activity className="h-5 w-5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[16px] font-semibold">My training</span>
          <span className="block text-[13px] text-white/75">Log your own workout</span>
        </span>
        <ArrowRight className="h-5 w-5 shrink-0" />
      </Link>

      {rows.length > 6 && (
        <label className="flex h-12 items-center gap-2 rounded-xl border border-line bg-white px-3.5 focus-within:border-ink/40">
          <Search className="h-4 w-4 shrink-0 text-ink-mute" />
          <span className="sr-only">Find a client</span>
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Find a client" className="min-w-0 flex-1 bg-transparent text-[16px] text-ink outline-none placeholder:text-ink-mute" />
        </label>
      )}

      {rows.length === 0 ? (
        <div className="surface p-6 text-center">
          <p className="text-[15px] font-semibold text-ink">No clients yet</p>
          <p className="mt-1 text-sm text-ink-soft">Add or import your clients, then log their sessions here.</p>
          <Link href="/clients" className="press mt-4 inline-flex h-11 items-center gap-2 rounded-xl bg-ink px-5 text-sm font-semibold text-white hover:bg-ink/85">
            <UserPlus className="h-4 w-4" /> Go to roster
          </Link>
        </div>
      ) : (
        <ul className="surface divide-y divide-line overflow-hidden">
          {shown.map((r) => (
            <li key={r.id}>
              <Link
                href={r.hasPlan ? `/clients/${r.id}/log` : `/programs/new?client=${r.id}`}
                className="press flex items-center gap-3 px-4 py-3.5 hover:bg-ink/[0.03]"
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-ink text-sm font-semibold text-white">{r.name.charAt(0).toUpperCase()}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[16px] font-semibold text-ink">{r.name}</span>
                  <span className="block truncate text-[13px] text-ink-mute">
                    {r.hasPlan ? (r.next ? `Next: ${r.next}` : "Plan finished") : "No plan yet"}
                    {r.lastLogged ? ` · last ${r.lastLogged}` : ""}
                  </span>
                </span>
                <span className={r.hasPlan ? "flex h-9 shrink-0 items-center gap-1 rounded-lg bg-ink px-3 text-sm font-semibold text-white" : "flex h-9 shrink-0 items-center rounded-lg border border-line px-3 text-sm font-medium text-ink-soft"}>
                  {r.hasPlan ? (
                    <>
                      Log <ArrowRight className="h-3.5 w-3.5" />
                    </>
                  ) : (
                    "Set up plan"
                  )}
                </span>
              </Link>
            </li>
          ))}
          {shown.length === 0 && <li className="px-4 py-5 text-center text-sm text-ink-mute">No client matches &ldquo;{query}&rdquo;</li>}
        </ul>
      )}
    </div>
  );
}
