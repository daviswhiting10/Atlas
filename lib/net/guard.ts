/**
 * What a screen does when a save can't reach the server. Without this, a dropped connection makes the call throw
 * and nothing is said: the person taps again and again, or believes it saved. Here the failure becomes an ordinary
 * `{ ok: false, error }` the screen already knows how to show, and the page re-reads itself once the connection is back
 * (so a save whose answer was lost on the way home shows as saved instead of being tried twice).
 *
 * Pure apart from `window` (only touched when called in a browser).
 */

import { isNetworkError } from "@/lib/sessions/pending";

export const NO_CONNECTION = "No connection. Nothing was changed. Try again when you're back.";
export const SOMETHING_WENT_WRONG = "Something went wrong. Please try again.";

export type Failed = { ok: false; error: string; offline?: boolean };

/** Run a save that answers `{ ok }`; a throw (offline, or the server crashing) becomes a `{ ok: false }` with words. */
export async function guard<T extends { ok: boolean }>(run: () => Promise<T>, onBack?: () => void): Promise<T | Failed> {
  try {
    return await run();
  } catch (e) {
    if (isNetworkError(e)) {
      if (onBack) refreshWhenBack(onBack);
      return { ok: false, error: NO_CONNECTION, offline: true };
    }
    return { ok: false, error: SOMETHING_WENT_WRONG };
  }
}

/** Once, when the connection returns. Asked for twice, it still runs once. */
const waiting = new Set<() => void>();
export function refreshWhenBack(fn: () => void) {
  if (typeof window === "undefined" || waiting.has(fn)) return;
  waiting.add(fn);
  window.addEventListener(
    "online",
    () => {
      waiting.delete(fn);
      fn();
    },
    { once: true }
  );
}

type Action = (...args: never[]) => Promise<unknown>;

/** Every action in the set, guarded. Actions that don't answer `{ ok }` (they return nothing) are left alone. */
export function guardActions<A extends Record<string, Action | undefined>>(actions: A, onBack?: () => void): A {
  const out: Record<string, unknown> = {};
  for (const [name, fn] of Object.entries(actions)) {
    if (!fn) continue;
    out[name] = async (...args: never[]) => {
      try {
        return await fn(...args);
      } catch (e) {
        if (isNetworkError(e)) {
          if (onBack) refreshWhenBack(onBack);
          return { ok: false, error: NO_CONNECTION, offline: true };
        }
        return { ok: false, error: SOMETHING_WENT_WRONG };
      }
    };
  }
  return out as A;
}

/**
 * A client the coach added a moment ago whose answer never came back: the same name (and email, if given) created since
 * `since`. Trying "Add" again must not make a second copy of her.
 */
export function createdSince<C extends { id: string; fullName: string; email?: string | null; createdAt: string }>(
  clients: C[],
  form: { fullName: string; email?: string },
  since: number,
  skewMs = 5000
): C | null {
  const norm = (s: string | null | undefined) => (s ?? "").trim().toLowerCase();
  return (
    clients.find((c) => norm(c.fullName) === norm(form.fullName) && norm(c.email) === norm(form.email) && new Date(c.createdAt).getTime() >= since - skewMs) ?? null
  );
}
