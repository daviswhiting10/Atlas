"use client";

import { useMemo, useState } from "react";
import { ImageOff, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { onTablistKeyDown } from "@/lib/ui/tab-keys";
import { ExerciseThumb } from "@/components/ExercisePicture";
import type { Picture } from "@/lib/exercises/pictures";
import { ExerciseName } from "@/components/ExerciseName";

export type LibraryRow = { id: string; name: string; picture: Picture | null; inPlans: boolean };

type Filter = "plans" | "all";

/** The coach's exercises, each with its picture. */
/** Rows shown before "Show all N". */
const FIRST_ROWS = 5;

export function ExerciseLibrary({ rows }: { rows: LibraryRow[] }) {
  const [filter, setFilter] = useState<Filter>("plans");
  const [query, setQuery] = useState("");

  // The first rows, then "Show all": the list grows with the library, and a search looks through everything.
  const [showAll, setShowAll] = useState(false);
  const counts = useMemo(
    () => ({ plans: rows.filter((r) => r.inPlans).length, all: rows.length }),
    [rows]
  );
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => {
      if (q) return r.name.toLowerCase().includes(q); // a search looks through everything
      if (filter === "plans") return r.inPlans;
      return true;
    });
  }, [rows, filter, query]);

  const tabs: Array<{ id: Filter; label: string }> = [
    { id: "plans", label: `In your plans · ${counts.plans}` },
    { id: "all", label: `All · ${counts.all}` },
  ];

  function pick(id: Filter) {
    setFilter(id);
    setQuery("");
    setShowAll(false);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div role="tablist" className="flex gap-1 overflow-x-auto rounded-2xl bg-ink/5 p-1" onKeyDown={(e) => onTablistKeyDown(e, (i) => pick(tabs[i].id))}>
          {tabs.map((t, i) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={!query && filter === t.id}
              tabIndex={(!query && filter === t.id) || (query && i === 0) ? 0 : -1}
              onClick={() => pick(t.id)}
              className={cn("press h-10 shrink-0 rounded-xl px-4 text-sm font-medium", !query && filter === t.id ? "bg-dusk-selected text-dusk-selected-text shadow-sm" : "text-ink-soft hover:text-ink")}
            >
              {t.label}
            </button>
          ))}
        </div>
        <label className="flex h-11 flex-1 items-center gap-2 rounded-xl border border-line bg-paper px-3 focus-within:border-ink/40">
          <Search className="h-4 w-4 shrink-0 text-ink-mute" />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Find an exercise" aria-label="Find an exercise" className="min-w-0 flex-1 bg-transparent text-[15px] text-ink outline-none placeholder:text-ink-mute" />
        </label>
      </div>

      {shown.length === 0 ? (
        <p className="rule pt-4 text-[15px] text-ink-soft">{query ? `No exercise called “${query}”.` : "Nothing here yet."}</p>
      ) : (
        <ul className="divide-y divide-line rounded-2xl border border-line bg-paper">
          {(showAll || query ? shown : shown.slice(0, FIRST_ROWS)).map((r) => (
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
                  <ExerciseName as="p" name={r.name} className="text-[15px] text-ink" />
                  <p className="text-xs text-ink-mute">{r.picture?.own ? "Your photo" : r.picture ? "Library picture" : "No picture"}</p>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
      {!query && !showAll && shown.length > FIRST_ROWS && (
        <button type="button" onClick={() => setShowAll(true)} className="press flex min-h-11 w-full items-center justify-center rounded-xl border border-line text-[15px] font-medium text-ink-soft hover:text-ink">
          Show all {shown.length}
        </button>
      )}
    </div>
  );
}
