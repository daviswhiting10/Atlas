/**
 * The rules for demo and guest workspaces, with nothing else imported so they
 * can be tested without a database: how many demos are allowed, and which
 * workspaces may be deleted.
 */
import { GUEST_EMAIL_DOMAIN } from "@/lib/auth/route-policy";

export const GUEST_TTL_MS = 24 * 60 * 60 * 1000;

export const isGuestEmail = (email: string) => email.toLowerCase().endsWith(`@${GUEST_EMAIL_DOMAIN}`);

/** Old enough, at least one user, and every user a guest login. Never true for a workspace with any real login. */
export function isExpiredGuestWorkspace(ws: { createdAt: Date; users: Array<{ email: string }> }, now: Date, ttlMs = GUEST_TTL_MS): boolean {
  return ws.users.length > 0 && ws.users.every((u) => isGuestEmail(u.email)) && now.getTime() - ws.createdAt.getTime() >= ttlMs;
}

/**
 * The demo writes about 5,500 rows, so it is capped harder than a plain guest
 * (a plan and no history). The counting is done in the database by
 * lib/guest.ts, so every server instance shares it: 10 new demos an hour
 * overall, and 3 an hour per connection (POLICIES.demoIp).
 */
export const DEMO_CAPS = { perHour: 10 };

/** Thrown when the demo is at its cap. The sign-in turns it into "busy, try again". */
export class DemoBusyError extends Error {
  constructor() {
    super("The demo is busy");
  }
}

/** Pure: is the demo full? `ipWaitMs` is how long this connection must still wait (0 = go ahead). */
export function demoBusy(demosLastHour: number, ipWaitMs: number, perHour = DEMO_CAPS.perHour): boolean {
  return demosLastHour >= perHour || ipWaitMs > 0;
}
