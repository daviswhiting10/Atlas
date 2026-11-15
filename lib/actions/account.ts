"use server";

/**
 * Accounts and passwords: creating an account, saving a guest account,
 * setting or changing a password, the set-password step's "Not now", and
 * password resets by email.
 *
 * Creating and saving end with the browser signing in through the "password"
 * provider, which issues the session; those actions only write the account.
 */

import { headers } from "next/headers";
import { z } from "zod";
import { auth, unstable_update } from "@/lib/auth";
import { prisma } from "@/lib/db/client";
import { GUEST_EMAIL_DOMAIN, createAthlete } from "@/lib/guest";
import { Email, Password, hashPassword, passwordProblem, rateLimiter, verifyPassword } from "@/lib/password";
import { POLICIES, clear, ipFrom, record, throttleKey, waitFor } from "@/lib/auth/throttle";
import { SNOOZE_MS, passwordStep } from "@/lib/auth/session-policy";
import { stampProof } from "@/lib/auth/proof";
import { RESET_TTL_MS, consumeReset, createReset, peekReset, resetUrl } from "@/lib/auth/reset";
import { sendEmail } from "@/lib/email";

export type AccountResult = { ok: true } | { ok: false; error: string };

const TAKEN = "An account already uses that email. Sign in instead.";
const perIp = rateLimiter(10, 60 * 60_000);
const isGuestEmail = (email: string) => email.endsWith(`@${GUEST_EMAIL_DOMAIN}`);

function clientIp(): string {
  return ipFrom(headers());
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
  const { name, email, password, prefs } = parsed.data;
  const problem = passwordProblem(password, email);
  if (problem) return { ok: false, error: problem };
  if (!perIp(clientIp())) return { ok: false, error: "Too many sign-ups from this connection. Try again in a while." };

  if (isGuestEmail(email)) return { ok: false, error: "Use your own email address." };
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
  const { email, password } = parsed.data;
  const problem = passwordProblem(password, email);
  if (problem) return { ok: false, error: problem };
  if (!perIp(clientIp())) return { ok: false, error: "Too many attempts from this connection. Try again in a while." };

  if (isGuestEmail(email)) return { ok: false, error: "Use your own email address." };

  const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true } });
  if (!user || !isGuestEmail(user.email)) return { ok: false, error: "This account is already saved." };
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

const SetPassword = z.object({ password: Password, current: z.string().max(200).optional() });

const minutes = (ms: number) => Math.max(1, Math.ceil(ms / 60_000));

/**
 * Save a new password and its stamp. Sessions issued before the stamp are
 * signed out at their next check; the caller's own session is renewed by
 * `keepThisSession`.
 */
async function writePassword(userId: string, passwordHash: string, db: Pick<typeof prisma, "user"> = prisma): Promise<Date> {
  const changedAt = new Date();
  await db.user.update({
    where: { id: userId },
    data: { passwordHash, passwordChangedAt: changedAt, passwordPromptAfter: null },
  });
  return changedAt;
}

/** Renew this browser's session under the new stamp (only a server action can make the proof). */
async function keepThisSession(userId: string, changedAt: Date): Promise<void> {
  try {
    await unstable_update({ pwProof: stampProof(userId, changedAt.getTime()) } as never);
  } catch (err) {
    // The password is saved either way; at worst this browser signs in again.
    console.error("[keep session]", err);
  }
}

/**
 * Set a password on a signed-in account (an invited client who came in by
 * link, a Google account, or a coach), so they can sign in without an email.
 * Changing an existing one needs the current password, and signs out every
 * other device. A first password leaves them signed in.
 */
export async function setAccountPassword(raw: { password: string; current?: string }): Promise<AccountResult> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { ok: false, error: "Sign in first." };

  const parsed = SetPassword.safeParse(raw);
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };
  if (!perIp(clientIp())) return { ok: false, error: "Too many attempts from this connection. Try again in a while." };

  const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true, passwordHash: true } });
  if (!user) return { ok: false, error: "Sign in first." };
  if (isGuestEmail(user.email)) return { ok: false, error: "Save your account with an email first." };

  if (user.passwordHash) {
    const key = throttleKey("changeUser", userId);
    const wait = await waitFor(key);
    if (wait > 0) return { ok: false, error: `Too many wrong tries. Try again in ${minutes(wait)} min.` };
    if (!(await verifyPassword(parsed.data.current ?? "", user.passwordHash))) {
      await record(key, POLICIES.changeUser);
      return { ok: false, error: "Your current password isn't right." };
    }
    await clear(key);
  }

  const problem = passwordProblem(parsed.data.password, user.email);
  if (problem) return { ok: false, error: problem };

  const passwordHash = await hashPassword(parsed.data.password);
  if (user.passwordHash) {
    // A change: every other device is signed out, this one keeps going.
    await keepThisSession(userId, await writePassword(userId, passwordHash));
  } else {
    // A first password: there was no old one that could have leaked, so other devices stay signed in.
    await prisma.user.update({ where: { id: userId }, data: { passwordHash, passwordPromptAfter: null } });
    try {
      await unstable_update({} as never); // re-reads the account, so the set-password step lets go now
    } catch (err) {
      console.error("[first password]", err);
    }
  }
  return { ok: true };
}

