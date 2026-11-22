import { beforeEach, describe, expect, it, vi } from "vitest";

// A stand-in database with NO delete or update at all: if lookupInvite ever tried to use a token up, it would throw.
const tokens: Array<{ identifier: string; token: string; expires: Date }> = [];
const users = new Map<string, { email: string; name: string | null; role: string }>();
vi.mock("@/lib/db/client", () => ({
  prisma: {
    verificationToken: {
      findFirst: async ({ where }: { where: { token: string; expires: { gt: Date } } }) => tokens.find((t) => t.token === where.token && t.expires > where.expires.gt) ?? null,
    },
    user: { findUnique: async ({ where }: { where: { email: string } }) => users.get(where.email) ?? null },
  },
}));

import { hashToken } from "./invite-link";
import { lookupInvite } from "./invite-lookup";

const raw = "b".repeat(64);
const now = new Date("2026-11-21T12:00:00Z");

beforeEach(() => {
  tokens.length = 0;
  users.clear();
  users.set("zed@x.com", { email: "zed@x.com", name: "Zed Tester", role: "CLIENT" });
  tokens.push({ identifier: "zed@x.com", token: hashToken(raw), expires: new Date(now.getTime() + 86_400_000) });
});

describe("lookupInvite (what the page does on every open, preview fetch or refresh)", () => {
  it("shows the first name, and can be done any number of times without using the invite up", async () => {
    for (let i = 0; i < 3; i++) expect(await lookupInvite(raw, now)).toEqual({ email: "zed@x.com", firstName: "Zed" });
    expect(tokens).toHaveLength(1);
  });
  it("an expired, replaced or already-used link is just null (the page says so in one line)", async () => {
    expect(await lookupInvite(raw, new Date(now.getTime() + 2 * 86_400_000))).toBeNull();
    expect(await lookupInvite("c".repeat(64), now)).toBeNull();
    tokens.length = 0; // Auth.js deletes a token when it signs someone in
    expect(await lookupInvite(raw, now)).toBeNull();
  });
  it("not a token of ours, or a token for a non-client login: null", async () => {
    expect(await lookupInvite("nonsense", now)).toBeNull();
    expect(await lookupInvite(undefined, now)).toBeNull();
    users.set("zed@x.com", { email: "zed@x.com", name: "Zed", role: "TRAINER" });
    expect(await lookupInvite(raw, now)).toBeNull();
  });
});
