import { NextResponse } from "next/server";
import { createHash, randomBytes } from "crypto";
import { withWorkspace } from "@/lib/api/middleware";
import { prisma } from "@/lib/db/client";

/** How long an invite link stays valid. It works once. */
const INVITE_DAYS = 7;

// Matches Auth.js v5 internal hashToken: SHA256(token + AUTH_SECRET)
function hashToken(rawToken: string): string {
  return createHash("sha256")
    .update(`${rawToken}${process.env.AUTH_SECRET ?? ""}`)
    .digest("hex");
}

export const POST = withWorkspace<{ id: string }>(
  async (_req, { workspaceId }, { params }) => {
    const { id: clientId } = await params;

    const client = await prisma.clientProfile.findFirst({
      where: { id: clientId, workspaceId, deletedAt: null },
      select: { id: true, fullName: true, email: true, userId: true },
    });
    if (!client) {
      return NextResponse.json({ error: "Client not found" }, { status: 404 });
    }
    if (!client.email) {
      return NextResponse.json({ error: "Client has no email address" }, { status: 400 });
    }

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
        return NextResponse.json({ error: "That email already belongs to another Atlas account. Use a different address for this client." }, { status: 409 });
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
    await prisma.verificationToken.deleteMany({
      where: { identifier: email },
    });

    await prisma.verificationToken.create({
      data: { identifier: email, token: hashedToken, expires },
    });

    const baseUrl = process.env.AUTH_URL ?? process.env.NEXTAUTH_URL ?? "http://localhost:3000";
    const callbackUrl = `${baseUrl}/today`;
    const magicUrl = `${baseUrl}/api/auth/callback/email?token=${rawToken}&email=${encodeURIComponent(email)}&callbackUrl=${encodeURIComponent(callbackUrl)}`;

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
          from: "Atlas <onboarding@resend.dev>",
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

    return NextResponse.json({ ok: true, email, emailed, link: magicUrl, expiresInDays: INVITE_DAYS });
  }
);
