/**
 * A server-made proof that a session may take a new password stamp. Only the
 * server action that just changed the password can produce it: a client
 * calling the session-update endpoint can't forge the HMAC.
 */

import { createHmac, timingSafeEqual } from "crypto";

const sign = (userId: string, stamp: number) => createHmac("sha256", process.env.AUTH_SECRET ?? "").update(`pw-stamp|${userId}|${stamp}`).digest("base64url");

export const stampProof = (userId: string, stamp: number) => sign(userId, stamp);

export function proofOk(userId: string, stamp: number, proof: unknown): boolean {
  if (typeof proof !== "string") return false;
  const a = Buffer.from(sign(userId, stamp));
  const b = Buffer.from(proof);
  return a.length === b.length && timingSafeEqual(a, b);
}
