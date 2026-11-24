/**
 * Coach | Me. Which side a page is on, and the small state machine behind the toggle.
 *
 * The toggle shows the side the person asked for at once (`shown`) while the other side's page loads
 * behind it (`inflight`). A repeated tap is a no-op; a tap for the other side while one is loading
 * is remembered and followed when the first arrives, so taps can never stack up or leave it stuck.
 *
 * Pure: no I/O.
 */

export type Mode = "coach" | "me";

/** Where each side opens. */
export const HOME: Record<Mode, string> = { coach: "/dashboard", me: "/today" };

const COACH_PATHS = ["/dashboard", "/log", "/clients", "/programs", "/exercises", "/intake", "/settings"];

/** The side a page belongs to (the coach's screens, or the athlete app: Today, Plan, Progress, You, workouts, goals). */
export function modeOf(pathname: string): Mode {
  return COACH_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/")) ? "coach" : "me";
}

export type SwitchState = { shown: Mode; inflight: Mode | null };
export type Step = { state: SwitchState; /** Navigate to this side's home now. */ go: Mode | null };

export const initial = (actual: Mode): SwitchState => ({ shown: actual, inflight: null });

/** A tap on a side of the toggle. */
export function tap(s: SwitchState, target: Mode): Step {
  if (target === s.shown) return { state: s, go: null }; // already showing it (or on its way): nothing to do
  // Show it at once. Navigate now, unless a navigation is already under way: its arrival follows this tap.
  return s.inflight == null ? { state: { shown: target, inflight: target }, go: target } : { state: { ...s, shown: target }, go: null };
}

/** The page's side is now `actual` (a navigation landed, or the person moved some other way). */
export function sync(s: SwitchState, actual: Mode): Step {
  if (s.inflight == null) {
    // Nothing was asked: just agree with where the page is.
    return s.shown === actual ? { state: s, go: null } : { state: { shown: actual, inflight: null }, go: null };
  }
  // The awaited side arrived (or the page went somewhere else): done waiting. If the person has since asked for the
  // other side, go there now.
  const settled: SwitchState = { shown: s.shown, inflight: null };
  return s.shown === actual ? { state: settled, go: null } : { state: { shown: s.shown, inflight: s.shown }, go: s.shown };
}
