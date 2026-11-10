import NextAuth from "next-auth";
import authConfig from "./lib/auth.config";
import { NextResponse } from "next/server";

const { auth } = NextAuth(authConfig);

/** Pages anyone can see without signing in. */
const PUBLIC_PATHS = ["/", "/start", "/login", "/error"];
/** The athlete app. Coaches are sent back to their dashboard. */
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
    if (isApi) return path.startsWith("/api/client/") ? NextResponse.next() : NextResponse.json({ error: "Forbidden" }, { status: 403 });
    if (!matches(path, ATHLETE_PATHS)) return go(home);
  } else if (matches(path, ATHLETE_PATHS) || path.startsWith("/api/client/")) {
    return go(home);
  }

  return NextResponse.next();
});

export const config = {
  // Skip Next internals, the auth API, and static files (anything with an extension).
  matcher: ["/((?!api/auth|_next/static|_next/image|.*\\.[\\w]+$).*)"],
};
