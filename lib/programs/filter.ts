/**
 * The Programs library's search and filters. Pure: no I/O.
 *
 * Search matches the name. Within one filter, several options are OR (Goal: Muscle gain or Strength); between filters, AND
 * (Muscle gain AND 3-4 a week). "Used by a client" keeps programs with at least one assignment. Which categories are open is
 * kept with the filters, so the page opens as the coach left it.
 */
import { UNCATEGORIZED, categoryOf } from "./categories";

export type PerWeek = "1-2" | "3-4" | "5+";
export type Length = "1-4" | "5-8" | "9+";

export type LibraryProgram = { id: string; name: string; durationWeeks: number; perWeek: number; clients: number; goalTags: unknown };

export type FilterState = {
  q: string;
  goals: string[];
  perWeek: PerWeek[];
  length: Length[];
  used: boolean;
  /** Categories the coach has opened. */
  open: string[];
};

export const EMPTY: FilterState = { q: "", goals: [], perWeek: [], length: [], used: false, open: [] };

export const PER_WEEK: Array<{ key: PerWeek; label: string }> = [{ key: "1-2", label: "1–2" }, { key: "3-4", label: "3–4" }, { key: "5+", label: "5 or more" }];
export const LENGTH: Array<{ key: Length; label: string }> = [{ key: "1-4", label: "1–4 weeks" }, { key: "5-8", label: "5–8 weeks" }, { key: "9+", label: "9 weeks or more" }];

export const perWeekOf = (n: number): PerWeek => (n >= 5 ? "5+" : n >= 3 ? "3-4" : "1-2");
export const lengthOf = (weeks: number): Length => (weeks >= 9 ? "9+" : weeks >= 5 ? "5-8" : "1-4");
export const categoryKey = (p: Pick<LibraryProgram, "goalTags">): string => categoryOf(p.goalTags) ?? UNCATEGORIZED;

/** Whether any filter or search is on (the open categories are not a filter). */
export const isFiltering = (s: FilterState): boolean => s.q.trim() !== "" || s.goals.length > 0 || s.perWeek.length > 0 || s.length.length > 0 || s.used;

/** How many filter chips are on (for "Goal · 1"). */
export const activeCount = (s: FilterState) => ({ goals: s.goals.length, perWeek: s.perWeek.length, length: s.length.length });

export function matches(p: LibraryProgram, s: FilterState, skip?: "goals" | "perWeek" | "length"): boolean {
  const q = s.q.trim().toLowerCase();
  if (q && !p.name.toLowerCase().includes(q)) return false;
  if (skip !== "goals" && s.goals.length > 0 && !s.goals.includes(categoryKey(p))) return false;
  if (skip !== "perWeek" && s.perWeek.length > 0 && !s.perWeek.includes(perWeekOf(p.perWeek))) return false;
  if (skip !== "length" && s.length.length > 0 && !s.length.includes(lengthOf(p.durationWeeks))) return false;
  if (s.used && p.clients === 0) return false;
  return true;
}

export const filterPrograms = (all: LibraryProgram[], s: FilterState): LibraryProgram[] => all.filter((p) => matches(p, s));

/** What an option would give: the programs that match everything else, with this option on (its own filter's others ignored). */
export function optionCounts(all: LibraryProgram[], s: FilterState, which: "goals" | "perWeek" | "length"): Record<string, number> {
  const out: Record<string, number> = {};
  for (const p of all) {
    if (!matches(p, s, which)) continue;
    const key = which === "goals" ? categoryKey(p) : which === "perWeek" ? perWeekOf(p.perWeek) : lengthOf(p.durationWeeks);
    out[key] = (out[key] ?? 0) + 1;
  }
  return out;
}

/** Programs by category, in the given category order (anything uncategorised last). Empty categories are left out. */
export function group(programs: LibraryProgram[], order: string[]): Array<{ tag: string; programs: LibraryProgram[] }> {
  return [...order, UNCATEGORIZED].map((tag) => ({ tag, programs: programs.filter((p) => categoryKey(p) === tag) })).filter((g) => g.programs.length > 0);
}

/** Toggle one value in a list. */
export const toggle = <T>(list: T[], v: T): T[] => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

const KEY = (user: string) => `atlas.programs.filters.${user}`;
const oneOf = <T extends string>(v: unknown, allowed: T[]): T[] => (Array.isArray(v) ? v.filter((x): x is T => allowed.includes(x as T)) : []);

/** Read what was saved for this person; anything unreadable or out of date is dropped, never trusted. */
export function parseState(raw: string | null): FilterState {
  if (!raw) return EMPTY;
  try {
    const v = JSON.parse(raw) as Partial<Record<keyof FilterState, unknown>>;
    return {
      q: typeof v.q === "string" ? v.q.slice(0, 80) : "",
      goals: Array.isArray(v.goals) ? v.goals.filter((x): x is string => typeof x === "string").slice(0, 12) : [],
      perWeek: oneOf(v.perWeek, PER_WEEK.map((o) => o.key)),
      length: oneOf(v.length, LENGTH.map((o) => o.key)),
      used: v.used === true,
      open: Array.isArray(v.open) ? v.open.filter((x): x is string => typeof x === "string").slice(0, 20) : [],
    };
  } catch {
    return EMPTY;
  }
}

export function loadState(user: string): FilterState {
  try {
    return parseState(window.localStorage.getItem(KEY(user)));
  } catch {
    return EMPTY;
  }
}
export function saveState(user: string, s: FilterState): void {
  try {
    window.localStorage.setItem(KEY(user), JSON.stringify(s));
  } catch {
    /* private window or blocked storage: the page works, it just doesn't remember */
  }
}
