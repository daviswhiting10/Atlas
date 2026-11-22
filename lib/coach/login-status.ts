/**
 * Where a client is with the app, for the coach: worked out from the login that already exists, nothing stored.
 *   not invited: no login yet (needs an email on the client to invite)
 *   invited:     a login and a link, never opened  (Auth.js stamps `emailVerified` the first time a link is used)
 *   opened:      they got in with a link, no password yet
 *   password:    they can sign in on their own
 */

export type LoginStatusKey = "not_invited" | "invited" | "opened" | "password";
export type LoginStatus = { key: LoginStatusKey; label: string };

const LABELS: Record<LoginStatusKey, string> = {
  not_invited: "Not invited",
  invited: "Invited, hasn't opened the link",
  opened: "Opened the app, no password yet",
  password: "Password set",
};

export function loginStatus(c: { hasEmail: boolean }, user: { emailVerified: Date | null; hasPassword: boolean } | null): LoginStatus | null {
  const key: LoginStatusKey | null = user ? (user.hasPassword ? "password" : user.emailVerified ? "opened" : "invited") : c.hasEmail ? "not_invited" : null;
  return key ? { key, label: LABELS[key] } : null;
}
