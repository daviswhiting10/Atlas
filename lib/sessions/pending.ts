/**
 * Ticks the server hasn't confirmed yet, kept on the phone. A tap shows at once and its save
 * follows behind; if the page reloads (or the app is closed) before the save lands, the tick is
 * put back on the screen and sent again, so it never reverts. Saves are idempotent (a set is
 * found by its exercise and set number), so sending it twice can't log it twice.
 *
 * Keyed by workout, then `${aweId}:${setNumber}`. Cleared when the server confirms that very
 * state, and when a failed save rolls the set back (the coach is told to tap again).
 *
 * Pure apart from the storage passed in.
 */

export const PENDING_KEY = "atlas.pendingSets.v1";
/** Older than this, a pending tick is forgotten (an abandoned session). */
export const PENDING_MAX_MS = 12 * 60 * 60_000;

/** `implements`: a dumbbell or kettlebell set's bells (2 = per hand), sent again with the tick. */
export type PendingTick = { done: boolean; at: number; weight?: number | null; reps?: number | null; implements?: number | null };
type All = Record<string, Record<string, PendingTick>>;
type Storage = Pick<globalThis.Storage, "getItem" | "setItem">;

function read(storage: Storage | null | undefined): All {
  try {
    const raw = storage?.getItem(PENDING_KEY);
    const all = raw ? (JSON.parse(raw) as All) : {};
    return all && typeof all === "object" ? all : {};
  } catch {
    return {};
  }
}

function write(storage: Storage | null | undefined, all: All) {
  try {
    storage?.setItem(PENDING_KEY, JSON.stringify(all));
  } catch {
    // Private mode or full storage: ticks still save, they just can't survive a reload mid-save.
  }
}

export const pendingKey = (aweId: string, setNumber: number) => `${aweId}:${setNumber}`;

/** A tap: this set should end up `done` (with these values, when the screen may not have them after a reload). */
export function addPending(storage: Storage | null | undefined, workoutId: string, key: string, tick: Omit<PendingTick, "at">, now = Date.now()) {
  const all = read(storage);
  all[workoutId] = { ...(all[workoutId] ?? {}), [key]: { ...tick, at: now } };
  write(storage, all);
}

/** The server has `done` for this set (or the tap was given up): forget it, unless a newer tap wants something else. */
export function clearPending(storage: Storage | null | undefined, workoutId: string, key: string, done?: boolean) {
  const all = read(storage);
  const cur = all[workoutId]?.[key];
  if (!cur || (done !== undefined && cur.done !== done)) return;
  delete all[workoutId][key];
  if (Object.keys(all[workoutId]).length === 0) delete all[workoutId];
  write(storage, all);
}

/** This workout's unconfirmed ticks, dropping any too old to trust. */
export function readPending(storage: Storage | null | undefined, workoutId: string, now = Date.now()): Record<string, PendingTick> {
  const all = read(storage);
  const mine = all[workoutId] ?? {};
  const fresh = Object.fromEntries(Object.entries(mine).filter(([, t]) => now - t.at < PENDING_MAX_MS));
  if (Object.keys(fresh).length !== Object.keys(mine).length) {
    if (Object.keys(fresh).length) all[workoutId] = fresh;
    else delete all[workoutId];
    write(storage, all);
  }
  return fresh;
}

/**
 * A save that failed for want of a connection (offline, or the request never got an answer),
 * as opposed to the server refusing it. The first keeps the tick and retries when the
 * connection is back; only the second rolls the set back.
 */
export function isNetworkError(e: unknown, online: boolean | undefined = typeof navigator === "undefined" ? undefined : navigator.onLine): boolean {
  if (online === false) return true;
  return e instanceof TypeError && /fetch|network|load failed|internet/i.test(e.message);
}
