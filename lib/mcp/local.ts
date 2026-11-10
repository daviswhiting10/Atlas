/**
 * Caller resolution for the local STDIO runner. There is no browser session
 * here, so the identity comes from explicit local configuration:
 *
 *   ATLAS_MCP_AS=demo                 a demo athlete with sample history (safe to show anyone)
 *   ATLAS_MCP_USER_EMAIL=you@x.com    an existing Atlas user — their role and workspace apply
 *
 * The same role and scoping rules then apply as over HTTP. Local-trust only:
 * whoever can run this process can already read the database.
 */

import { prisma } from "@/lib/db/client";
import { createGuest, GUEST_EMAIL_DOMAIN } from "@/lib/guest";
import type { McpCaller } from "./context";

async function callerForUser(userId: string): Promise<McpCaller | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, role: true, workspaceId: true, clientProfile: { select: { id: true } } },
  });
  if (!user?.workspaceId) return null;
  if (user.role === "CLIENT" && !user.clientProfile) return null;
  return {
    userId: user.id,
    role: user.role,
    workspaceId: user.workspaceId,
    clientProfileId: user.role === "CLIENT" ? (user.clientProfile?.id ?? null) : null,
  };
}

export async function resolveLocalCaller(env: NodeJS.ProcessEnv = process.env): Promise<McpCaller> {
  const email = env.ATLAS_MCP_USER_EMAIL?.trim().toLowerCase();

  if (email) {
    const user = await prisma.user.findUnique({ where: { email }, select: { id: true } });
    const caller = user ? await callerForUser(user.id) : null;
    if (!caller) throw new Error(`ATLAS_MCP_USER_EMAIL: no usable Atlas account for that address.`);
    return caller;
  }

  if (env.ATLAS_MCP_AS === "demo") {
    // Reuse the most recent demo athlete rather than creating one per run.
    const existing = await prisma.clientProfile.findFirst({
      where: { user: { email: { endsWith: `@${GUEST_EMAIL_DOMAIN}` } }, goalTargets: { path: ["athlete", "demo"], equals: true } },
      orderBy: { createdAt: "desc" },
      select: { userId: true },
    });
    const userId = existing?.userId ?? (await createGuest({ demo: true })).id;
    const caller = await callerForUser(userId);
    if (!caller) throw new Error("Could not set up the demo athlete.");
    return caller;
  }

  throw new Error("Set ATLAS_MCP_AS=demo, or ATLAS_MCP_USER_EMAIL to an existing Atlas account, before starting the MCP server.");
}