/**
 * "Not now" on the set-password step: asks again in 7 days. Only accounts
 * from before the step shipped may wait; newer ones must set a password.
 */
export async function snoozePasswordStep(): Promise<AccountResult> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { ok: false, error: "Sign in first." };

  const u = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true, passwordHash: true, createdAt: true, accounts: { where: { provider: "google" }, select: { id: true }, take: 1 } },
  });
  if (!u) return { ok: false, error: "Sign in first." };
  const now = new Date();
  // Asked as if the step were on and no snooze were running: may this account wait at all?
  const step = passwordStep(
    { email: u.email, hasPassword: u.passwordHash != null, createdAt: u.createdAt, passwordPromptAfter: null, googleLinked: u.accounts.length > 0 },
    now,
    true,
    GUEST_EMAIL_DOMAIN
  );
  if (step.needs && !step.canSnooze) return { ok: false, error: "Set a password to go on." };

  await prisma.user.update({ where: { id: userId }, data: { passwordPromptAfter: new Date(now.getTime() + SNOOZE_MS) } });
  try {
    await unstable_update({} as never); // re-reads the account, so the step lets go now
  } catch (err) {
    console.error("[snooze]", err);
  }
  return { ok: true };
}

/** How long a reset request always takes, so the time doesn't tell whether an account exists. */
const RESET_REQUEST_MS = 1500;
const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Email a reset link. The answer is the same whatever the address: an
 * account or not, a guest, or over the limit. Nothing is sent to unknown or
 * guest addresses.
 */
export async function requestPasswordReset(raw: { email: string }): Promise<AccountResult> {
  const parsed = Email.safeParse(raw?.email);
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };
  const email = parsed.data;
  const started = Date.now();

  try {
    const ip = clientIp();
    const keys = { email: throttleKey("resetEmail", email), ip: throttleKey("resetIp", ip) };
    const waits = await Promise.all([waitFor(keys.email), waitFor(keys.ip)]);
    await Promise.all([record(keys.email, POLICIES.resetEmail), record(keys.ip, POLICIES.resetIp)]);

    if (waits.every((w) => w === 0) && !isGuestEmail(email)) {
      const user = await prisma.user.findUnique({ where: { email }, select: { id: true } });
      if (user) {
        const url = resetUrl(await createReset(user.id));
        await sendEmail({
          to: email,
          subject: "Reset your Atlas password",
          html: `<p style="font-family:sans-serif;max-width:480px;margin:40px auto">
            <strong style="font-size:18px">Reset your Atlas password</strong><br/><br/>
            <a href="${url}" style="display:inline-block;padding:12px 24px;background:#000;color:#fff;text-decoration:none;border-radius:6px;font-size:15px">Choose a new password &rarr;</a>
            <br/><br/>
            <small style="color:#666">This link works for ${RESET_TTL_MS / 60_000} minutes, once. If you didn't ask for it, ignore this email: your password hasn't changed.</small>
          </p>`,
          devNote: `Link    : ${url}`,
        });
      }
    }
  } catch (err) {
    // Logged, never shown: the answer must not depend on what happened.
    console.error("[password reset request]", err);
  }

  await pause(Math.max(0, RESET_REQUEST_MS - (Date.now() - started)));
  return { ok: true };
}

const LINK_GONE = "This link has expired or has already been used. Ask for a new one.";

export type ResetResult = { ok: true; email: string } | { ok: false; error: string; expired?: boolean };

/**
 * Save a new password from a reset link. The rules are checked before the
 * link is used up, so a refused password doesn't cost the link. Every
 * signed-in device is signed out, and the address's sign-in limits are
 * cleared. Returns the email so the browser can sign straight in.
 */
export async function resetPassword(raw: { token: string; password: string }): Promise<ResetResult> {
  const token = typeof raw?.token === "string" ? raw.token : "";
  const password = typeof raw?.password === "string" ? raw.password : "";

  const reset = await peekReset(token);
  if (!reset) return { ok: false, error: LINK_GONE, expired: true };
  const user = await prisma.user.findUnique({ where: { id: reset.userId }, select: { id: true, email: true } });
  if (!user || isGuestEmail(user.email)) return { ok: false, error: LINK_GONE, expired: true };

  const problem = passwordProblem(password, user.email);
  if (problem) return { ok: false, error: problem };

  const passwordHash = await hashPassword(password);
  const used = await prisma.$transaction(async (tx) => {
    if (!(await consumeReset(reset.id, new Date(), tx))) return false;
    await writePassword(user.id, passwordHash, tx);
    return true;
  });
  if (!used) return { ok: false, error: LINK_GONE, expired: true };

  await Promise.all([
    clear(throttleKey("signinEmail", user.email)),
    clear(throttleKey("signinEmailIp", user.email, clientIp())),
    clear(throttleKey("changeUser", user.id)),
  ]).catch((err) => console.error("[reset: clear limits]", err));
  return { ok: true, email: user.email };
}
