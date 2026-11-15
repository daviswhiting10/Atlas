import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db/client", async () => ({ prisma: (await import("./test-db")).fakePrisma }));

import { addUser, db, resetDb } from "./test-db";
import { RESET_TTL_MS, consumeReset, createReset, hashToken, peekReset, resetUrl } from "./reset";

const t0 = new Date("2026-11-15T10:00:00Z");
const later = (ms: number) => new Date(t0.getTime() + ms);

beforeEach(() => {
  resetDb();
  addUser({ id: "u1", email: "sam@example.com" });
  addUser({ id: "u2", email: "kai@example.com" });
});

describe("reset tokens", () => {
  it("are 32 random bytes, and only their SHA-256 is stored", async () => {
    const token = await createReset("u1", t0);
    expect(Buffer.from(token, "base64url")).toHaveLength(32);
    expect(db.resets).toHaveLength(1);
    expect(db.resets[0].tokenHash).toBe(hashToken(token));
    expect(JSON.stringify(db.resets)).not.toContain(token);
  });

  it("work for 30 minutes", async () => {
    const token = await createReset("u1", t0);
    expect(RESET_TTL_MS).toBe(30 * 60_000);
    expect(await peekReset(token, later(RESET_TTL_MS - 1))).toMatchObject({ userId: "u1" });
    expect(await peekReset(token, later(RESET_TTL_MS))).toBeNull();
  });

  it("opening the page (peeking) doesn't use the link up", async () => {
    const token = await createReset("u1", t0);
    await peekReset(token, t0);
    await peekReset(token, t0);
    expect(await peekReset(token, t0)).not.toBeNull();
  });

  it("are used up once: the second save is refused", async () => {
    const token = await createReset("u1", t0);
    const r = (await peekReset(token, t0))!;
    expect(await consumeReset(r.id, later(1000))).toBe(true);
    expect(await consumeReset(r.id, later(2000))).toBe(false);
    expect(await peekReset(token, later(3000))).toBeNull();
  });

  it("can't be used up after they expire", async () => {
    const token = await createReset("u1", t0);
    const r = (await peekReset(token, t0))!;
    expect(await consumeReset(r.id, later(RESET_TTL_MS))).toBe(false);
  });

  it("asking again cancels the older unused link, not other people's", async () => {
    const first = await createReset("u1", t0);
    const other = await createReset("u2", t0);
    const second = await createReset("u1", later(1000));
    expect(await peekReset(first, later(2000))).toBeNull();
    expect(await peekReset(second, later(2000))).toMatchObject({ userId: "u1" });
    expect(await peekReset(other, later(2000))).toMatchObject({ userId: "u2" });
  });

  it("refuses malformed or unknown tokens without looking them up", async () => {
    expect(await peekReset("", t0)).toBeNull();
    expect(await peekReset("short", t0)).toBeNull();
    expect(await peekReset("has spaces and symbols!!!!!!!!!!!!!", t0)).toBeNull();
    expect(await peekReset("A".repeat(43), t0)).toBeNull();
  });

  it("links go to /reset-password on AUTH_URL", () => {
    const saved = process.env.AUTH_URL;
    process.env.AUTH_URL = "https://atlas.example";
    expect(resetUrl("abc_-1")).toBe("https://atlas.example/reset-password?token=abc_-1");
    process.env.AUTH_URL = saved;
  });
});
