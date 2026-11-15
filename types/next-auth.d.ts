import type { DefaultSession } from "next-auth"

declare module "next-auth" {
  interface Session {
    user: {
      id: string
      role: "TRAINER" | "CLIENT" | "ADMIN"
      workspaceId?: string
      clientProfileId?: string
      /** Has to set a password before going on (the set-password step). */
      needsPassword?: boolean
      /** May say "Not now" to that step (accounts from before it shipped). */
      canSnoozePassword?: boolean
    } & DefaultSession["user"]
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id?: string
    role?: string
    workspaceId?: string
    clientProfileId?: string
    /** Password-change stamp (ms) this session was issued under. */
    pwc?: number
    /** Last database re-check (ms). */
    chk?: number
    /** Needs to set a password. */
    np?: boolean
    /** May snooze the set-password step. */
    snz?: boolean
  }
}
