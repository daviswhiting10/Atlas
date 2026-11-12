"use client";

import { useMemo, useState } from "react";
import { ImageOff, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { ExerciseThumb } from "@/components/ExercisePicture";
import { ExerciseMediaUpload } from "@/components/coach/ExerciseMediaUpload";
import type { Picture } from "@/lib/exercises/pictures";

export type LibraryRow = { id: string; name: string; picture: Picture | null; inPlans: boolean };

type Filter = "plans" | "missing" | "all";

/** The coach's exercises, each with its picture and a way to add or change their own. */
export function ExerciseLibrary({ rows, workspaceId, uploadsEnabled }: { rows: LibraryRow[]; workspaceId: string; uploadsEnabled: boolean }) {
  const [filter, setFilter] = useState<Filter>("plans");
  const [query, setQuery] = useState("");

  const counts = useMemo(
    () => ({ plans: rows.filter((r) => r.inPlans).length, missing: rows.filter((r) => r.inPlans && !r.picture).length, all: rows.length }),
    [rows]
  );
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => {
      if (q) return r.name.toLowerCase().includes(q); // a search looks through everything
      if (filter === "plans") return r.inPlans;
      if (filter === "missing") return r.inPlans && !r.picture;
      return true;
    });
  }, [rows, filter, query]);

  const tabs: Array<{ id: Filter; label: string }> = [
    { id: "plans", label: `In your plans · ${counts.plans}` },
    { id: "missing", label: `Needs a photo · ${counts.missing}` },
    { id: "all", label: `All · ${counts.all}` },
  ];

  return (
    <div className="space-y-4">
      {!uploadsEnabled && <p className="rounded-xl border border-line bg-white px-4 py-3 text-sm text-ink-soft">Uploads aren&rsquo;t set up yet: the storage token is missing.</p>}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div role="tablist" className="flex gap-1 overflow-x-auto rounded-2xl bg-ink/5 p-1">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={!query && filter === t.id}
              onClick={() => {
                setFilter(t.id);
                setQuery("");
              }}
              className={cn("press h-10 shrink-0 rounded-xl px-4 text-sm font-medium", !query && filter === t.id ? "bg-white text-ink shadow-sm" : "text-ink-soft hover:text-ink")}
            >
              {t.label}
            </button>
          ))}
        </div>
        <label className="flex h-11 flex-1 items-center gap-2 rounded-xl border border-line bg-white px-3 focus-within:border-ink/40">
          <Search className="h-4 w-4 shrink-0 text-ink-mute" />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Find an exercise" aria-label="Find an exercise" className="min-w-0 flex-1 bg-transparent text-[15px] text-ink outline-none placeholder:text-ink-mute" />
        </label>
      </div>

      {shown.length === 0 ? (
        <p className="rule pt-4 text-[15px] text-ink-soft">{query ? `No exercise called “${query}”.` : filter === "missing" ? "Every exercise in your plans has a picture." : "Nothing here yet."}</p>
      ) : (
        <ul className="divide-y divide-line rounded-2xl border border-line bg-white">
          {shown.map((r) => (
            <li key={r.id} className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center">
              <div className="flex min-w-0 flex-1 items-center gap-3">
                {r.picture ? (
                  <ExerciseThumb picture={r.picture} name={r.name} className="h-12 w-12" />
                ) : (
                  <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg border border-dashed border-line text-ink-mute">
                    <ImageOff className="h-4 w-4" />
                  </span>
                )}
                <div className="min-w-0">
                  <p className="truncate text-[15px] text-ink">{r.name}</p>
                  <p className="text-xs text-ink-mute">{r.picture?.own ? "Your photo" : r.picture ? "Library picture" : "No picture"}</p>
                </div>
              </div>
              {uploadsEnabled && (
                <div className="sm:shrink-0">
                  <ExerciseMediaUpload workspaceId={workspaceId} exerciseId={r.id} picture={r.picture} compact />
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
