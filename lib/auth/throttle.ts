/**
 * Sign-in and email-request limits, counted in the database so every server
 * instance shares them (the in-memory limiter only ever saw one instance).
 *
 * Two kinds of limit:
 * - "failures" (wrong passwords): a few are free, then each one makes the
 *   next attempt wait, doubling up to a cap. Never a permanent lock: the
 *   email link and password reset always work, so nobody can lock a person
 *   out on purpose.
 * - "requests" (reset or sign-in emails): at most N in a window; past that,
 *   blocked until the window ends.
 *
 * Keys are keyed hashes (AUTH_SECRET), so no raw email or IP is stored.
 */

import { createHash } from "crypto";
import { prisma } from "@/lib/db/client";

export type Policy =
  | { kind: "failures"; free: number; baseMs: number; maxMs: number; windowMs: number }
  | { kind: "requests"; max: number; windowMs: number };

const MIN = 60_000;
export const POLICIES = {
  /** Wrong passwords for one address from one connection: 5 free, then 30 s doubling to 15 min. */
  signinEmailIp: { kind: "failures", free: 5, baseMs: 30_000, maxMs: 15 * MIN, windowMs: 60 * MIN },
  /** Wrong passwords for one address from anywhere: past 20 an hour, one a minute. */
  signinEmail: { kind: "failures", free: 20, baseMs: MIN, maxMs: MIN, windowMs: 60 * MIN },
  /** Sign-in attempts from one connection: 50 per 15 minutes. */
  signinIp: { kind: "requests", max: 50, windowMs: 15 * MIN },
  /** Password-reset emails: 3 an hour per address, 10 per connection. */
  resetEmail: { kind: "requests", max: 3, windowMs: 60 * MIN },
  resetIp: { kind: "requests", max: 10, windowMs: 60 * MIN },
  /** Wrong "current password" when changing it: 5 free, then 1 min doubling to 15. */
  changeUser: { kind: "failures", free: 5, baseMs: MIN, maxMs: 15 * MIN, windowMs: 60 * MIN },
} satisfies Record<string, Policy>;

export type Row = { count: number; windowStart: Date; blockedUntil: Date | null };

/** Is a key blocked right now? Pure. */
export function blockedFor(row: Row | null, now: Date): number {
  if (!row?.blockedUntil) return 0;
  return Math.max(0, row.blockedUntil.getTime() - now.getTime());
}

/**
 * The row after one more event (a failure, or a request). Pure.
 * A window that has run out starts again from zero.
 */
export function afterEvent(row: Row | null, policy: Policy, now: Date): Row {
  const fresh = !row || now.getTime() - row.windowStart.getTime() >= policy.windowMs;
  const count = fresh ? 1 : row.count + 1;
  const windowStart = fresh ? now : row.windowStart;
  let blockedUntil: Date | null = null;
  if (policy.kind === "failures" && count > policy.free) {
    const wait = Math.min(policy.maxMs, policy.baseMs * 2 ** (count - policy.free - 1));
    blockedUntil = new Date(now.getTime() + wait);
  }
  if (policy.kind === "requests" && count >= policy.max) {
    // This request is allowed; the next one waits until the window ends.
    blockedUntil = new Date(windowStart.getTime() + policy.windowMs);
  }
  return { count, windowStart, blockedUntil };
}

/** A storage key for a policy and the things it's about (an email, an IP). */
export function throttleKey(name: keyof typeof POLICIES, ...parts: string[]): string {
  const digest = createHash("sha256")
    .update(`${process.env.AUTH_SECRET ?? ""}|${name}|${parts.join("|")}`)
    .digest("base64url")
    .slice(0, 32);
  return `${name}:${digest}`;
}

/** Milliseconds this key must still wait (0 = go ahead). */
export async function waitFor(key: string, now = new Date()): Promise<number> {
  const row = await prisma.authThrottle.findUnique({ where: { key } });
  return blockedFor(row, now);
}

/** Count one event against a key. */
export async function record(key: string, policy: Policy, now = new Date()): Promise<void> {
  const row = await prisma.authThrottle.findUnique({ where: { key } });
  const next = afterEvent(row, policy, now);
  await prisma.authThrottle.upsert({ where: { key }, create: { key, ...next }, update: next });
  // Housekeeping instead of a job: now and then, drop rows idle for two days.
  if (Math.random() < 0.02) await prisma.authThrottle.deleteMany({ where: { updatedAt: { lt: new Date(now.getTime() - 2 * 24 * 60 * MIN) } } });
}

export async function clear(key: string): Promise<void> {
  await prisma.authThrottle.deleteMany({ where: { key } });
}

/** The caller's IP as Vercel reports it. */
export function ipFrom(headers: Headers): string {
  return headers.get("x-forwarded-for")?.split(",")[0]?.trim() || headers.get("x-real-ip") || "unknown";
}
