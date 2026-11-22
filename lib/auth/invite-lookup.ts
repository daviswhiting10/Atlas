/**
 * Read an invite without using it. Looking is free and repeatable: this never deletes or changes the token, so a
 * preview fetch, a second tap or a refresh costs nothing. Only Auth.js's sign-in (the button) uses a token up.
 */

import { prisma } from "@/lib/db/client";
import { hashToken, isInviteToken } from "./invite-link";

export type Invite = { email: string; firstName: string };

/** The invite behind this token, or null if it is not one of ours, has expired, or was already used. */
export async function lookupInvite(rawToken: unknown, now = new Date()): Promise<Invite | null> {
  if (!isInviteToken(rawToken)) return null;
  const row = await prisma.verificationToken.findFirst({ where: { token: hashToken(rawToken), expires: { gt: now } }, select: { identifier: true } });
  if (!row) return null;
  const user = await prisma.user.findUnique({ where: { email: row.identifier }, select: { email: true, name: true, role: true } });
  if (!user || user.role !== "CLIENT") return null;
  return { email: user.email, firstName: (user.name ?? "").trim().split(/\s+/)[0] || "there" };
}
