/**
 * Local MCP server over STDIO, for IDE agents on this machine (Claude Code,
 * Cursor). Run with:  npm run mcp
 *
 * stdout carries the protocol, so nothing else may print there — all
 * diagnostics go to stderr. Never expose this as a network service.
 */

import { config } from "dotenv";

// Load the environment before anything that reads it at import time (the database client).
config({ path: ".env.local", quiet: true });
config({ path: ".env", quiet: true });

async function main() {
  const { serveStdio } = await import("@modelcontextprotocol/server/stdio");
  const { resolveLocalCaller } = await import("./local");
  const { createMcpServer, defaultDeps } = await import("./server");

  const caller = await resolveLocalCaller();
  console.error(`[atlas-mcp] serving as ${caller.role} in workspace ${caller.workspaceId}`);
  serveStdio(() => createMcpServer(caller, defaultDeps("stdio")), {
    onerror: (err) => console.error("[atlas-mcp]", err),
  });
}

main().catch((err) => {
  console.error("[atlas-mcp] failed to start:", err instanceof Error ? err.message : err);
  process.exit(1);
});
