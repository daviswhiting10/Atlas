import NextAuth from "next-auth"
import Email from "next-auth/providers/email"
import { PrismaAdapter } from "@auth/prisma-adapter"
import { prisma } from "@/lib/db/client"
import authConfig from "./auth.config"

export const { handlers, signIn, signOut, auth } = NextAuth({
  adapter: PrismaAdapter(prisma),
  session: { strategy: "jwt" },
  ...authConfig,
  providers: [
    Email({
      server: process.env.EMAIL_SERVER ?? "smtp://localhost:25",
      from: "Atlas <onboarding@resend.dev>",
      async sendVerificationRequest({ identifier, url }) {
        if (!process.env.RESEND_API_KEY) {
          console.log("\n" + "─".repeat(64))
          console.log("ATLAS MAGIC LINK  (set RESEND_API_KEY to send email)")
          console.log(`  Email : ${identifier}`)
          console.log(`  Link  : ${url}`)
          console.log("─".repeat(64) + "\n")
          return
        }
        const res = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            from: "Atlas <onboarding@resend.dev>",
            to: [identifier],
            subject: "Sign in to Atlas",
            html: `<p style="font-family:sans-serif;max-width:480px;margin:40px auto">
              <strong style="font-size:18px">Sign in to Atlas</strong><br/><br/>
              <a href="${url}" style="display:inline-block;padding:12px 24px;background:#000;color:#fff;text-decoration:none;border-radius:6px;font-size:15px">Sign in &rarr;</a>
              <br/><br/>
              <small style="color:#666">This link expires in 24 hours. If you didn't request this, ignore this email.</small>
            </p>`,
          }),
        })
        if (!res.ok) {
          const body = await res.text()
          throw new Error(`Resend error ${res.status}: ${body}`)
        }
      },
    }),
  ],
  callbacks: {
    ...authConfig.callbacks,
    async jwt({ token, user }) {
      // On sign-in user is populated; on subsequent requests only token exists.
      // In both cases, if workspaceId is missing, fetch it from the DB.
      // token.sub is Auth.js default user ID field; token.id is our custom field
      const userId = user?.id ?? (token.id as string | undefined) ?? token.sub
      if (userId && !token.workspaceId) {
        const dbUser = await prisma.user.findUnique({
          where: { id: userId },
          select: { id: true, role: true, workspaceId: true },
        })
        if (dbUser) {
          // If user has no workspace, auto-assign the primary workspace
          let workspaceId = dbUser.workspaceId
          if (!workspaceId) {
            const primary = await prisma.workspace.findFirst({
              select: { id: true },
              orderBy: { createdAt: "asc" },
            })
            if (primary) {
              await prisma.user.update({
                where: { id: dbUser.id },
                data: { workspaceId: primary.id },
              })
              workspaceId = primary.id
            }
          }
          token.id = dbUser.id
          token.role = dbUser.role
          token.workspaceId = workspaceId ?? undefined

          // For CLIENT role: attach clientProfileId
          if (dbUser.role === "CLIENT") {
            const cp = await prisma.clientProfile.findFirst({
              where: { userId: dbUser.id },
              select: { id: true },
            })
            token.clientProfileId = cp?.id ?? undefined
          }
        }
      }
      return token
    },
  },
})
