/**
 * Caller resolution for the HTTP endpoint: the same Auth.js session the rest
 * of Atlas uses. Kept apart from lib/mcp/auth.ts so the pure authorization
 * rules (and the local runner) never import the web framework.
 */

import { auth } from "@/lib/auth";
import type { McpCaller } from "./context";

export async function resolveSessionCaller(): Promise<McpCaller | null> {
  const session = await auth();
  const user = session?.user;
  if (!user?.id || !user.workspaceId) return null;
  // An athlete session with no linked profile has nothing it may act on.
  if (user.role === "CLIENT" && !user.clientProfileId) return null;
  return {
    userId: user.id,
    role: user.role,
    workspaceId: user.workspaceId,
    clientProfileId: user.role === "CLIENT" ? (user.clientProfileId ?? null) : null,
  };
}
