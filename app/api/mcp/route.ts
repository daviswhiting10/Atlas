import { createMcpHandler } from "@modelcontextprotocol/server";
import { NextResponse } from "next/server";
import type { McpCaller } from "@/lib/mcp/context";
import { createMcpServer, defaultDeps } from "@/lib/mcp/server";
import { resolveSessionCaller } from "@/lib/mcp/session";
import { bearerToken, resolveTokenCaller } from "@/lib/mcp/token";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Streamable HTTP endpoint for the Atlas MCP server.
 *
 * Two ways in, resolved here, once, and handed to the server factory — tools never see an identity that came from the
 * request body:
 *  - `Authorization: Bearer atlas_pat_…`: a personal access token (Settings). Acts as the token's user.
 *  - no Authorization header: the signed-in browser session, as the rest of Atlas.
 */
const handler = createMcpHandler((ctx) => {
  const extra = ctx.authInfo?.extra as { caller?: McpCaller; tokenId?: string | null } | undefined;
  if (!extra?.caller) throw new Error("MCP request reached the server without a caller");
  return createMcpServer(extra.caller, defaultDeps("http", extra.tokenId ?? null));
});

const unauthorized = () => NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: { "WWW-Authenticate": 'Bearer realm="atlas"' } });

async function serve(req: Request): Promise<Response> {
  // Any Authorization header means the token path, and only the token path: the cookie is never read, so a request
  // can't pair a bad token with a visitor's session. No origin check here, on purpose: the origin rule exists because
  // a browser attaches the session cookie to a cross-site request by itself. It never attaches a bearer token by
  // itself (another site would have to know the token, and a cross-origin page setting Authorization needs a CORS
  // preflight this route doesn't grant), so a bearer request carries no ambient credential to steal.
  const authorization = req.headers.get("authorization");
  if (authorization !== null) {
    const resolved = await resolveTokenCaller(bearerToken(authorization));
    if (!resolved) return unauthorized();
    return handler.fetch(req, { authInfo: { token: "pat", clientId: resolved.caller.userId, scopes: [], extra: { caller: resolved.caller, tokenId: resolved.tokenId } } });
  }

  // Session cookies ride along with browser requests, so refuse any call that
  // names a different origin: another site must not be able to drive tools
  // with a signed-in visitor's session.
  const origin = req.headers.get("origin");
  if (origin && new URL(origin).host !== new URL(req.url).host && origin !== process.env.AUTH_URL) {
    return NextResponse.json({ error: "Cross-origin requests are not allowed" }, { status: 403 });
  }

  const caller = await resolveSessionCaller();
  if (!caller) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  return handler.fetch(req, { authInfo: { token: "session", clientId: caller.userId, scopes: [], extra: { caller, tokenId: null } } });
}

export { serve as GET, serve as POST, serve as DELETE };
