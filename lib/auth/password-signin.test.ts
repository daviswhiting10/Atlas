import { beforeEach, describe, expect, it, vi } from "vitest";

// The session, request headers and database, simulated (as in lib/actions/account.test.ts).
const env = vi.hoisted(() => ({ session: null as null | { user: { id: string; role: string } }, ip: "198.51.100.7" }));
vi.mock("@/lib/db/client", async () => ({ prisma: (await import("@/lib/auth/test-db")).fakePrisma }));
vi.mock("next/headers", () => ({ headers: () => new Headers({ "x-forwarded-for": env.ip }) }));
vi.mock("@/lib/auth", () => ({ auth: async () => env.session, unstable_update: async () => null }));
vi.mock("@/lib/email", () => ({ sendEmail: async () => {} }));
vi.mock("@/lib/guest", () => ({ GUEST_EMAIL_DOMAIN: "guest.atlas.local", createAthlete: async () => ({}) }));

import { addUser, db, resetDb } from "@/lib/auth/test-db";
import { verifyPassword } from "@/lib/password";
import { setAccountPassword } from "@/lib/actions/account";
import { passwordSignIn } from "./password-signin";

const PASSWORD = "lifting at dawn 2026";
const headers = () => new Headers({ "x-forwarded-for": env.ip });

beforeEach(() => {
  resetDb();
  env.session = null;
});

describe("set a password, sign out, sign in with email and password (regression: the invited client who couldn't get back in)", () => {
  it("works end to end, with the email typed in any case or spacing, from any browser", async () => {
    // An invited client, signed in by her link, with no password yet.
    addUser({ id: "u1", email: "will@icloud.com", role: "CLIENT", createdAt: new Date("2026-11-21T04:56:58Z") });
    env.session = { user: { id: "u1", role: "CLIENT" } };

    // 1. She sets a password. The hash is written, and it really is her password.
    expect(await setAccountPassword({ password: PASSWORD })).toEqual({ ok: true });
    const hash = db.users.get("u1")!.passwordHash;
    expect(hash).not.toBeNull();
    expect(await verifyPassword(PASSWORD, hash!)).toBe(true);

    // 2. She signs out (no session: a different browser or a fresh one behaves the same; nothing comes from cookies).
    env.session = null;

    // 3. She signs in with her email and that password.
    expect(await passwordSignIn({ email: "  Will@iCloud.com ", password: PASSWORD }, headers())).toMatchObject({ id: "u1", email: "will@icloud.com", role: "CLIENT" });

    // A wrong password, or an address with a typo, is refused (the same answer either way).
    expect(await passwordSignIn({ email: "will@icloud.com", password: "not her password" }, headers())).toBeNull();
    expect(await passwordSignIn({ email: "will@icloud.con", password: PASSWORD }, headers())).toBeNull();
  }, 20_000);
});
