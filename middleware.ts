import NextAuth from "next-auth";
import authConfig from "./lib/auth.config";
import { NextResponse } from "next/server";

const { auth } = NextAuth(authConfig);

/** Pages anyone can see without signing in. */
const PUBLIC_PATHS = ["/", "/start", "/login", "/error"];
/** The athlete app. Coaches use it too, for their own training ("My training"). */
const ATHLETE_PATHS = ["/today", "/plan", "/workouts", "/progress", "/you"];

const matches = (path: string, list: string[]) =>
  list.some((p) => path === p || path.startsWith(p + "/"));

export default auth((req) => {
  const path = req.nextUrl.pathname;
  const user = req.auth?.user;
  const isApi = path.startsWith("/api/");
  const go = (to: string) => NextResponse.redirect(new URL(to, req.url));

  if (!user) {
    if (matches(path, PUBLIC_PATHS)) return NextResponse.next();
    if (isApi) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    return go("/login");
  }

  const isAthlete = user.role === "CLIENT";
  const home = isAthlete ? "/today" : "/inbox";

  // Signed-in visitors skip the marketing and sign-in pages.
  if (path === "/" || path === "/login" || path === "/start") return go(home);

  if (isAthlete) {
    // The athlete app talks to the server through server actions and /api/mcp;
    // every other API route belongs to the coach dashboard.
    if (isApi) return path === "/api/mcp" ? NextResponse.next() : NextResponse.json({ error: "Forbidden" }, { status: 403 });
    if (!matches(path, ATHLETE_PATHS)) return go(home);
  }

  return NextResponse.next();
});

export const config = {
  // Skip Next internals, the auth API, and a named list of static files.
  // Deliberately not "anything with a dot": that would let a path like
  // /clients/a.b slip past the role checks above.
  matcher: ["/((?!api/auth|_next/static|_next/image|favicon\\.ico$|manifest\\.json$|sw\\.js$|swe-worker-[\\w-]+\\.js$|workbox-[\\w-]+\\.js$|icons/).*)"],
};
