import type { NextAuthConfig } from "next-auth"

// Edge-safe config — no providers, no Node.js imports.
// Providers live in lib/auth.ts (Node.js only).
export default {
  providers: [],
  pages: {
    signIn: "/login",
    verifyRequest: "/login?verify=1",
  },
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        token.id = user.id
        token.role = (user as { role?: string }).role
        token.workspaceId =
          (user as { workspaceId?: string | null }).workspaceId ?? undefined
      }
      return token
    },
    session({ session, token }) {
      if (token) {
        session.user.id = token.id as string
        session.user.role = (token.role ?? "TRAINER") as
          | "TRAINER"
          | "CLIENT"
          | "ADMIN"
        session.user.workspaceId = token.workspaceId as string | undefined
        session.user.clientProfileId = token.clientProfileId as string | undefined
      }
      return session
    },
    authorized({ auth }) {
      return !!auth
    },
  },
} satisfies NextAuthConfig
