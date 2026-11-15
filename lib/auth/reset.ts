/**
 * Password-reset links: 32 random bytes, only their SHA-256 stored, good for
 * 30 minutes, used up when the new password is saved (not when the page
 * opens, because mail scanners open links). Asking again cancels older ones.
 */

import { createHash, randomBytes } from "crypto";
import { prisma } from "@/lib/db/client";

export const RESET_TTL_MS = 30 * 60 * 1000;

export const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

/** A fresh link token for this user. Any unused older ones stop working. */
export async function createReset(userId: string, now = new Date()): Promise<string> {
  const token = randomBytes(32).toString("base64url");
  await prisma.$transaction([
    prisma.passwordReset.deleteMany({ where: { userId, usedAt: null } }),
    prisma.passwordReset.create({ data: { userId, tokenHash: hashToken(token), expiresAt: new Date(now.getTime() + RESET_TTL_MS) } }),
  ]);
  return token;
}

/** Who a still-valid token belongs to, without using it up (to check the new password first). */
export async function peekReset(token: string, now = new Date()) {
  if (!/^[A-Za-z0-9_-]{20,100}$/.test(token)) return null;
  const r = await prisma.passwordReset.findUnique({ where: { tokenHash: hashToken(token) }, select: { id: true, userId: true, usedAt: true, expiresAt: true } });
  if (!r || r.usedAt || r.expiresAt <= now) return null;
  return r;
}

/** Use the token up. True only for the one caller that got there first. Pass a transaction to use it up together with the password change. */
export async function consumeReset(id: string, now = new Date(), db: Pick<typeof prisma, "passwordReset"> = prisma): Promise<boolean> {
  const done = await db.passwordReset.updateMany({ where: { id, usedAt: null, expiresAt: { gt: now } }, data: { usedAt: now } });
  return done.count === 1;
}

export function resetUrl(token: string): string {
  const base = process.env.AUTH_URL ?? process.env.NEXTAUTH_URL ?? "http://localhost:3000";
  return `${base}/reset-password?token=${encodeURIComponent(token)}`;
}
