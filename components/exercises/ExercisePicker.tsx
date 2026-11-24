"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Plus, Search, X } from "lucide-react";
import { toast } from "sonner";
import { CATALOG, displayName } from "@/lib/plan/catalog";
import { createExercise, listExercises, type PickerExercise } from "@/lib/actions/exercises";
import { findInLibrary } from "@/lib/exercises/custom";
import { isNetworkError } from "@/lib/sessions/pending";
import { useEscape } from "@/hooks/use-escape";
import { useSheetLock } from "@/hooks/use-sheet-lock";
import { cn } from "@/lib/utils";

export type { PickerExercise };

const REGION_LABEL = { upper: "Upper body", lower: "Lower body", core: "Core and carries" } as const;
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const LIST_KEY = "atlas.exerciseList.v1";

/** The library as last seen: in memory, and on the phone for when there's no connection. */
let cached: PickerExercise[] | null = null;

function remembered(): PickerExercise[] {
  if (cached) return cached;
  try {
    const raw = window.localStorage.getItem(LIST_KEY);
    const list = raw ? (JSON.parse(raw) as PickerExercise[]) : [];
    return Array.isArray(list) ? (cached = list) : [];
  } catch {
    return [];
  }
}

function remember(list: PickerExercise[]) {
  cached = list;
  try {
    window.localStorage.setItem(LIST_KEY, JSON.stringify(list));
  } catch {
    // Full or private: the list just isn't kept for offline.
  }
}

/**
 * The one exercise picker: a coach's logger, an athlete's logger, Swap and the plan editor all use it.
 * Search as you type; when the name isn't there, one tap adds it as a new exercise of this workspace's
 * own and picks it. Only a name is needed.
 */
