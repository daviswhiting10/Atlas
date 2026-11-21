import { scryptSync, randomBytes } from "crypto";
import { describe, expect, it } from "vitest";
import { Email, Password, hashPassword, needsRehash, rateLimiter, verifyAgainstDecoy, verifyPassword } from "./password";

/** A hash in the stored format, made with chosen (weaker) settings, as older accounts have. */
function legacyHash(password: string, N: number, r = 8, p = 1) {
  const salt = randomBytes(16);
  const key = scryptSync(password, salt, 64, { N, r, p, maxmem: 256 * 1024 * 1024 });
  return ["scrypt", N, r, p, salt.toString("base64"), key.toString("base64")].join("$");
}

describe("passwords", () => {
  it("verifies the right password and rejects others", async () => {
    const hash = await hashPassword("correct horse battery");
    expect(hash.startsWith("scrypt$")).toBe(true);
    expect(await verifyPassword("correct horse battery", hash)).toBe(true);
    expect(await verifyPassword("correct horse batter", hash)).toBe(false);
    expect(await verifyPassword("", hash)).toBe(false);
  });

  it("salts every hash", async () => {
    expect(await hashPassword("same password")).not.toBe(await hashPassword("same password"));
  });

  it("never verifies against a missing or malformed hash", async () => {
    expect(await verifyPassword("anything", null)).toBe(false);
    expect(await verifyPassword("anything", "plaintext")).toBe(false);
    expect(await verifyPassword("anything", "bcrypt$x$y")).toBe(false);
  });

  it("normalises emails, and accepts any non-empty password up to the limit", () => {
    expect(Email.parse("  Sam@Example.COM ")).toBe("sam@example.com");
    expect(Email.safeParse("not-an-email").success).toBe(false);
    expect(Password.safeParse("").success).toBe(false);
    expect(Password.safeParse("x").success).toBe(true);
    expect(Password.safeParse("long enough").success).toBe(true);
    expect(Password.safeParse("x".repeat(201)).success).toBe(false);
  });

  it("limits attempts per key within the window", () => {
    const allow = rateLimiter(3, 60_000);
    expect([allow("a"), allow("a"), allow("a"), allow("a")]).toEqual([true, true, true, false]);
    expect(allow("b")).toBe(true);
  });

  it("hashes with today's settings: scrypt N=2^17, r=8, p=1", async () => {
    expect((await hashPassword("correct horse battery")).startsWith("scrypt$131072$8$1$")).toBe(true);
  });

  it("still verifies hashes made with older settings", async () => {
    expect(await verifyPassword("old but valid pw", legacyHash("old but valid pw", 2 ** 14))).toBe(true);
  });

  it("checks against the decoy without throwing (unknown emails take the same time)", async () => {
    await expect(verifyAgainstDecoy("anything")).resolves.toBeUndefined();
  });
});

describe("needsRehash", () => {
  it("upgrades hashes weaker than today's settings", () => {
    expect(needsRehash(legacyHash("x", 2 ** 14))).toBe(true);
    expect(needsRehash("scrypt$131072$4$1$salt$hash")).toBe(true);
    expect(needsRehash("bcrypt$10$whatever")).toBe(true);
  });

  it("leaves current and stronger hashes, and accounts without one", async () => {
    expect(needsRehash(await hashPassword("current settings"))).toBe(false);
    expect(needsRehash("scrypt$262144$8$1$salt$hash")).toBe(false);
    expect(needsRehash(null)).toBe(false);
    expect(needsRehash(undefined)).toBe(false);
  });
});
