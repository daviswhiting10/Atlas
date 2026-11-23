/**
 * Invite a client to the app: their login (made if there isn't one), a one-time link valid for 7 days, and the
 * email when email is set up. The one invite flow: the Invite button (POST /api/clients/[id]/invite) and
 * "Assign and invite" both call this.
 */

import { randomBytes } from "crypto";
import { appBase, hashToken, inviteLink } from "@/lib/auth/invite-link";
import { prisma } from "@/lib/db/client";
import { emailFrom } from "@/lib/email-from";

/** How long an invite link stays valid. It works once. */
export const INVITE_DAYS = 7;

export type InviteResult =
  | { ok: true; email: string; emailed: boolean; link: string; expiresInDays: number }
  | { ok: false; status: 400 | 404 | 409; error: string };

export async function inviteClient(clientId: string, workspaceId: string): Promise<InviteResult> {
  const client = await prisma.clientProfile.findFirst({
    where: { id: clientId, workspaceId, deletedAt: null },
    select: { id: true, fullName: true, email: true, userId: true },
  });
  if (!client) return { ok: false, status: 404, error: "Client not found" };
  if (!client.email) return { ok: false, status: 400, error: "Client has no email address" };

  const email = client.email.trim().toLowerCase();

  // The client's login. An address that already belongs to someone else's
  // login (another athlete, a coach, this coach) is never taken over.
  const existing = await prisma.user.findUnique({
    where: { email },
    select: { id: true, role: true, workspaceId: true, clientProfile: { select: { id: true } } },
  });
  let userId: string;
  if (existing) {
    const isThisClient = existing.clientProfile?.id === client.id;
    const unclaimedHere = existing.role === "CLIENT" && existing.workspaceId === workspaceId && !existing.clientProfile;
    if (!isThisClient && !unclaimedHere) {
      return { ok: false, status: 409, error: "That email already belongs to another Atlas account. Use a different address for this client." };
    }
    userId = existing.id;
  } else {
    const created = await prisma.user.create({
      data: { email, name: client.fullName, role: "CLIENT", workspaceId },
      select: { id: true },
    });
    userId = created.id;
  }
  if (client.userId !== userId) {
    await prisma.clientProfile.update({ where: { id: clientId }, data: { userId } });
  }

  // Generate magic link token (same format as Auth.js v5 email provider)
  const rawToken = randomBytes(32).toString("hex");
  const hashedToken = hashToken(rawToken);
  const expires = new Date(Date.now() + INVITE_DAYS * 24 * 60 * 60 * 1000);

  // Delete any existing tokens for this email (clean slate)
  await prisma.verificationToken.deleteMany({ where: { identifier: email } });
  await prisma.verificationToken.create({ data: { identifier: email, token: hashedToken, expires } });

  // The link opens a page with one button; reading it signs nobody in, so a message preview can't use it up.
  const magicUrl = inviteLink(appBase(), rawToken);

  // Email it when email is set up. Either way the coach gets the link to
  // share themselves, and is told whether the email actually went out.
  let emailed = false;
  if (process.env.RESEND_API_KEY) {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: emailFrom(),
        to: [email],
        subject: "You've been invited to Atlas",
        html: `<p style="font-family:sans-serif;max-width:480px;margin:40px auto">
            <strong style="font-size:18px">Your trainer invited you to Atlas</strong><br/><br/>
            Click the link below to access your workouts:<br/><br/>
            <a href="${magicUrl}" style="display:inline-block;padding:12px 24px;background:#000;color:#fff;text-decoration:none;border-radius:6px;font-size:15px">Open Atlas &rarr;</a>
            <br/><br/>
            <small style="color:#666">This link works once and expires in ${INVITE_DAYS} days. Once you're in, set a password from the You tab to sign in any time.</small>
          </p>`,
      }),
    });
    if (res.ok) emailed = true;
    else console.error("[invite] email not sent:", res.status, await res.text());
  } else {
    console.log("\n" + "─".repeat(64));
    console.log("ATLAS CLIENT INVITE LINK (set RESEND_API_KEY to send email)");
    console.log(`  Client : ${client.fullName} <${email}>`);
    console.log(`  Link   : ${magicUrl}`);
    console.log("─".repeat(64) + "\n");
  }

  return { ok: true, email, emailed, link: magicUrl, expiresInDays: INVITE_DAYS };
}

/** "Not invited": the client has an email and no login yet (lib/coach/login-status). Only then does assigning invite. */
export async function notInvited(clientId: string, workspaceId: string): Promise<boolean> {
  const c = await prisma.clientProfile.findFirst({ where: { id: clientId, workspaceId, deletedAt: null }, select: { email: true, userId: true } });
  return !!c && !c.userId && !!c.email?.trim();
}
