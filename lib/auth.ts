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
      from: "Atlas <noreply@atlasapp.co>",
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
            from: "Atlas <noreply@atlasapp.co>",
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
})
