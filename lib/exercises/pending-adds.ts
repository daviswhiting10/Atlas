/**
 * An exercise typed while there was no connection, kept on the phone until it can be saved and put
 * into the workout. Same idea as the unconfirmed set ticks (lib/sessions/pending.ts): it shows at once
 * and is sent again when the connection is back. Sending it twice can't make two: the exercise's slug
 * comes from its name, and a workout won't take the same exercise twice.
 *
 * Keyed by workout. Pure apart from the storage passed in.
 */

import { nameKey } from "./names";

export const PENDING_ADDS_KEY = "atlas.pendingExercises.v1";
/** Older than this, it's forgotten (an abandoned session). */
export const PENDING_ADD_MAX_MS = 12 * 60 * 60_000;

export type PendingTarget = { mode: "add" } | { mode: "swap"; aweId: string };
export type PendingAdd = { id: string; name: string; target: PendingTarget; at: number };
type All = Record<string, PendingAdd[]>;
type Storage = Pick<globalThis.Storage, "getItem" | "setItem">;

function read(storage: Storage | null | undefined): All {
  try {
    const raw = storage?.getItem(PENDING_ADDS_KEY);
    const all = raw ? (JSON.parse(raw) as All) : {};
    return all && typeof all === "object" && !Array.isArray(all) ? all : {};
  } catch {
    return {};
  }
}

function write(storage: Storage | null | undefined, all: All) {
  try {
    storage?.setItem(PENDING_ADDS_KEY, JSON.stringify(all));
  } catch {
    // Private mode or full storage: it still works while the page stays open.
  }
}

const sameTarget = (a: PendingTarget, b: PendingTarget) => a.mode === b.mode && (a.mode === "add" || (b.mode === "swap" && a.aweId === b.aweId));

/** Remember it. The same name for the same place, tapped again, is the same entry. */
export function addPendingAdd(storage: Storage | null | undefined, workoutId: string, entry: { name: string; target: PendingTarget }, now = Date.now(), id = `${now}-${Math.random().toString(36).slice(2, 8)}`): PendingAdd[] {
  const all = read(storage);
  const mine = all[workoutId] ?? [];
  const key = nameKey(entry.name);
  // The same name for the same place again keeps the first entry (and the spelling first typed). A swap for one
  // exercise replaces the earlier wish for it.
  if (entry.target.mode === "add" && mine.some((p) => sameTarget(p.target, entry.target) && nameKey(p.name) === key)) return mine;
  const rest = mine.filter((p) => !(entry.target.mode === "swap" && sameTarget(p.target, entry.target)));
  all[workoutId] = [...rest, { id, name: entry.name, target: entry.target, at: now }];
  write(storage, all);
  return all[workoutId];
}

/** This workout's entries still worth sending, oldest first. */
export function readPendingAdds(storage: Storage | null | undefined, workoutId: string, now = Date.now()): PendingAdd[] {
  const all = read(storage);
  const mine = (all[workoutId] ?? []).filter((p) => p && typeof p.name === "string" && p.target && now - p.at < PENDING_ADD_MAX_MS);
  if (mine.length !== (all[workoutId] ?? []).length) {
    if (mine.length) all[workoutId] = mine;
    else delete all[workoutId];
    write(storage, all);
  }
  return mine.sort((a, b) => a.at - b.at);
}

/** Done (or given up): forget it. */
export function clearPendingAdd(storage: Storage | null | undefined, workoutId: string, id: string) {
  const all = read(storage);
  if (!all[workoutId]) return;
  all[workoutId] = all[workoutId].filter((p) => p.id !== id);
  if (all[workoutId].length === 0) delete all[workoutId];
  write(storage, all);
}
