import { beforeEach, describe, expect, it, vi } from "vitest";

// The same fake database as the other throttle tests: rows live in it, as they do in AuthThrottle.
vi.mock("@/lib/db/client", async () => ({ prisma: (await import("./test-db")).fakePrisma }));

import { db, resetDb } from "./test-db";
import { LINK_LIMIT_URL, allowLinkRequest } from "./link-limit";
import { POLICIES, throttleKey } from "./throttle";

beforeEach(() => resetDb());

describe("allowLinkRequest", () => {
  it("lets an address ask 5 times, then refuses the 6th", async () => {
    for (let i = 1; i <= 5; i++) expect(await allowLinkRequest("sam@example.com", `203.0.113.${i}`)).toBe(true);
    expect(await allowLinkRequest("sam@example.com", "203.0.113.50")).toBe(false);
    expect(await allowLinkRequest("sam@example.com", "203.0.113.51")).toBe(false);
  });

  it("counts each address on its own", async () => {
    for (let i = 0; i < 6; i++) await allowLinkRequest("sam@example.com", `198.51.100.${i}`);
    expect(await allowLinkRequest("sam@example.com", "198.51.100.99")).toBe(false);
    expect(await allowLinkRequest("alex@example.com", "198.51.100.98")).toBe(true);
  });

  it("caps one connection across many addresses at 20 an hour", async () => {
    for (let i = 1; i <= 20; i++) expect(await allowLinkRequest(`user${i}@example.com`, "192.0.2.7")).toBe(true);
    expect(await allowLinkRequest("user21@example.com", "192.0.2.7")).toBe(false);
    // Another connection is unaffected.
    expect(await allowLinkRequest("user22@example.com", "192.0.2.8")).toBe(true);
  });

  it("an address nobody has counts like any other (the answer never says who has an account)", async () => {
    for (let i = 1; i <= 5; i++) expect(await allowLinkRequest("nobody@example.com", `203.0.113.${100 + i}`)).toBe(true);
    expect(await allowLinkRequest("nobody@example.com", "203.0.113.200")).toBe(false);
  });

  it("is shared through the database, not kept in memory: a fresh start still sees the count", async () => {
    for (let i = 0; i < 5; i++) await allowLinkRequest("sam@example.com", "203.0.113.9");
    const rows = Array.from(db.throttle.values());
    expect(rows.length).toBeGreaterThan(0);
    // The count lives in the stored row; a new server instance reads the same row.
    const key = throttleKey("linkEmail", "sam@example.com");
    expect(db.throttle.get(key)?.count).toBe(5);
    expect(await allowLinkRequest("sam@example.com", "203.0.113.10")).toBe(false);
  });

  it("stores only keyed hashes, never the address or the connection", async () => {
    await allowLinkRequest("sam@example.com", "203.0.113.9");
    for (const key of Array.from(db.throttle.keys())) {
      expect(key).not.toContain("sam@example.com");
      expect(key).not.toContain("203.0.113.9");
    }
  });

  it("the limits are the ones promised: 5 per address, 20 per connection, an hour", () => {
    expect(POLICIES.linkEmail).toEqual({ kind: "requests", max: 5, windowMs: 60 * 60_000 });
    expect(POLICIES.linkIp).toEqual({ kind: "requests", max: 20, windowMs: 60 * 60_000 });
  });

  it("a refusal sends the login page to its friendly message", () => {
    expect(LINK_LIMIT_URL).toBe("/login?error=LinkLimit");
  });
});
