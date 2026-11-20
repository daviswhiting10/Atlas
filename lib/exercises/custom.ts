/**
 * Typing a new exercise: tidy the name, find what it already means, and name the row.
 * Pure: no I/O, so the picker (in the browser) and the server use the same rules.
 */

import { nameKey } from "./names";

export const MAX_NAME = 80;

/** Control characters, zero-width and line-separator characters: never part of a name. */
const INVISIBLE = new RegExp("[\\x00-\\x1f\\x7f-\\x9f" + [0x200b, 0x200c, 0x200d, 0x200e, 0x200f, 0x2028, 0x2029, 0xfeff].map((c) => String.fromCharCode(c)).join("") + "]", "g");

/** All-lowercase typing ("handstand walk") is shown as a name ("Handstand Walk"); anything else stays as typed. */
function tidyCase(s: string): string {
  return s === s.toLowerCase() ? s.replace(/(^|[\s(/-]+)([^\s(/-])/g, (_, sep: string, c: string) => sep + c.toUpperCase()) : s;
}

/**
 * What was typed, made into a name: control characters and extra spaces gone, capped at 80.
 * Null when nothing usable is left (empty, spaces only, or no letter or number at all).
 */
export function cleanName(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const s = raw.replace(INVISIBLE, " ").replace(/\s+/g, " ").trim().slice(0, MAX_NAME).trim();
  // nameKey keeps letters and numbers: a name of only symbols has nothing to match on.
  if (!nameKey(s)) return null;
  return tidyCase(s);
}

/**
 * The slug a typed exercise gets. Made from the workspace and the name's key, not the time, so the same
 * name (any case, plural or spacing) always lands on the same row: a repeated or retried tap can't make a second one.
 */
export function customSlug(workspaceId: string, name: string): string {
  return `custom-${workspaceId.slice(-10).toLowerCase()}-${nameKey(name).replace(/ /g, "-")}`.slice(0, 120);
}

function distance(a: string, b: string): number {
  if (a === b) return 0;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[b.length];
}

/** How many letters can differ for two names to count as the same exercise with a typo. */
const typoLimit = (len: number) => (len <= 5 ? 0 : len <= 9 ? 1 : 2);

export type Pickable = { id: string; name: string; equipment?: string | null; muscles?: string[] };

export type Found<T> = {
  /** Matches for what's typed so far, best first. */
  results: T[];
  /** The exercise the typed name already is (same name, ignoring case, plural and spacing), if any. */
  exact: T | null;
  /** Names a typo or a letter away from what's typed ("barbel row" → Barbell Row): shown above Add, not in the results. */
  close: T[];
  /** The name to create, or null: nothing typed, or it already exists. */
  addName: string | null;
};

/** Search as you type, plus what to offer when it isn't there. */
export function findInLibrary<T extends Pickable>(list: T[], query: string, limit = 40): Found<T> {
  const key = nameKey(query);
  const name = cleanName(query);
  if (!key) return { results: [], exact: null, close: [], addName: null };
  const words = key.split(" ");

  const scored: Array<{ item: T; rank: number }> = [];
  const near: Array<{ item: T; d: number }> = [];
  let exact: T | null = null;
  for (const item of list) {
    const k = nameKey(item.name);
    if (k === key) {
      exact ??= item;
      scored.push({ item, rank: 0 });
      continue;
    }
    const d = distance(key, k);
    if (d <= typoLimit(Math.max(key.length, k.length))) {
      near.push({ item, d });
      continue;
    }
    const itemWords = k.split(" ");
    const hay = [...itemWords, ...(item.equipment ? [item.equipment.toLowerCase()] : []), ...(item.muscles ?? []).map((m) => m.toLowerCase())];
    if (k.startsWith(key)) scored.push({ item, rank: 1 });
    else if (words.every((w) => hay.some((h) => h.startsWith(w)))) scored.push({ item, rank: 2 });
  }
  scored.sort((a, b) => a.rank - b.rank || a.item.name.length - b.item.name.length || a.item.name.localeCompare(b.item.name));
  near.sort((a, b) => a.d - b.d || a.item.name.localeCompare(b.item.name));
  return {
    results: scored.slice(0, limit).map((s) => s.item),
    exact,
    close: near.slice(0, 3).map((n) => n.item),
    addName: exact ? null : name,
  };
}
