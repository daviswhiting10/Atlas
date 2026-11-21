/**
 * Where a request may go, decided from the session alone. Pure, and edge-safe
 * (the middleware imports it).
 */

import { RECHECK_MS } from "./session-policy";

/** Pages anyone can see without signing in. */
export const PUBLIC_PATHS = ["/", "/start", "/login", "/error", "/agents", "/forgot-password", "/reset-password", "/invite", "/api/invite"];
/** Public pages a signed-in visitor may also read, whatever their role. */
export const SHARED_PATHS = ["/agents", "/error", "/forgot-password", "/reset-password", "/invite", "/api/invite"];
/** The athlete app. Coaches use it too, for their own training ("My training"). */
export const ATHLETE_PATHS = ["/today", "/plan", "/workouts", "/progress", "/you", "/goals", "/report"];
/** The set-password step: signed in, any role. */
/** The athlete's own plan import (reads a PDF, photos or a sheet). Its handler checks who may use it. */
export const ATHLETE_IMPORT_PATH = "/api/athlete/plan-import";
export const SET_PASSWORD_PATH = "/set-password";

/** Guest and demo logins: a made-up address on this domain, no email, no password. */
export const GUEST_EMAIL_DOMAIN = "guest.atlas.app";
/**
 * What a guest (the demo, or someone trying the app) may not call: anything that
 * reaches a real person (an invite email) or costs money per call (AI, uploads, outreach).
 * Everything inside their own workspace still works.
 */
const GUEST_BLOCKED = [/^\/api\/ai(\/|$)/, /^\/api\/clients\/[^/]+\/(invite|erase|plan-from-sheet)(\/|$)/, /^\/api\/exercise-media(\/|$)/, /^\/api\/outreach(\/|$)/, /^\/api\/leads(\/|$)/, /^\/api\/mcp(\/|$)/, /^\/api\/athlete\/plan-import$/, /^\/api\/programs\/import$/];

export type RouteUser = { role: string; needsPassword: boolean; guest?: boolean } | null;

export type Decision =
  | { kind: "next" }
  | { kind: "redirect"; to: string }
  | { kind: "json"; status: 401 | 403; error: string };

const matches = (path: string, list: string[]) => list.some((p) => path === p || path.startsWith(p + "/"));

export function decide(path: string, user: RouteUser): Decision {
  const isApi = path.startsWith("/api/");
  const next = { kind: "next" } as const;
  const go = (to: string) => ({ kind: "redirect", to }) as const;

  if (!user) {
    if (matches(path, PUBLIC_PATHS)) return next;
    if (isApi) return { kind: "json", status: 401, error: "Unauthorized" };
    return go("/login");
  }

  if (matches(path, SHARED_PATHS)) return next;
  if (user.guest && GUEST_BLOCKED.some((re) => re.test(path))) return { kind: "json", status: 403, error: "Not available in the demo" };

  const isAthlete = user.role === "CLIENT";
  const home = isAthlete ? "/today" : "/log";

  // The set-password step: every page leads to it until a password is set (or snoozed).
  // API calls are left alone; the step's own form posts to its own page.
  if (user.needsPassword && !isApi) return path === SET_PASSWORD_PATH ? next : go(SET_PASSWORD_PATH);
  if (path === SET_PASSWORD_PATH) return go(home);

  // Signed-in visitors skip the marketing and sign-in pages.
  if (path === "/" || path === "/login" || path === "/start") return go(home);

  if (isAthlete) {
    // The athlete app talks to the server through server actions, /api/mcp and one upload route (Import a plan,
    // which takes a file a server action can't); every other API route belongs to the coach dashboard.
    if (isApi) return path === "/api/mcp" || path === ATHLETE_IMPORT_PATH ? next : { kind: "json", status: 403, error: "Forbidden" };
    if (!matches(path, ATHLETE_PATHS)) return go(home);
  }

  return next;
}

/** A session's cookie is re-checked against the database when its last check is this old (or missing). */
export function needsRecheck(checkedAt: unknown, now: number): boolean {
  return typeof checkedAt !== "number" || now - checkedAt > RECHECK_MS;
}

/**
 * The request's Cookie header with the response's Set-Cookie lines applied,
 * so the page rendered for this same request sees the refreshed session.
 * A cookie set to expire (Max-Age=0, or an Expires in the past) is dropped.
 */
export function mergeCookieHeader(header: string, setCookies: string[], now = Date.now()): string {
  const jar = new Map<string, string>();
  for (const part of header.split(";")) {
    const at = part.indexOf("=");
    if (at > 0) jar.set(part.slice(0, at).trim(), part.slice(at + 1).trim());
  }
  for (const line of setCookies) {
    const [pair, ...attrs] = line.split(";");
    const at = pair.indexOf("=");
    if (at <= 0) continue;
    const name = pair.slice(0, at).trim();
    const value = pair.slice(at + 1).trim();
    const attr = (key: string) => attrs.map((a) => a.trim()).find((a) => a.toLowerCase().startsWith(key + "="))?.slice(key.length + 1);
    const maxAge = attr("max-age");
    const expires = attr("expires");
    const gone = (maxAge !== undefined && Number(maxAge) <= 0) || (expires !== undefined && Date.parse(expires) <= now) || value === "";
    if (gone) jar.delete(name);
    else jar.set(name, value);
  }
  return Array.from(jar).map(([k, v]) => `${k}=${v}`).join("; ");
}
