import { NextResponse } from "next/server";
import { createHash, randomBytes } from "crypto";
import { withWorkspace } from "@/lib/api/middleware";
import { prisma } from "@/lib/db/client";

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

    // Upsert User with CLIENT role
    const user = await prisma.user.upsert({
      where: { email: client.email },
      update: { role: "CLIENT", workspaceId },
      create: {
        email: client.email,
        name: client.fullName,
        role: "CLIENT",
        workspaceId,
      },
    });

    // Link user → clientProfile if not already linked
    if (!client.userId) {
      await prisma.clientProfile.update({
        where: { id: clientId },
        data: { userId: user.id },
      });
    }

    // Generate magic link token (same format as Auth.js v5 email provider)
    const rawToken = randomBytes(32).toString("hex");
    const hashedToken = hashToken(rawToken);
    const expires = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24h

    // Delete any existing tokens for this email (clean slate)
    await prisma.verificationToken.deleteMany({
      where: { identifier: client.email },
    });

    await prisma.verificationToken.create({
      data: { identifier: client.email, token: hashedToken, expires },
    });

    const baseUrl = process.env.AUTH_URL ?? process.env.NEXTAUTH_URL ?? "http://localhost:3000";
    const callbackUrl = `${baseUrl}/today`;
    const magicUrl = `${baseUrl}/api/auth/callback/email?token=${rawToken}&email=${encodeURIComponent(client.email)}&callbackUrl=${encodeURIComponent(callbackUrl)}`;

    // Send via Resend, or log to console if no API key
    if (process.env.RESEND_API_KEY) {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: "Atlas <onboarding@resend.dev>",
          to: [client.email],
          subject: "You've been invited to Atlas",
          html: `<p style="font-family:sans-serif;max-width:480px;margin:40px auto">
            <strong style="font-size:18px">Your trainer invited you to Atlas</strong><br/><br/>
            Click the link below to access your workouts:<br/><br/>
            <a href="${magicUrl}" style="display:inline-block;padding:12px 24px;background:#000;color:#fff;text-decoration:none;border-radius:6px;font-size:15px">Open Atlas &rarr;</a>
            <br/><br/>
            <small style="color:#666">This link expires in 24 hours.</small>
          </p>`,
        }),
      });
      if (!res.ok) {
        console.error("Resend error:", await res.text());
      }
    } else {
      console.log("\n" + "─".repeat(64));
      console.log("ATLAS CLIENT INVITE LINK (set RESEND_API_KEY to send email)");
      console.log(`  Client : ${client.fullName} <${client.email}>`);
      console.log(`  Link   : ${magicUrl}`);
      console.log("─".repeat(64) + "\n");
    }

    return NextResponse.json({ ok: true, email: client.email });
  }
);
