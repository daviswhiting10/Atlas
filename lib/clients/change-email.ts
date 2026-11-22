/**
 * A coach corrects a client's email. If the client already has a login, the login's email changes with it, in the
 * same transaction, so she signs in with the corrected address and keeps her password and everything she logged.
 * Refused if another account already uses the new address. Unused sign-in links for the old address stop working
 * (they were for the old address).
 */

import { prisma } from "@/lib/db/client";
import { normalizeEmail } from "@/lib/password";

export type ChangeEmailResult = { ok: true; changed: boolean } | { ok: false; status: 400 | 404 | 409; error: string };

const LOOKS_LIKE_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function changeClientEmail(clientId: string, workspaceId: string, raw: string): Promise<ChangeEmailResult> {
  const email = raw.trim() === "" ? "" : normalizeEmail(raw);
  if (email !== "" && (!LOOKS_LIKE_EMAIL.test(email) || email.length > 254)) return { ok: false, status: 400, error: "That doesn't look like an email address." };

  return prisma.$transaction(async (tx) => {
    const client = await tx.clientProfile.findFirst({ where: { id: clientId, workspaceId, deletedAt: null }, select: { id: true, email: true, userId: true } });
    if (!client) return { ok: false, status: 404, error: "Client not found" } as const;
    // Only a client's own login follows the record. A coach's own training profile is linked to the coach's login,
    // which is never changed from here.
    const linked = client.userId ? await tx.user.findUnique({ where: { id: client.userId }, select: { id: true, email: true, role: true } }) : null;
    const login = linked?.role === "CLIENT" ? linked : null;

    if (login) {
      if (email === "") return { ok: false, status: 400, error: "She signs in with this email, so it can't be empty." } as const;
      if (email !== login.email) {
        const taken = await tx.user.findUnique({ where: { email }, select: { id: true } });
        if (taken && taken.id !== login.id) return { ok: false, status: 409, error: "Another account already uses that email." } as const;
        await tx.verificationToken.deleteMany({ where: { identifier: login.email } });
        await tx.user.update({ where: { id: login.id }, data: { email } });
      }
    }
    const value = email === "" ? null : email;
    if ((client.email ?? null) === value && (!login || login.email === email)) return { ok: true, changed: false } as const;
    await tx.clientProfile.update({ where: { id: client.id }, data: { email: value } });
    return { ok: true, changed: true } as const;
  });
}
