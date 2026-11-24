"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ArrowRight, Check, ChevronDown, ChevronRight, Search, X } from "lucide-react";
import { CATEGORIES, UNCATEGORIZED, categoryLabel } from "@/lib/programs/categories";
import {
  EMPTY, LENGTH, PER_WEEK, filterPrograms, group, isFiltering, loadState, optionCounts, saveState, toggle,
  type FilterState, type LibraryProgram,
} from "@/lib/programs/filter";
import { useEscape } from "@/hooks/use-escape";
import { useSheetLock } from "@/hooks/use-sheet-lock";
import { cn } from "@/lib/utils";

type Which = "goals" | "perWeek" | "length";
const ORDER = CATEGORIES.map((c) => c.tag as string);

/**
 * The program library: a search box, one row of filter chips (Goal, Per week, Length, Used by a client) that open sheets
 * with counts, and categories that open and close (closed to begin with). The filters and which categories are open are
 * remembered for this person, in this browser.
 */
export function ProgramLibrary({ programs, user }: { programs: LibraryProgram[]; user: string }) {
  const [s, setS] = useState<FilterState>(EMPTY);
  const [ready, setReady] = useState(false);
  const [sheet, setSheet] = useState<Which | null>(null);
  const first = useRef(true);

  // Read what was remembered once the browser is here (the first paint is the plain, closed library).
  useEffect(() => {
    setS(loadState(user));
    setReady(true);
  }, [user]);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    if (ready) saveState(user, s);
  }, [s, ready, user]);

  const shown = useMemo(() => filterPrograms(programs, s), [programs, s]);
  const groups = useMemo(() => group(shown, ORDER), [shown]);
  const filtering = isFiltering(s);
  const label = (tag: string) => (tag === UNCATEGORIZED ? "No category yet" : categoryLabel(tag));
  const isOpen = (tag: string) => filtering || s.open.includes(tag);
  const set = (patch: Partial<FilterState>) => setS((cur) => ({ ...cur, ...patch }));
  const clear = () => set({ q: "", goals: [], perWeek: [], length: [], used: false });

  const chip = (which: Which, text: string, n: number) => (
    <button key={which} type="button" onClick={() => setSheet(which)} aria-haspopup="dialog" className={cn("press inline-flex h-10 shrink-0 items-center gap-1.5 rounded-full border px-3.5 text-[14px] font-semibold", n > 0 ? "border-signal bg-signal/15 text-ink" : "border-line-strong text-ink-soft")}>
      {text}
      {n > 0 ? ` · ${n}` : ""} <ChevronDown className="h-3.5 w-3.5" />
    </button>
  );

  return (
    <div>
      <label className="flex h-12 items-center gap-2.5 rounded-xl border border-line-strong bg-paper px-3.5 focus-within:border-ink/40">
        <Search className="h-[18px] w-[18px] shrink-0 text-ink-mute" />
        <span className="sr-only">Search programs</span>
        <input value={s.q} onChange={(e) => set({ q: e.target.value })} placeholder={`Search ${programs.length} programs`} className="min-w-0 flex-1 bg-transparent text-[16px] text-ink outline-none placeholder:text-ink-mute" />
        {s.q && (
          <button type="button" onClick={() => set({ q: "" })} aria-label="Clear search" className="press flex h-9 w-9 items-center justify-center rounded-full text-ink-mute">
            <X className="h-4 w-4" />
          </button>
        )}
      </label>

      <div className="-mx-4 mt-3 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0" role="group" aria-label="Filters">
        {chip("goals", "Goal", s.goals.length)}
        {chip("perWeek", "Per week", s.perWeek.length)}
        {chip("length", "Length", s.length.length)}
        <button type="button" aria-pressed={s.used} onClick={() => set({ used: !s.used })} className={cn("press inline-flex h-10 shrink-0 items-center gap-1.5 rounded-full border px-3.5 text-[14px] font-semibold", s.used ? "border-signal bg-signal/15 text-ink" : "border-line-strong text-ink-soft")}>
          {s.used && <Check className="h-3.5 w-3.5" />} Used by a client
        </button>
      </div>

      <div className="mt-3 flex min-h-8 items-center justify-between text-[13px] text-ink-mute" aria-live="polite">
        <span>{filtering ? `${shown.length} of ${programs.length} programs` : `${programs.length} program${programs.length === 1 ? "" : "s"}`}</span>
        {filtering && (
          <button type="button" onClick={clear} className="press inline-flex min-h-8 items-center font-semibold text-ink-soft">
            Clear all
          </button>
        )}
      </div>

      {shown.length === 0 ? (
        <p className="rule pt-4 text-[15px] text-ink-soft">Nothing matches. <button type="button" onClick={clear} className="font-semibold text-ink underline">Clear the filters</button></p>
      ) : (
        <div className="mt-1">
          {groups.map((g) => {
            const open = isOpen(g.tag);
            const id = `cat-${g.tag.replace(/\W+/g, "-")}`;
            return (
              <section key={g.tag} className="border-t border-line">
                <h2>
                  <button type="button" aria-expanded={open} aria-controls={id} onClick={() => !filtering && set({ open: toggle(s.open, g.tag) })} className="press flex min-h-14 w-full items-center justify-between gap-3 text-left">
                    <span className="text-[17px] font-semibold text-ink">
                      {label(g.tag)}
                      <span className="ml-2 text-[14px] font-normal text-ink-mute">{g.programs.length}</span>
                    </span>
                    {!filtering && <ChevronRight className={cn("h-4 w-4 shrink-0 text-ink-mute transition-transform", open && "rotate-90")} />}
                  </button>
                </h2>
                {open && (
                  <ul id={id} className="divide-y divide-line border-t border-line">
                    {g.tag === UNCATEGORIZED && <li className="py-2 text-sm text-ink-mute">Open a program to give it a category.</li>}
                    {g.programs.map((p) => (
                      <li key={p.id}>
                        <Link href={`/programs/${p.id}`} className="press group flex items-center gap-4 py-3.5">
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-[15px] font-semibold text-ink">{p.name}</span>
                            <span className="block truncate text-[13px] text-ink-mute">
                              {p.durationWeeks} week{p.durationWeeks === 1 ? "" : "s"} · {p.perWeek} workout{p.perWeek === 1 ? "" : "s"} a week
                              {p.clients > 0 ? ` · used for ${p.clients} client${p.clients === 1 ? "" : "s"}` : ""}
                            </span>
                          </span>
                          <ArrowRight className="h-4 w-4 shrink-0 text-ink-mute transition-transform group-hover:translate-x-0.5" />
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            );
          })}
        </div>
      )}

      {sheet && <FilterSheet which={sheet} programs={programs} s={s} onChange={set} onClose={() => setSheet(null)} />}
    </div>
  );
}

function FilterSheet({ which, programs, s, onChange, onClose }: { which: Which; programs: LibraryProgram[]; s: FilterState; onChange: (p: Partial<FilterState>) => void; onClose: () => void }) {
  useEscape(true, onClose);
  useSheetLock();
  const counts = useMemo(() => optionCounts(programs, s, which), [programs, s, which]);
  const options: Array<{ key: string; label: string }> =
    which === "goals" ? [...CATEGORIES.map((c) => ({ key: c.tag as string, label: c.label as string })), { key: UNCATEGORIZED, label: "No category yet" }] : which === "perWeek" ? PER_WEEK : LENGTH;
  const picked: string[] = which === "goals" ? s.goals : which === "perWeek" ? s.perWeek : s.length;
  const title = which === "goals" ? "Goal" : which === "perWeek" ? "Workouts per week" : "Length";
  const apply = (next: string[]) => onChange(which === "goals" ? { goals: next } : which === "perWeek" ? { perWeek: next as FilterState["perWeek"] } : { length: next as FilterState["length"] });
  // Only options that exist in this library (or are already picked), so the sheet is never a list of zeros.
  const visible = options.filter((o) => (counts[o.key] ?? 0) > 0 || picked.includes(o.key));
  const result = programs.filter((p) => filterPrograms([p], s).length > 0).length;

  return (
    <div className="fade-in fixed inset-0 z-50 flex items-end bg-night/50 backdrop-blur-sm" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()} className="sheet-up flex max-h-[80vh] w-full flex-col rounded-t-[24px] border-t border-line bg-bone px-4 pt-3 sm:mx-auto sm:max-w-md sm:rounded-[24px]" style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 16px)" }}>
        <div className="flex min-h-11 items-center justify-between">
          <h2 className="text-[18px] font-semibold text-ink">{title}</h2>
          <button type="button" onClick={() => apply([])} disabled={picked.length === 0} className="press min-h-11 px-2 text-[14px] font-semibold text-ink-soft disabled:opacity-40">
            Clear
          </button>
        </div>
        <ul className="min-h-0 flex-1 overflow-y-auto">
          {visible.map((o) => {
            const on = picked.includes(o.key);
            return (
              <li key={o.key} className="border-t border-line">
                <button type="button" role="checkbox" aria-checked={on} onClick={() => apply(toggle(picked, o.key))} className="press flex min-h-[52px] w-full items-center justify-between gap-3 text-left text-[16px] text-ink">
                  <span>
                    {o.label}
                    <span className="ml-2 text-[13px] text-ink-mute">{counts[o.key] ?? 0}</span>
                  </span>
                  <span className={cn("flex h-[22px] w-[22px] items-center justify-center rounded-[7px] border-[1.5px]", on ? "border-signal bg-signal text-dusk-button-text" : "border-line-strong")}>{on && <Check className="h-3.5 w-3.5" strokeWidth={3.4} />}</span>
                </button>
              </li>
            );
          })}
        </ul>
        <button type="button" onClick={onClose} className="press mt-3 flex h-[52px] w-full items-center justify-center rounded-2xl bg-dusk-button text-[16px] font-semibold text-dusk-button-text">
          Show {result} program{result === 1 ? "" : "s"}
        </button>
      </div>
    </div>
  );
}
