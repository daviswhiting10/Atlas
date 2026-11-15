import NextAuth from "next-auth"
import Email from "next-auth/providers/email"
import Credentials from "next-auth/providers/credentials"
import Google from "next-auth/providers/google"
import { PrismaAdapter } from "@auth/prisma-adapter"
import { prisma } from "@/lib/db/client"
import authConfig from "./auth.config"
import { GUEST_EMAIL_DOMAIN, createGuest, createOAuthAthlete } from "@/lib/guest"
import { Email as EmailAddress, hashPassword, needsRehash, verifyAgainstDecoy, verifyPassword } from "@/lib/password"
import { POLICIES, clear, ipFrom, record, throttleKey, waitFor } from "@/lib/auth/throttle"
import { RECHECK_MS, passwordStep, passwordStepEnabled, sessionCurrent } from "@/lib/auth/session-policy"
import { proofOk } from "@/lib/auth/proof"

const baseAdapter = PrismaAdapter(prisma)

// Override createVerificationToken to clear stale tokens for the same email
// before inserting a new one. This ensures only the latest magic link is valid,
// preventing "link already used" errors from old emails in the inbox.
/** Google sign-in is on once its credentials are configured (AUTH_GOOGLE_ID / AUTH_GOOGLE_SECRET). */
export const GOOGLE_ENABLED = Boolean(process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET)

const adapter = {
  ...baseAdapter,
  /**
   * Only a first-time Google sign-in creates a user here: email links are
   * refused for unknown addresses, and passwords, guests and the demo make
   * their own accounts. A new Google user is an athlete in their own
   * workspace, never a coach. (A brand-new, empty database still lets its
   * first person in as the coach who sets it up.)
   */
  async createUser(user: { email: string; name?: string | null; image?: string | null; emailVerified: Date | null }) {
    if ((await prisma.user.count()) === 0) return baseAdapter.createUser!(user as never)
    return createOAuthAthlete(user)
  },
  async createVerificationToken(verificationToken: { identifier: string; token: string; expires: Date }) {
    await prisma.verificationToken.deleteMany({
      where: { identifier: verificationToken.identifier },
    })
    return baseAdapter.createVerificationToken!(verificationToken)
  },
}

