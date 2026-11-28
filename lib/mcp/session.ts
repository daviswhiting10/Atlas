/**
 * Caller resolution for the HTTP endpoint: the same Auth.js session the rest
 * of Atlas uses. Kept apart from lib/mcp/auth.ts so the pure authorization
 * rules (and the local runner) never import the web framework.
 */

import { auth } from "@/lib/auth";
import { toCaller } from "./caller";
import type { McpCaller } from "./context";

export async function resolveSessionCaller(): Promise<McpCaller | null> {
  const user = (await auth())?.user;
  return user ? toCaller({ id: user.id, role: user.role, workspaceId: user.workspaceId, clientProfileId: user.clientProfileId }) : null;
}
