import type { DefaultSession } from "next-auth"

declare module "next-auth" {
  interface Session {
    user: {
      id: string
      role: "TRAINER" | "CLIENT" | "ADMIN"
      workspaceId?: string
      clientProfileId?: string
    } & DefaultSession["user"]
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id?: string
    role?: string
    workspaceId?: string
    clientProfileId?: string
  }
}
