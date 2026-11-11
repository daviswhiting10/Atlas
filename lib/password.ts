/**
 * Email + password accounts.
 *
 * Passwords are hashed with scrypt (Node's built-in, memory-hard KDF) and a
 * random salt per password. The stored string carries its own parameters,
 * so they can be raised later without breaking existing hashes.
 */

import { randomBytes, scrypt as scryptCb, timingSafeEqual, type ScryptOptions } from "crypto";
import { z } from "zod";
import { PASSWORD_MAX, PASSWORD_MIN } from "./password-rules";

export { PASSWORD_MAX, PASSWORD_MIN };

const scrypt = (password: string, salt: Buffer, keylen: number, opts: ScryptOptions) =>
  new Promise<Buffer>((resolve, reject) => scryptCb(password, salt, keylen, opts, (err, key) => (err ? reject(err) : resolve(key))));

const N = 16384;
const R = 8;
const P = 1;
const KEY_LEN = 64;
const MAX_MEM = 64 * 1024 * 1024;

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scrypt(password, salt, KEY_LEN, { N, r: R, p: P, maxmem: MAX_MEM });
  return ["scrypt", N, R, P, salt.toString("base64"), key.toString("base64")].join("$");
}

export async function verifyPassword(password: string, stored: string | null | undefined): Promise<boolean> {
  if (!stored) return false;
  const [scheme, n, r, p, salt, hash] = stored.split("$");
  if (scheme !== "scrypt" || !salt || !hash) return false;
  const expected = Buffer.from(hash, "base64");
  const key = await scrypt(password, Buffer.from(salt, "base64"), expected.length, { N: Number(n), r: Number(r), p: Number(p), maxmem: MAX_MEM });
  return key.length === expected.length && timingSafeEqual(key, expected);
}

/**
 * A real hash of nothing in particular. Checking a password against it when
 * the email isn't found keeps the response time the same either way, so
 * timing doesn't reveal which addresses have accounts.
 */
let decoy: Promise<string> | null = null;
export async function verifyAgainstDecoy(password: string): Promise<void> {
  decoy ??= hashPassword(randomBytes(16).toString("hex"));
  await verifyPassword(password, await decoy);
}

export const normalizeEmail = (email: string) => email.trim().toLowerCase();

export const Email = z
  .string()
  .trim()
  .max(254)
  .email("That doesn't look like an email address.")
  .transform(normalizeEmail);

export const Password = z
  .string()
  .min(PASSWORD_MIN, `Use at least ${PASSWORD_MIN} characters.`)
  .max(PASSWORD_MAX, "That password is too long.");

/**
 * A sliding-window limit per key, in this server instance's memory. It stops
 * one visitor hammering sign-in or sign-up; a platform-level rate limit is
 * the right long-term home for this.
 */
export function rateLimiter(max: number, windowMs: number) {
  const hits = new Map<string, number[]>();
  return (key: string): boolean => {
    const now = Date.now();
    const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
    if (recent.length >= max) {
      hits.set(key, recent);
      return false;
    }
    recent.push(now);
    hits.set(key, recent);
    if (hits.size > 10_000) hits.clear();
    return true;
  };
}