export const { handlers, signIn, signOut, auth, unstable_update } = NextAuth({
  adapter,
  // Session lifetime (180 days, renewed by use) comes from authConfig.
  ...authConfig,
  providers: [
    // Google: an existing account with the same (Google-verified) email is
    // linked rather than duplicated, so a coach or invited client signs
    // straight into their own account.
    ...(GOOGLE_ENABLED ? [Google({ allowDangerousEmailAccountLinking: true })] : []),
    // Guest sign-in: always creates a brand-new account, never signs into an
    // existing one — so there is no credential to guess and nothing to hijack.
    // Email + password. Wrong address and wrong password look the same from
    // outside: same answer, same time taken.
    Credentials({
      id: "password",
      name: "Email and password",
      credentials: { email: {}, password: {} },
      async authorize(credentials, request) {
        const parsed = EmailAddress.safeParse(credentials?.email)
        const password = typeof credentials?.password === "string" ? credentials.password.slice(0, 200) : ""
        if (!parsed.success || !password) return null
        const email = parsed.data
        const ip = ipFrom(request.headers)
        // Limits are shared by every server instance (lib/auth/throttle.ts). A blocked attempt
        // looks exactly like a wrong password: same answer, and the hash is still computed.
        const keys = { emailIp: throttleKey("signinEmailIp", email, ip), email: throttleKey("signinEmail", email), ip: throttleKey("signinIp", ip) }
        const waits = await Promise.all([waitFor(keys.emailIp), waitFor(keys.email), waitFor(keys.ip)])
        await record(keys.ip, POLICIES.signinIp)
        if (waits.some((w) => w > 0)) {
          await verifyAgainstDecoy(password)
          return null
        }

        const user = await prisma.user.findUnique({
          where: { email },
          select: { id: true, name: true, email: true, role: true, workspaceId: true, passwordHash: true },
        })
        const ok = user?.passwordHash ? await verifyPassword(password, user.passwordHash) : (await verifyAgainstDecoy(password), false)
        if (!user || !ok) {
          await Promise.all([record(keys.emailIp, POLICIES.signinEmailIp), record(keys.email, POLICIES.signinEmail)])
          return null
        }
        await clear(keys.emailIp)
        // Hashes made with older, weaker settings are upgraded now that we have the password.
        if (needsRehash(user.passwordHash)) {
          await prisma.user.update({ where: { id: user.id }, data: { passwordHash: await hashPassword(password) } }).catch((err) => console.error("[rehash]", err))
        }
        return { id: user.id, name: user.name, email: user.email, role: user.role, workspaceId: user.workspaceId }
      },
    }),
    Credentials({
      id: "guest",
      name: "Guest",
      credentials: { payload: {} },
      async authorize(credentials, request) {
        try {
          const raw = typeof credentials?.payload === "string" ? credentials.payload.slice(0, 2000) : "{}"
          const input = JSON.parse(raw) as { name?: string; prefs?: unknown; demo?: boolean }
          const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || null
          return await createGuest({ name: input.name, prefs: input.prefs, demo: input.demo === true, ip })
        } catch (err) {
          console.error("[guest sign-in]", err)
          return null
        }
      },
    }),
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
            subject: `Sign in to Atlas — ${new Date().toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}`,
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
    // Email sign-in is for people who already have an account: the coach, and
    // clients the coach has invited. Without this, any address that completed
    // a magic link would become a new user with the default (coach) role.
    async signIn({ user, account }) {
      if (account?.provider !== "email") return true
      if (!user.email) return false
      const existing = await prisma.user.findUnique({ where: { email: user.email }, select: { id: true } })
      if (existing) return true
      // Brand-new database: let the first person in so they can bootstrap it.
      return (await prisma.user.count()) === 0
    },
    async jwt({ token, user, trigger, session }) {
      // On sign-in user is populated; on subsequent requests only token exists.
      // In both cases, if workspaceId is missing, fetch it from the DB.
      // token.sub is Auth.js default user ID field; token.id is our custom field
      const userId = user?.id ?? (token.id as string | undefined) ?? token.sub
      if (userId && !token.workspaceId) {
        const dbUser = await prisma.user.findUnique({
          where: { id: userId },
          select: { id: true, role: true, workspaceId: true, name: true, email: true },
        })
        if (dbUser) {
          // First ever sign-in on a fresh DB — bootstrap the workspace. A user
          // is never attached to a workspace that already exists.
          let workspaceId = dbUser.workspaceId
          if (!workspaceId && (await prisma.workspace.count()) === 0) {
            const created = await prisma.workspace.create({
              data: { name: dbUser.name ?? dbUser.email ?? "My Workspace" },
              select: { id: true },
            })
            await prisma.user.update({ where: { id: dbUser.id }, data: { workspaceId: created.id } })
            workspaceId = created.id
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

      // Password state, checked at sign-in and then at most every 10 minutes (not on every request):
      // - a session from before the password last changed is signed out (null clears the cookie);
      // - whether this account still has to set a password (the set-password step).
      const now = Date.now()
      const signingIn = Boolean(user)
      const lastCheck = typeof token.chk === "number" ? token.chk : 0
      if (userId && (signingIn || trigger === "update" || now - lastCheck > RECHECK_MS)) {
        const u = await prisma.user.findUnique({
          where: { id: userId },
          select: { email: true, passwordHash: true, createdAt: true, passwordChangedAt: true, passwordPromptAfter: true, accounts: { where: { provider: "google" }, select: { id: true }, take: 1 } },
        })
        if (!u) return null
        const stamp = u.passwordChangedAt?.getTime() ?? 0
        const proof = (session as { pwProof?: unknown } | undefined)?.pwProof
        if (signingIn || (trigger === "update" && proofOk(userId, stamp, proof))) token.pwc = stamp
        else if (!sessionCurrent(typeof token.pwc === "number" ? token.pwc : undefined, u.passwordChangedAt)) return null
        const step = passwordStep(
          { email: u.email, hasPassword: u.passwordHash != null, createdAt: u.createdAt, passwordPromptAfter: u.passwordPromptAfter, googleLinked: u.accounts.length > 0 },
          new Date(now),
          passwordStepEnabled(),
          GUEST_EMAIL_DOMAIN
        )
        token.np = step.needs
        token.snz = step.canSnooze
        token.chk = now
      }
      return token
    },
  },
})
