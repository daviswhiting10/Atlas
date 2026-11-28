import { NextResponse, type NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";
import { GUEST_EMAIL_DOMAIN, bearerToMcp, decide, mergeCookieHeader, needsRecheck, type RouteUser } from "./lib/auth/route-policy";

/**
 * Reads the session cookie, and every 10 minutes has the server re-check it
 * against the database (password changed since? password still to set?).
 *
 * The re-check runs in /api/auth/session, the one place that both reads the
 * database and saves the cookie: pages can't save cookies, and middleware
 * can't reach the database. Its new cookie goes to the browser and to the
 * page rendered for this same request.
 */
export default async function middleware(req: NextRequest) {
  // A token-authenticated MCP call: the route checks the token (lib/auth/route-policy.ts, bearerToMcp).
  if (bearerToMcp(req.nextUrl.pathname, req.headers.get("authorization"))) return NextResponse.next();

  // Same choices Auth.js makes: AUTH_URL (if set) decides the cookie's name, and the secret falls back to NEXTAUTH_SECRET.
  const authUrl = process.env.AUTH_URL ?? process.env.NEXTAUTH_URL;
  const secure = (authUrl ? new URL(authUrl).protocol : req.nextUrl.protocol) === "https:";
  const secret = process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET;
  const token = await getToken({ req, secret, secureCookie: secure }).catch(() => null);

  const guest = typeof token?.email === "string" && token.email.endsWith(`@${GUEST_EMAIL_DOMAIN}`);
  let user: RouteUser = token ? { role: String(token.role ?? "TRAINER"), needsPassword: token.np === true, guest } : null;
  let setCookies: string[] = [];

  if (token && needsRecheck(token.chk, Date.now())) {
    try {
      const res = await fetch(new URL("/api/auth/session", req.nextUrl.origin), {
        headers: { cookie: req.headers.get("cookie") ?? "" },
        cache: "no-store",
      });
      if (res.ok) {
        const session = (await res.json()) as { user?: { role?: string; needsPassword?: boolean } } | null;
        setCookies = res.headers.getSetCookie();
        user = session?.user ? { role: String(session.user.role ?? "TRAINER"), needsPassword: session.user.needsPassword === true, guest } : null;
      }
    } catch (err) {
      // Can't reach the server: go on with the cookie as it is, and try again next request.
      console.error("[middleware] session re-check failed", err);
    }
  }

  const decision = decide(req.nextUrl.pathname, user);
  let response: NextResponse;
  if (decision.kind === "redirect") {
    response = NextResponse.redirect(new URL(decision.to, req.url));
  } else if (decision.kind === "json") {
    response = NextResponse.json({ error: decision.error }, { status: decision.status });
  } else if (setCookies.length) {
    const headers = new Headers(req.headers);
    headers.set("cookie", mergeCookieHeader(req.headers.get("cookie") ?? "", setCookies));
    response = NextResponse.next({ request: { headers } });
  } else {
    response = NextResponse.next();
  }
  for (const c of setCookies) response.headers.append("set-cookie", c);
  return response;
}

export const config = {
  // Skip Next internals, the auth API, and a named list of static files.
  // Deliberately not "anything with a dot": that would let a path like
  // /clients/a.b slip past the role checks above.
  matcher: ["/((?!api/auth|_next/static|_next/image|favicon\\.ico$|manifest\\.json$|sw\\.js$|swe-worker-[\\w-]+\\.js$|workbox-[\\w-]+\\.js$|icons/).*)"],
};
