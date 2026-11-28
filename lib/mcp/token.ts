/**
 * Personal access tokens for the MCP endpoint (a remote AI client signs in as its user with one).
 *
 * A token is `atlas_pat_` + 32 random bytes (base64url). Only its SHA-256 is stored: the token itself is shown once, at
 * creation, and never written or logged anywhere. A request with a token acts as the token's user exactly as a browser
 * session for that user would (lib/mcp/caller.ts), so the role gate, client scoping and audit are unchanged.
 */

import { createHash, randomBytes } from "crypto";
import { prisma } from "@/lib/db/client";
import { callerForUser } from "./caller";
import type { McpCaller } from "./context";

export const TOKEN_PREFIX = "atlas_pat_";
const TOKEN_SHAPE = /^atlas_pat_[A-Za-z0-9_-]{43}$/;
/** lastUsedAt is written at most this often per token, not on every call. */
export const TOUCH_EVERY_MS = 60_000;

export function generateToken(): string {
  return TOKEN_PREFIX + randomBytes(32).toString("base64url");
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** The token in an `Authorization: Bearer …` header, or null for any other value (wrong scheme, wrong shape). */
export function bearerToken(header: string | null): string | null {
  const m = header?.match(/^Bearer\s+(\S+)\s*$/i);
  return m && TOKEN_SHAPE.test(m[1]) ? m[1] : null;
}

/**
 * The caller a token signs in as, with the token's id for the audit trail; null for an unknown, revoked or malformed
 * token, or a user who may act on nothing. The caller can't tell which.
 */
export async function resolveTokenCaller(token: string | null, now = new Date()): Promise<{ caller: McpCaller; tokenId: string } | null> {
  if (!token || !TOKEN_SHAPE.test(token)) return null;
  const row = await prisma.mcpToken.findUnique({ where: { tokenHash: hashToken(token) }, select: { id: true, userId: true, revokedAt: true } });
  if (!row || row.revokedAt) return null;
  const caller = await callerForUser(row.userId);
  if (!caller) return null;
  // One conditional write: nothing when it was already touched in the last minute.
  await prisma.mcpToken.updateMany({
    where: { id: row.id, revokedAt: null, OR: [{ lastUsedAt: null }, { lastUsedAt: { lt: new Date(now.getTime() - TOUCH_EVERY_MS) } }] },
    data: { lastUsedAt: now },
  });
  return { caller, tokenId: row.id };
}
