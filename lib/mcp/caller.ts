/**
 * Who a user is to MCP. Every way in (the browser session, a personal access token, the local runner) ends here, so
 * the role, workspace and client profile are worked out the same way whichever door the call came through.
 */

import { prisma } from "@/lib/db/client";
import type { McpCaller, McpRole } from "./context";

export type UserIdentity = { id: string | null | undefined; role: McpRole; workspaceId: string | null | undefined; clientProfileId: string | null | undefined };

/** Pure: a user's identity as a caller, or null when it may act on nothing (no workspace; an athlete with no profile). */
export function toCaller(u: UserIdentity): McpCaller | null {
  if (!u.id || !u.workspaceId) return null;
  if (u.role === "CLIENT" && !u.clientProfileId) return null;
  return { userId: u.id, role: u.role, workspaceId: u.workspaceId, clientProfileId: u.role === "CLIENT" ? (u.clientProfileId ?? null) : null };
}

/** The caller for a user id, read from the database the way sign-in fills the session (lib/auth.ts, the jwt callback). */
export async function callerForUser(userId: string): Promise<McpCaller | null> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, role: true, workspaceId: true } });
  if (!user) return null;
  const profile = user.role === "CLIENT" ? await prisma.clientProfile.findFirst({ where: { userId: user.id }, select: { id: true } }) : null;
  return toCaller({ id: user.id, role: user.role, workspaceId: user.workspaceId, clientProfileId: profile?.id ?? null });
}
