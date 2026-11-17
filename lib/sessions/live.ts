/**
 * The session the coach has open in the logger, kept in the browser so a bar
 * can show it on other screens (like a now-playing bar) and a tap returns to
 * exactly where they were: the same workout, scroll position, open blocks and
 * anything typed but not yet ticked.
 *
 * The database already holds what's saved (each ticked set). This only holds
 * the place in the screen. It's per device, and goes when the session is
 * completed, when the coach dismisses the bar, or after LIVE_MAX_MS.
 *
 * Pure apart from the storage passed in.
 */

export const LIVE_KEY = "atlas.liveSession.v1";
/** A session left open longer than this is assumed abandoned. */
export const LIVE_MAX_MS = 12 * 60 * 60_000;
/** Fired on window when the live session changes in this tab (storage events only reach other tabs). */
export const LIVE_EVENT = "atlas:live-session";

export type LiveSession = {
  assignedWorkoutId: string;
  clientId: string;
  clientName: string;
  workoutName: string;
  /** Where the logger was: path and query. */
  href: string;
  /** When the session started (ms). The elapsed time counts from here. */
  startedAt: number;
  /** Last change (ms). */
  updatedAt: number;
  workoutLogId: string | null;
  scrollY: number;
  /** Indices of the open blocks. */
  openBlocks: number[];
  /** The logger's per-exercise state, so typed values survive leaving the screen. */
  draft: Record<string, DraftExercise> | null;
};

export type DraftSet = { setLogId: string | null; completed: boolean; saving?: boolean } & Record<string, unknown>;
export type DraftExercise = { sets: DraftSet[] } & Record<string, unknown>;

type Storage = Pick<globalThis.Storage, "getItem" | "setItem" | "removeItem">;

export function readLive(storage: Storage | null | undefined, now = Date.now()): LiveSession | null {
  if (!storage) return null;
  try {
    const raw = storage.getItem(LIVE_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as LiveSession;
    if (!s || typeof s.assignedWorkoutId !== "string" || typeof s.href !== "string" || !s.href.startsWith("/")) return null;
    if (!(now - s.updatedAt < LIVE_MAX_MS)) {
      storage.removeItem(LIVE_KEY);
      return null;
    }
    return s;
  } catch {
    return null;
  }
}

export function writeLive(storage: Storage | null | undefined, s: LiveSession): void {
  try {
    storage?.setItem(LIVE_KEY, JSON.stringify(s));
  } catch {
    // Private mode or full storage: the bar just won't show.
  }
}

export function clearLive(storage: Storage | null | undefined, assignedWorkoutId?: string): void {
  try {
    if (!storage) return;
    if (assignedWorkoutId) {
      // Only this workout's entry: another workout's session stays.
      const raw = storage.getItem(LIVE_KEY);
      const cur = raw ? (JSON.parse(raw) as Partial<LiveSession>) : null;
      if (cur && cur.assignedWorkoutId !== assignedWorkoutId) return;
    }
    storage.removeItem(LIVE_KEY);
  } catch {
    // ignore
  }
}

/**
 * Opening the logger on a workout: the live session to keep. The same workout
 * keeps its start time (so the clock doesn't restart) and its place; another
 * workout starts fresh.
 */
export function startLive(
  prev: LiveSession | null,
  next: Pick<LiveSession, "assignedWorkoutId" | "clientId" | "clientName" | "workoutName" | "href" | "workoutLogId">,
  now = Date.now()
): LiveSession {
  if (prev && prev.assignedWorkoutId === next.assignedWorkoutId) {
    return { ...prev, ...next, workoutLogId: next.workoutLogId ?? prev.workoutLogId, updatedAt: now };
  }
  return { ...next, startedAt: now, updatedAt: now, scrollY: 0, openBlocks: [], draft: null };
}

/**
 * The logger's state on return: what the database has, with what was typed
 * but not ticked put back. A set the database has (setLogId) always wins;
 * a set only in the draft keeps its typed values. A draft from another
 * session of the same workout is ignored.
 */
export function mergeDraft<E extends DraftExercise>(
  server: Record<string, E>,
  live: LiveSession | null,
  ctx: { assignedWorkoutId: string; workoutLogId: string | null }
): Record<string, E> {
  const draft = live?.draft;
  if (!draft || live.assignedWorkoutId !== ctx.assignedWorkoutId) return server;
  if (live.workoutLogId && ctx.workoutLogId && live.workoutLogId !== ctx.workoutLogId) return server;
  const out: Record<string, E> = { ...server };
  for (const [aweId, ex] of Object.entries(server)) {
    const d = draft[aweId];
    if (!d || !Array.isArray(d.sets)) continue;
    const length = Math.max(ex.sets.length, d.sets.length);
    const sets = Array.from({ length }, (_, i) => {
      const saved = ex.sets[i];
      const typed = d.sets[i];
      if (saved?.setLogId || saved?.completed) return saved;
      // Typed but not saved (a tick still in flight counts as not saved): keep the values, unticked.
      if (typed && !typed.setLogId) return { ...(saved ?? {}), ...typed, setLogId: null, completed: false, saving: false };
      return saved;
    }).filter((x): x is E["sets"][number] => x != null);
    out[aweId] = { ...ex, sets, noteInput: typeof d.noteInput === "string" && !ex.noteInput ? d.noteInput : ex.noteInput } as E;
  }
  return out;
}

/** "4:05" or "1:02:09". */
export function formatElapsed(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}` : `${m}:${String(s).padStart(2, "0")}`;
}
