/**
 * Email and password sign-in: the check the "password" provider in lib/auth.ts runs. Moved here unchanged so it
 * can be tested end to end (set a password, sign out, sign in).
 *
 * Wrong address and wrong password look the same from outside: same answer, same time taken. Limits are shared by
 * every server instance (lib/auth/throttle.ts); a blocked attempt looks exactly like a wrong password, and the hash
 * is still computed.
 */

import { prisma } from "@/lib/db/client";
import { Email as EmailAddress, hashPassword, needsRehash, verifyAgainstDecoy, verifyPassword } from "@/lib/password";
import { POLICIES, clear, ipFrom, record, throttleKey, waitFor } from "@/lib/auth/throttle";

export type SignedIn = { id: string; name: string | null; email: string; role: string; workspaceId: string | null };

export async function passwordSignIn(credentials: Partial<Record<string, unknown>> | undefined, headers: Headers): Promise<SignedIn | null> {
  const parsed = EmailAddress.safeParse(credentials?.email);
  const password = typeof credentials?.password === "string" ? credentials.password.slice(0, 200) : "";
  if (!parsed.success || !password) return null;
  const email = parsed.data;
  const ip = ipFrom(headers);
  const keys = { emailIp: throttleKey("signinEmailIp", email, ip), email: throttleKey("signinEmail", email), ip: throttleKey("signinIp", ip) };
  const waits = await Promise.all([waitFor(keys.emailIp), waitFor(keys.email), waitFor(keys.ip)]);
  await record(keys.ip, POLICIES.signinIp);
  if (waits.some((w) => w > 0)) {
    await verifyAgainstDecoy(password);
    return null;
  }

  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, name: true, email: true, role: true, workspaceId: true, passwordHash: true },
  });
  const ok = user?.passwordHash ? await verifyPassword(password, user.passwordHash) : (await verifyAgainstDecoy(password), false);
  if (!user || !ok) {
    await Promise.all([record(keys.emailIp, POLICIES.signinEmailIp), record(keys.email, POLICIES.signinEmail)]);
    return null;
  }
  await clear(keys.emailIp);
  // Hashes made with older, weaker settings are upgraded now that we have the password.
  if (needsRehash(user.passwordHash)) {
    await prisma.user.update({ where: { id: user.id }, data: { passwordHash: await hashPassword(password) } }).catch((err) => console.error("[rehash]", err));
  }
  return { id: user.id, name: user.name, email: user.email, role: user.role, workspaceId: user.workspaceId };
}
