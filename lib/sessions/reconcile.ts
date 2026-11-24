/**
 * A logger opens from a copy of the page that can be old (the app keeps pages it has shown for a while, and prefetches the
 * next one). So when the logger opens it reads the session's sets again and brings its screen up to date.
 *
 * The rule, per exercise: if the sets on screen are still exactly what the page it opened from said (nothing has been typed
 * or ticked since), replace them with the fresh ones. If the person has already changed them, leave them alone: what is on
 * the screen is newer than what was read. Exercises the fresh read has and the screen lacks are added. Pure: no I/O.
 */

export function reconcile<T>(
  current: Record<string, T>,
  opened: Record<string, T>,
  fresh: Record<string, T>,
  same: (a: T, b: T) => boolean
): Record<string, T> {
  const out: Record<string, T> = { ...current };
  for (const [key, f] of Object.entries(fresh)) {
    const cur = current[key];
    if (cur === undefined) out[key] = f;
    else if (opened[key] !== undefined && same(cur, opened[key])) out[key] = f;
  }
  return out;
}
