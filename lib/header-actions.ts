/**
 * What the app header offers on the right, for both sides (the coach's screens and the athlete app). One list, so the two
 * headers can't drift apart: the same actions, in the same order, with the same targets.
 *
 * Desktop (md and up): the demo chip, Settings, Sign out, then the Coach | Me toggle, on both sides.
 * Phone: the bottom bar's More already holds Settings and Sign out on the coach side, so the coach side adds nothing.
 * The Me side has one ⋯ menu for every athlete, on every size: Add body weight and Demo; on a coach's phone also
 * Settings and Sign out (the Me side has no More).
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
  const account: HeaderAction[] = side === "me" ? ["account"] : [];
  if (!isCoach) return { desktop: [...chip, ...account], phone: [...chip, ...account] };
  return {
    desktop: [...chip, "settings", "signout", ...account, "mode"],
    phone: [...chip, ...account, "mode"],
  };
}

export type Slot = { action: HeaderAction; /** Where it shows: on every screen size, or only desktop (md and up), or only a phone. */ where: "both" | "desktop" | "phone" };

/** The actions once each, in order, with where each shows (so the page holds one copy of every action). */
export function headerSlots(args: { side: Side; demo: boolean; isCoach: boolean }): Slot[] {
  const { desktop, phone } = headerActions(args);
  const order: HeaderAction[] = ["demo", "settings", "signout", "account", "mode"];
  return order.flatMap((action) => {
    const d = desktop.includes(action), f = phone.includes(action);
    return d || f ? [{ action, where: d && f ? ("both" as const) : d ? ("desktop" as const) : ("phone" as const) }] : [];
  });
}
