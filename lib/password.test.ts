import { describe, expect, it } from "vitest";
import { Email, Password, hashPassword, rateLimiter, verifyPassword } from "./password";

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

  it("normalises emails and enforces the password length", () => {
    expect(Email.parse("  Sam@Example.COM ")).toBe("sam@example.com");
    expect(Email.safeParse("not-an-email").success).toBe(false);
    expect(Password.safeParse("short").success).toBe(false);
    expect(Password.safeParse("long enough").success).toBe(true);
  });

  it("limits attempts per key within the window", () => {
    const allow = rateLimiter(3, 60_000);
    expect([allow("a"), allow("a"), allow("a"), allow("a")]).toEqual([true, true, true, false]);
    expect(allow("b")).toBe(true);
  });
});
