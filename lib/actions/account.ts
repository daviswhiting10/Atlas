"use server";

/**
 * Creating an account, and turning a guest account into one. Both end with
 * the browser signing in through the "password" provider, which issues the
 * session; these actions only ever write the account.
 */

import { headers } from "next/headers";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db/client";
import { GUEST_EMAIL_DOMAIN, createAthlete } from "@/lib/guest";
import { Email, Password, hashPassword, rateLimiter } from "@/lib/password";

export type AccountResult = { ok: true } | { ok: false; error: string };

const TAKEN = "An account already uses that email. Sign in instead.";
const perIp = rateLimiter(10, 60 * 60_000);

function clientIp(): string {
  return headers().get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
}

function firstIssue(err: z.ZodError): string {
  return err.issues[0]?.message ?? "Check your details and try again.";
}

const isUniqueViolation = (err: unknown) => (err as { code?: string } | null)?.code === "P2002";

const NewAccount = z.object({
  name: z.string().trim().min(1, "Add your first name.").max(40),
  email: Email,
  password: Password,
  prefs: z.unknown(),
});

/** Sign up: a self-serve athlete with their own plan, reachable from any device. */
export async function createAccount(raw: { name: string; email: string; password: string; prefs: unknown }): Promise<AccountResult> {
  const parsed = NewAccount.safeParse(raw);
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };
  if (!perIp(clientIp())) return { ok: false, error: "Too many sign-ups from this connection. Try again in a while." };

  const { name, email, password, prefs } = parsed.data;
  if (email.endsWith(`@${GUEST_EMAIL_DOMAIN}`)) return { ok: false, error: "Use your own email address." };
  if (await prisma.user.findUnique({ where: { email }, select: { id: true } })) return { ok: false, error: TAKEN };

  try {
    await createAthlete({ name, email, prefs, passwordHash: await hashPassword(password) });
    return { ok: true };
  } catch (err) {
    if (isUniqueViolation(err)) return { ok: false, error: TAKEN };
    console.error("[create account]", err);
    return { ok: false, error: "Couldn't create your account. Please try again." };
  }
}

const SaveGuest = z.object({ email: Email, password: Password });

/**
 * Give a guest account an email and password. Everything already logged
 * stays: it's the same account, now one you can sign back into.
 */
export async function saveGuestAccount(raw: { email: string; password: string }): Promise<AccountResult> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId || session.user.role !== "CLIENT") return { ok: false, error: "Sign in first." };

  const parsed = SaveGuest.safeParse(raw);
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };
  if (!perIp(clientIp())) return { ok: false, error: "Too many attempts from this connection. Try again in a while." };

  const { email, password } = parsed.data;
  if (email.endsWith(`@${GUEST_EMAIL_DOMAIN}`)) return { ok: false, error: "Use your own email address." };

  const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true } });
  if (!user?.email.endsWith(`@${GUEST_EMAIL_DOMAIN}`)) return { ok: false, error: "This account is already saved." };
  if (await prisma.user.findUnique({ where: { email }, select: { id: true } })) return { ok: false, error: TAKEN };

  try {
    await prisma.user.update({ where: { id: userId }, data: { email, passwordHash: await hashPassword(password), emailVerified: null } });
    return { ok: true };
  } catch (err) {
    if (isUniqueViolation(err)) return { ok: false, error: TAKEN };
    console.error("[save guest account]", err);
    return { ok: false, error: "Couldn't save your account. Please try again." };
  }
}
