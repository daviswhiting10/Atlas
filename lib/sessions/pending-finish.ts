/**
 * "Finish" tapped with no connection: kept on the phone and sent when the connection is back (or the page
 * opens again), so a session finished offline still completes. Keyed by workout; one per workout.
 * Pure apart from the storage passed in.
 */

export const PENDING_FINISH_KEY = "atlas.pendingFinish.v1";
/** Older than this, a queued finish is forgotten (an abandoned session). */
export const PENDING_FINISH_MAX_MS = 12 * 60 * 60_000;

type Storage = Pick<globalThis.Storage, "getItem" | "setItem">;
type All = Record<string, { minutes: number; at: number }>;

function read(storage: Storage | null | undefined): All {
  try {
    const raw = storage?.getItem(PENDING_FINISH_KEY);
    const all = raw ? (JSON.parse(raw) as All) : {};
    return all && typeof all === "object" ? all : {};
  } catch {
    return {};
  }
}

function write(storage: Storage | null | undefined, all: All) {
  try {
    storage?.setItem(PENDING_FINISH_KEY, JSON.stringify(all));
  } catch {
    // Private mode or full storage: the finish just can't survive a reload.
  }
}

/** Queue a finish with the session's length in minutes. */
export function queueFinish(storage: Storage | null | undefined, workoutId: string, minutes: number, now = Date.now()) {
  write(storage, { ...read(storage), [workoutId]: { minutes, at: now } });
}

/** The queued finish for this workout, or null (none, or too old to trust). */
export function queuedFinish(storage: Storage | null | undefined, workoutId: string, now = Date.now()): { minutes: number } | null {
  const q = read(storage)[workoutId];
  return q && now - q.at < PENDING_FINISH_MAX_MS ? { minutes: q.minutes } : null;
}

/** The finish went through (or was given up). */
export function clearFinish(storage: Storage | null | undefined, workoutId: string) {
  const all = read(storage);
  if (!(workoutId in all)) return;
  delete all[workoutId];
  write(storage, all);
}
