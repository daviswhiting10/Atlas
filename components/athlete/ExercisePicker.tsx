"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Search, X } from "lucide-react";
import { CATALOG, type CatalogExercise } from "@/lib/plan/catalog";
import { cn } from "@/lib/utils";

const REGION_LABEL = { upper: "Upper body", lower: "Lower body", core: "Core and carries" } as const;
const TOOL_LABEL = { barbell: "Barbell", dumbbell: "Dumbbell", machine: "Machine", cable: "Cable", bodyweight: "Bodyweight" } as const;

/**
 * Pick an exercise from Atlas's catalog. Used wherever a plan can change:
 * adding to a workout, swapping mid-session.
 */
export function ExercisePicker({
  title,
  exclude = [],
  suggestLike,
  onPick,
  onClose,
}: {
  title: string;
  /** Slugs already in the workout: shown as unavailable. */
  exclude?: string[];
  /** When swapping, exercises that train the same pattern are listed first. */
  suggestLike?: string | null;
  onPick: (exercise: CatalogExercise) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    const like = suggestLike ? CATALOG.find((e) => e.slug === suggestLike) : null;
    const matches = CATALOG.filter((e) => !q || e.name.toLowerCase().includes(q) || e.muscles.some((m) => m.includes(q)) || TOOL_LABEL[e.tool].toLowerCase().includes(q));

    const out: Array<{ label: string; items: CatalogExercise[] }> = [];
    if (like && !q) {
      const similar = matches.filter((e) => e.slug !== like.slug && e.pattern === like.pattern);
      if (similar.length > 0) out.push({ label: `Similar to ${like.name}`, items: similar });
    }
    for (const region of ["upper", "lower", "core"] as const) {
      const items = matches.filter((e) => e.region === region);
      if (items.length > 0) out.push({ label: REGION_LABEL[region], items });
    }
    return out;
  }, [query, suggestLike]);

  return (
    <div className="fade-in fixed inset-0 z-50 flex items-end justify-center bg-night/40 backdrop-blur-sm sm:items-center" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
        className="sheet-up flex max-h-[85vh] w-full max-w-md flex-col rounded-t-2xl bg-bone sm:rounded-2xl"
      >
        <div className="flex items-center justify-between gap-3 px-5 pt-5">
          <h2 className="text-xl text-ink">{title}</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="press flex h-9 w-9 items-center justify-center rounded-full bg-ink/5 text-ink-soft">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="relative mx-5 mt-4">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-mute" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name, muscle or equipment"
            aria-label="Search exercises"
            className="h-11 w-full rounded-xl border border-line bg-white pl-10 pr-3 text-[15px] text-ink outline-none placeholder:text-ink-mute/70 focus:border-ink/40"
          />
        </div>
        <div className="mt-3 flex-1 overflow-y-auto px-5 pb-5" style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 20px)" }}>
          {groups.length === 0 && <p className="py-8 text-center text-sm text-ink-mute">No exercise matches “{query}”.</p>}
          {groups.map((g) => (
            <div key={g.label} className="mt-4 first:mt-1">
              <p className="eyebrow">{g.label}</p>
              <ul className="mt-1.5 divide-y divide-line">
                {g.items.map((e) => {
                  const taken = exclude.includes(e.slug);
                  return (
                    <li key={g.label + e.slug}>
                      <button
                        type="button"
                        disabled={taken}
                        onClick={() => onPick(e)}
                        className={cn("press flex w-full items-baseline justify-between gap-3 py-2.5 text-left", taken && "opacity-40")}
                      >
                        <span className="text-[15px] font-medium text-ink">{e.name}</span>
                        <span className="shrink-0 text-xs text-ink-mute">{taken ? "In this workout" : `${TOOL_LABEL[e.tool]} · ${e.muscles[0]}`}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
