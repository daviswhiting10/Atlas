import { createMcpHandler } from "@modelcontextprotocol/server";
import { NextResponse } from "next/server";
import type { McpCaller } from "@/lib/mcp/context";
import { createMcpServer, defaultDeps } from "@/lib/mcp/server";
import { resolveSessionCaller } from "@/lib/mcp/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Streamable HTTP endpoint for the Atlas MCP server.
 *
 * Phase 1 auth: the same signed-in session as the rest of Atlas. The caller
 * is resolved here, once, and handed to the server factory — tools never see
 * an identity that came from the request body.
 */
const handler = createMcpHandler((ctx) => {
  const caller = ctx.authInfo?.extra?.caller as McpCaller | undefined;
  if (!caller) throw new Error("MCP request reached the server without a caller");
  return createMcpServer(caller, defaultDeps("http"));
});

async function serve(req: Request): Promise<Response> {
  // Session cookies ride along with browser requests, so refuse any call that
  // names a different origin: another site must not be able to drive tools
  // with a signed-in visitor's session.
  const origin = req.headers.get("origin");
  if (origin && new URL(origin).host !== new URL(req.url).host && origin !== process.env.AUTH_URL) {
    return NextResponse.json({ error: "Cross-origin requests are not allowed" }, { status: 403 });
  }

  const caller = await resolveSessionCaller();
  if (!caller) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  return handler.fetch(req, { authInfo: { token: "session", clientId: caller.userId, scopes: [], extra: { caller } } });
}

export { serve as GET, serve as POST, serve as DELETE };
