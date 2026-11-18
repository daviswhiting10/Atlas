/**
 * How many sign-in link emails one address, and one connection, may ask for. Counted in the
 * database (the AuthThrottle table, like the password limits), so every server instance shares
 * the count. Asked before the link is made, so a refused request never replaces a link that was
 * already sent. Unknown addresses count like any other, so the answer never says who has an account.
 */

import { POLICIES, record, throttleKey, waitFor } from "./throttle";

/** Where the login page is sent when a request is refused; it shows the friendly message. */
export const LINK_LIMIT_URL = "/login?error=LinkLimit";

/** Count this request; true if it may go ahead, false if the address or connection is over its limit. */
export async function allowLinkRequest(email: string, ip: string): Promise<boolean> {
  const keys = { email: throttleKey("linkEmail", email), ip: throttleKey("linkIp", ip) };
  const waits = await Promise.all([waitFor(keys.email), waitFor(keys.ip)]);
  await Promise.all([record(keys.email, POLICIES.linkEmail), record(keys.ip, POLICIES.linkIp)]);
  return waits.every((w) => w === 0);
}
