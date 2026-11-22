/**
 * An invite link opens a page, not a sign-in. Messages, mail and chat apps fetch a link to draw a preview, and
 * a sign-in that happened on that fetch would be used up before the person ever tapped it (it happened: the
 * first real invite was used 6 seconds after it was made). So the link goes to /invite, which only reads;
 * the sign-in happens when the person presses its one button. Pure.
 */

import { createHash } from "crypto";

/** How the app's own address is found for links (same order the invite and email code always used). */
export function appBase(env: Record<string, string | undefined> = process.env): string {
  return env.AUTH_URL ?? env.NEXTAUTH_URL ?? "http://localhost:3000";
}

/** Matches Auth.js v5's own hashing of an email-link token: SHA256(token + AUTH_SECRET). */
export function hashToken(rawToken: string, secret: string | undefined = process.env.AUTH_SECRET): string {
  return createHash("sha256").update(`${rawToken}${secret ?? ""}`).digest("hex");
}

/** A raw token is 32 random bytes in hex. Anything else is not one of ours. */
export const isInviteToken = (t: unknown): t is string => typeof t === "string" && /^[a-f0-9]{64}$/.test(t);

/** The link a coach shares: reading it signs nobody in. */
export function inviteLink(base: string, rawToken: string): string {
  return `${base}/invite?token=${rawToken}`;
}

/** What the button's press sends the browser to: Auth.js's own email-link sign-in, then Today. */
export function signInUrl(base: string, rawToken: string, email: string): string {
  return `${base}/api/auth/callback/email?token=${rawToken}&email=${encodeURIComponent(email)}&callbackUrl=${encodeURIComponent(`${base}/today`)}`;
}

/** Auth.js's session cookie, in both its plain and `__Secure-` names (and the chunks a long one is split into). */
export const SESSION_COOKIES = ["authjs.session-token", "__Secure-authjs.session-token", "authjs.session-token.0", "authjs.session-token.1", "__Secure-authjs.session-token.0", "__Secure-authjs.session-token.1"];
