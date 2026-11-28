"use server";

/**
 * Personal access tokens for AI access (Settings): create, list, revoke. Signed-in users only, any role, and only their
 * own tokens: every query is filtered by the session's user id. The token is returned once, by createMcpToken, and is
 * never stored or logged (only its hash is, lib/mcp/token.ts).
 */

import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db/client";
import { GUEST_EMAIL_DOMAIN } from "@/lib/auth/route-policy";
import { generateToken, hashToken } from "@/lib/mcp/token";

/** Active (unrevoked) tokens one user may hold at once. */
const MAX_ACTIVE = 10;

const Name = z.object({ name: z.string().trim().min(1, "Give it a name.").max(60, "Keep the name to 60 characters.") });
const Id = z.object({ id: z.string().min(1).max(64) });

async function signedIn(): Promise<{ id: string; guest: boolean } | null> {
  const user = (await auth())?.user;
  return user?.id ? { id: user.id, guest: (user.email ?? "").endsWith(`@${GUEST_EMAIL_DOMAIN}`) } : null;
}

export async function createMcpToken(raw: { name: string }): Promise<{ ok: true; id: string; token: string; name: string } | { ok: false; error: string }> {
  const user = await signedIn();
  if (!user) return { ok: false, error: "Sign in again to create a token." };
  // A guest account is removed when it's left; save it first.
  if (user.guest) return { ok: false, error: "Save your account first: tokens are for accounts." };
  const input = Name.safeParse(raw);
  if (!input.success) return { ok: false, error: input.error.issues[0]?.message ?? "Give it a name." };

  const active = await prisma.mcpToken.count({ where: { userId: user.id, revokedAt: null } });
  if (active >= MAX_ACTIVE) return { ok: false, error: `You have ${MAX_ACTIVE} active tokens. Revoke one first.` };

  const token = generateToken();
  const row = await prisma.mcpToken.create({ data: { userId: user.id, name: input.data.name, tokenHash: hashToken(token) }, select: { id: true, name: true } });
  return { ok: true, id: row.id, token, name: row.name };
}

export async function listMcpTokens(): Promise<Array<{ id: string; name: string; createdAt: string; lastUsedAt: string | null; revokedAt: string | null }>> {
  const user = await signedIn();
  if (!user) return [];
  const rows = await prisma.mcpToken.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    select: { id: true, name: true, createdAt: true, lastUsedAt: true, revokedAt: true },
  });
  return rows.map((r) => ({ id: r.id, name: r.name, createdAt: r.createdAt.toISOString(), lastUsedAt: r.lastUsedAt?.toISOString() ?? null, revokedAt: r.revokedAt?.toISOString() ?? null }));
}

/** Revoke one of your own tokens. Revoking one already revoked is fine; anyone else's is "not found". */
export async function revokeMcpToken(raw: { id: string }): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await signedIn();
  if (!user) return { ok: false, error: "Sign in again to revoke a token." };
  const input = Id.safeParse(raw);
  if (!input.success) return { ok: false, error: "That token wasn't found." };

  const { count } = await prisma.mcpToken.updateMany({ where: { id: input.data.id, userId: user.id, revokedAt: null }, data: { revokedAt: new Date() } });
  if (count > 0) return { ok: true };
  const own = await prisma.mcpToken.findFirst({ where: { id: input.data.id, userId: user.id }, select: { id: true } });
  return own ? { ok: true } : { ok: false, error: "That token wasn't found." };
}
