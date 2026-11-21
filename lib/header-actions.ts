/**
 * What the app header offers on the right, for both sides (the coach's screens and the athlete app). One list, so the two
 * headers can't drift apart: the same actions, in the same order, with the same targets.
 *
 * Desktop (md and up): the demo chip, Settings, Sign out, then the Coach | Me toggle, on both sides.
 * Phone: the bottom bar's More already holds Settings and Sign out on the coach side, so the coach side adds nothing;
 * the Me side has no More, so it gets one Account menu (Settings, Sign out): two taps from any Me screen.
 *
 * Pure: no I/O.
 */

export type HeaderAction = "demo" | "settings" | "signout" | "account" | "mode";
export type Side = "coach" | "me";

export type HeaderActions = { desktop: HeaderAction[]; phone: HeaderAction[] };

/**
 * @param isCoach a coach (who has both sides). A client of a coach has only the athlete app: no toggle, and no
 *                Settings (those are the coach's); their sign-out is on You.
 */
export function headerActions({ side, demo, isCoach }: { side: Side; demo: boolean; isCoach: boolean }): HeaderActions {
  const chip: HeaderAction[] = demo ? ["demo"] : [];
  if (!isCoach) return { desktop: chip, phone: chip };
  return {
    desktop: [...chip, "settings", "signout", "mode"],
    phone: [...chip, ...(side === "me" ? (["account"] as HeaderAction[]) : []), "mode"],
  };
}