export function ExercisePicker({
  title,
  exclude = [],
  suggestLike,
  onPick,
  onOffline,
  onClose,
}: {
  title: string;
  /** Exercise ids already in the workout: shown as unavailable. */
  exclude?: string[];
  /** When swapping, the slug of the exercise being replaced: ones that train the same pattern are listed first. */
  suggestLike?: string | null;
  onPick: (exercise: PickerExercise) => void;
  /** A new exercise was typed with no connection: where to keep it until there is one. Without it, the person is told to retry. */
  onOffline?: (name: string) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const [list, setList] = useState<PickerExercise[]>(() => (typeof window === "undefined" ? [] : remembered()));
  const [loaded, setLoaded] = useState(false);
  const [adding, setAdding] = useState(false);
  const addingRef = useRef(false);
  const inputRef = useRef<HTMLInputElement>(null);
  useEscape(true, onClose);
  // The page behind stays put, the bottom nav steps aside, and the sheet stays docked above the keyboard.
  const vp = useSheetLock();

  useEffect(() => {
    inputRef.current?.focus();
    let live = true;
    listExercises()
      .then((l) => {
        remember(l);
        if (live) setList(l);
      })
      .catch(() => {})
      .finally(() => live && setLoaded(true));
    return () => {
      live = false;
    };
  }, []);

  /** What's shown carries Atlas's clean names, so a search and a "same name" check see what the person sees. */
  const items = useMemo(() => list.map((e) => ({ ...e, name: displayName(e.slug, e.name) })), [list]);
  const found = useMemo(() => findInLibrary(items, query), [items, query]);
  const typing = query.trim().length > 0;

  const browse = useMemo(() => {
    if (typing) return [];
    const bySlug = new Map(items.map((e) => [e.slug, e]));
    const like = suggestLike ? CATALOG.find((e) => e.slug === suggestLike) : null;
    const out: Array<{ label: string; items: typeof items }> = [];
    if (like) {
      const similar = CATALOG.filter((e) => e.slug !== like.slug && e.pattern === like.pattern).flatMap((e) => bySlug.get(e.slug) ?? []);
      if (similar.length) out.push({ label: `Similar to ${like.name}`, items: similar });
    }
    const mine = items.filter((e) => e.custom);
    if (mine.length) out.push({ label: "Your exercises", items: mine });
    for (const region of ["upper", "lower", "core"] as const) {
      const inRegion = CATALOG.filter((e) => e.region === region).flatMap((e) => bySlug.get(e.slug) ?? []);
      if (inRegion.length) out.push({ label: REGION_LABEL[region], items: inRegion });
    }
    return out;
  }, [items, typing, suggestLike]);

  /** Create (or find) the typed name, then pick it. A second tap while this runs does nothing. */
  async function addTyped(name: string) {
    if (addingRef.current) return;
    addingRef.current = true;
    setAdding(true);
    try {
      if (typeof navigator !== "undefined" && navigator.onLine === false) throw new TypeError("offline");
      const res = await createExercise(name);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      remember([...(cached ?? []).filter((e) => e.id !== res.exercise.id), res.exercise]);
      onPick(res.exercise);
    } catch (e) {
      if (!isNetworkError(e)) {
        toast.error("Couldn't add that exercise. Please try again.");
      } else if (onOffline) {
        onOffline(name);
        onClose();
      } else {
        toast.error("You're offline. Try again when you're back.");
      }
    } finally {
      addingRef.current = false;
      setAdding(false);
    }
  }

  const taken = (e: PickerExercise) => exclude.includes(e.id);
  const pick = (e: PickerExercise) => {
    if (!taken(e) && !addingRef.current) onPick(e);
  };

  function onKey(ev: React.KeyboardEvent<HTMLInputElement>) {
    if (ev.key !== "Enter" || ev.nativeEvent.isComposing) return;
    ev.preventDefault();
    if (found.exact) pick(found.exact);
    else if (found.addName) void addTyped(found.addName);
  }

  const row = (e: PickerExercise, hint?: string) => (
    <li key={e.id}>
      <button type="button" disabled={taken(e)} onClick={() => pick(e)} className={cn("press flex min-h-11 w-full items-center justify-between gap-3 py-2 text-left", taken(e) && "opacity-40")}>
        <span className="text-[15px] font-medium text-ink">{e.name}</span>
        <span className="shrink-0 text-xs text-ink-mute">{taken(e) ? "In this workout" : (hint ?? (e.custom ? "Yours" : [e.equipment !== "other" ? cap(e.equipment) : null, e.muscles[0] ? cap(e.muscles[0]) : null].filter(Boolean).join(" · ")))}</span>
      </button>
    </li>
  );

  const nothing = typing && !found.addName && found.results.length === 0 && found.close.length === 0;

  return createPortal(
    <div
      className={cn("fade-in fixed inset-x-0 z-50 flex items-end justify-center bg-night/40 backdrop-blur-sm sm:items-center", !vp && "inset-y-0")}
      style={vp ? { top: vp.top, height: vp.height } : undefined}
      onClick={onClose}
    >
      <div role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()} className="sheet-up flex max-h-[85%] w-full max-w-md flex-col rounded-t-2xl bg-bone sm:rounded-2xl">
        <div className="flex items-center justify-between gap-3 px-5 pt-5">
          <h2 className="text-xl text-ink">{title}</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="press flex h-11 w-11 items-center justify-center rounded-full bg-ink/5 text-ink-soft">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="relative mx-5 mt-3">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-mute" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKey}
            placeholder="Search, or type a new exercise"
            aria-label="Search exercises"
            autoComplete="off"
            enterKeyHint="done"
            maxLength={120}
            className="h-11 w-full rounded-xl border border-line-strong bg-dusk-raised pl-10 pr-3 text-[16px] text-ink outline-none placeholder:text-ink-mute focus:border-ink/40"
          />
        </div>
        <div className="mt-3 min-h-0 flex-1 overflow-y-auto overscroll-contain px-5" style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 20px)" }}>
          {found.exact && <ul className="divide-y divide-line">{row(found.exact)}</ul>}

          {found.close.length > 0 && (
            <div className="mt-1">
              <p className="eyebrow">Did you mean</p>
              <ul className="mt-1 divide-y divide-line">{found.close.map((e) => row(e))}</ul>
            </div>
          )}

          {found.addName && (
            <button
              type="button"
              disabled={adding}
              onClick={() => void addTyped(found.addName!)}
              className="press mt-2 flex min-h-12 w-full items-center gap-2.5 rounded-xl bg-dusk-button px-4 py-2 text-left text-[15px] font-semibold text-dusk-button-text hover:bg-dusk-button/90 disabled:opacity-60"
            >
              <Plus className="h-4 w-4 shrink-0" />
              <span className="min-w-0 break-words">{adding ? "Adding…" : `Add “${found.addName}” as a new exercise`}</span>
            </button>
          )}

          {typing && found.results.filter((e) => e !== found.exact).length > 0 && (
            <ul className="mt-3 divide-y divide-line">{found.results.filter((e) => e !== found.exact).map((e) => row(e))}</ul>
          )}
          {nothing && <p className="py-8 text-center text-sm text-ink-mute">Type a name to add it.</p>}

          {!typing && !loaded && list.length === 0 && <p className="py-8 text-center text-sm text-ink-mute">Loading…</p>}
          {!typing &&
            browse.map((g) => (
              <div key={g.label} className="mt-4 first:mt-1">
                <p className="eyebrow">{g.label}</p>
                <ul className="mt-1 divide-y divide-line">{g.items.map((e) => row(e))}</ul>
              </div>
            ))}
        </div>
      </div>
    </div>,
    document.body
  );
}
