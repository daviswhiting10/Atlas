/**
 * Instant ticking: the screen changes on the tap, the save happens in the
 * background, and a save that fails puts things back.
 *
 * The rules, per flag (one rule on one day, or one mark on one session):
 * - `set` shows the new value at once, before anything is sent.
 * - Saves for one flag go one at a time, in order. A tap that is replaced by a
 *   newer tap before its turn is never sent: only the last value matters, because
 *   a save sets a value, it doesn't flip one.
 * - A save that fails puts the flag back to the last value known to be saved,
 *   and says so once. It does nothing if a newer tap is waiting, since that tap
 *   will decide the end state (and report its own failure).
 * - `settle` is for when the server's own value arrives with fresh data: an
 *   override that now agrees with the server can be dropped.
 *
 * No React and no I/O of its own: `save`, `apply` and `fail` are handed in.
 * Pure enough to test with a fake `save`.
 */

export type SaveResult = { ok: boolean; error?: string };

export type OptimisticFlags = {
  /** Show `on` now and save it. `was` is the value shown before this tap. */
  set(key: string, on: boolean, was: boolean): void;
  /** True while a save for this flag is running or waiting. */
  busy(key: string): boolean;
  /** Resolves when every save started so far has finished (for tests and for leaving a page). */
  idle(): Promise<void>;
};

export function createOptimisticFlags(opts: {
  save: (key: string, on: boolean) => Promise<SaveResult>;
  /** Make the screen show this value for the flag. */
  apply: (key: string, on: boolean) => void;
  /** A save failed and was put back. `error` is the server's words, if it gave any. */
  fail: (key: string, error?: string) => void;
}): OptimisticFlags {
  const latest = new Map<string, number>(); // newest tap per flag
  const confirmed = new Map<string, boolean>(); // last value known saved
  const tails = new Map<string, Promise<void>>(); // the save queue per flag
  const waiting = new Map<string, number>(); // saves queued or running per flag
  let all: Promise<unknown>[] = [];

  return {
    set(key, on, was) {
      if (!confirmed.has(key)) confirmed.set(key, was);
      const id = (latest.get(key) ?? 0) + 1;
      latest.set(key, id);
      opts.apply(key, on);

      waiting.set(key, (waiting.get(key) ?? 0) + 1);
      const run = (tails.get(key) ?? Promise.resolve()).then(async () => {
        try {
          if (latest.get(key) !== id) return; // replaced before its turn: the newer tap says the final value
          const r: SaveResult = await opts.save(key, on).catch(() => ({ ok: false }));
          if (r.ok) {
            confirmed.set(key, on);
          } else if (latest.get(key) === id) {
            opts.apply(key, confirmed.get(key) as boolean);
            opts.fail(key, r.error);
          }
        } finally {
          waiting.set(key, (waiting.get(key) ?? 1) - 1);
        }
      });
      tails.set(key, run);
      all.push(run);
    },
    busy: (key) => (waiting.get(key) ?? 0) > 0,
    async idle() {
      while (all.length > 0) {
        const pending = all;
        all = [];
        await Promise.all(pending);
      }
    },
  };
}

/**
 * Overrides still worth keeping: those the server hasn't caught up with (or that
 * are still being saved). `server` holds the server's value for each flag it knows.
 */
export function stillOverridden(overrides: Record<string, boolean>, server: Record<string, boolean | undefined>, busy: (key: string) => boolean): Record<string, boolean> {
  const out: Record<string, boolean> = {};
  for (const [key, on] of Object.entries(overrides)) {
    if (busy(key) || server[key] === undefined || server[key] !== on) out[key] = on;
  }
  return out;
}
