import { beforeEach, describe, expect, it, vi } from "vitest";

// The session, request headers, email and database, simulated.
const env = vi.hoisted(() => ({
  session: null as null | { user: { id: string; role: string } },
  ip: "203.0.113.9",
  sent: [] as Array<{ to: string; devNote: string }>,
  updates: [] as unknown[],
}));

vi.mock("@/lib/db/client", async () => ({ prisma: (await import("@/lib/auth/test-db")).fakePrisma }));
vi.mock("next/headers", () => ({ headers: () => new Headers({ "x-forwarded-for": env.ip }) }));
vi.mock("@/lib/auth", () => ({
  auth: async () => env.session,
  unstable_update: async (data: unknown) => {
    env.updates.push(data);
    return null;
  },
}));
vi.mock("@/lib/email", () => ({
  sendEmail: async (msg: { to: string; devNote: string }) => {
    env.sent.push(msg);
  },
}));
vi.mock("@/lib/guest", () => ({ GUEST_EMAIL_DOMAIN: "guest.atlas.local", createAthlete: async () => ({}) }));

import { addUser, db, resetDb } from "@/lib/auth/test-db";
import { hashPassword, verifyPassword } from "@/lib/password";
import { stampProof } from "@/lib/auth/proof";
import { SNOOZE_MS } from "@/lib/auth/session-policy";
import { throttleKey } from "@/lib/auth/throttle";
import { hashToken } from "@/lib/auth/reset";
import { requestPasswordReset, resetPassword, setAccountPassword, snoozePasswordStep } from "./account";

const GOOD = "blue kettle on the stove";
let oldHash = "";
let testNo = 0;

beforeEach(async () => {
  resetDb();
  env.session = null;
  env.ip = `203.0.113.${++testNo}`; // each test from its own connection (the sign-up limiter is in memory)
  env.sent.length = 0;
  env.updates.length = 0;
  oldHash ||= await hashPassword("the old one, long enough");
});

const tokenFrom = (devNote: string) => new URL(devNote.replace(/^Link\s*:\s*/, "")).searchParams.get("token")!;

describe("requestPasswordReset", () => {
  it("sends a link to an existing account", async () => {
    addUser({ id: "u1", email: "sam@example.com", passwordHash: oldHash });
    expect(await requestPasswordReset({ email: " Sam@Example.com " })).toEqual({ ok: true });
    expect(env.sent).toHaveLength(1);
    expect(env.sent[0].to).toBe("sam@example.com");
    expect(db.resets).toHaveLength(1);
    expect(db.resets[0].tokenHash).toBe(hashToken(tokenFrom(env.sent[0].devNote)));
  });

  it("gives the same answer, and sends nothing, for unknown and guest addresses", async () => {
    addUser({ id: "g1", email: "g-1@guest.atlas.local" });
    expect(await requestPasswordReset({ email: "nobody@example.com" })).toEqual({ ok: true });
    expect(await requestPasswordReset({ email: "g-1@guest.atlas.local" })).toEqual({ ok: true });
    expect(env.sent).toHaveLength(0);
    expect(db.resets).toHaveLength(0);
  });

  it("also sends to link-only and Google accounts (they're offered a password)", async () => {
    addUser({ id: "u1", email: "link@example.com" });
    addUser({ id: "u2", email: "goog@example.com", google: true });
    await requestPasswordReset({ email: "link@example.com" });
    await requestPasswordReset({ email: "goog@example.com" });
    expect(env.sent.map((m) => m.to)).toEqual(["link@example.com", "goog@example.com"]);
  });

  it("takes the same time whether or not the account exists", async () => {
    addUser({ id: "u1", email: "sam@example.com" });
    const time = async (email: string) => {
      const t = Date.now();
      await requestPasswordReset({ email });
      return Date.now() - t;
    };
    const [known, unknown] = [await time("sam@example.com"), await time("nobody@example.com")];
    expect(known).toBeGreaterThanOrEqual(1490);
    expect(unknown).toBeGreaterThanOrEqual(1490);
    expect(Math.abs(known - unknown)).toBeLessThan(150);
  }, 10_000);

  it("stops after 3 an hour for one address, with the same answer", async () => {
    addUser({ id: "u1", email: "sam@example.com" });
    for (let i = 0; i < 4; i++) expect(await requestPasswordReset({ email: "sam@example.com" })).toEqual({ ok: true });
    expect(env.sent).toHaveLength(3);
  }, 15_000);

  it("says so when the address isn't an address", async () => {
    expect(await requestPasswordReset({ email: "nope" })).toEqual({ ok: false, error: "That doesn't look like an email address." });
  });
});

describe("resetPassword", () => {
  async function linkFor(email: string) {
    await requestPasswordReset({ email });
    return tokenFrom(env.sent.at(-1)!.devNote);
  }

  it("saves the new password, stamps it, and returns the email to sign in with", async () => {
    addUser({ id: "u1", email: "sam@example.com", passwordHash: oldHash, passwordPromptAfter: new Date("2030-01-01") });
    const token = await linkFor("sam@example.com");
    const res = await resetPassword({ token, password: GOOD });
    expect(res).toEqual({ ok: true, email: "sam@example.com" });
    const u = db.users.get("u1")!;
    expect(await verifyPassword(GOOD, u.passwordHash)).toBe(true);
    expect(u.passwordChangedAt).toBeInstanceOf(Date); // every older session is signed out
    expect(u.passwordPromptAfter).toBeNull();
  }, 10_000);

  it("warns about a weak password without using up the link; the person can use it anyway", async () => {
    addUser({ id: "u1", email: "sam@example.com", passwordHash: oldHash });
    const token = await linkFor("sam@example.com");
    expect(await resetPassword({ token, password: "password123" })).toMatchObject({ ok: false, weak: true, error: expect.stringMatching(/common/) });
    expect(await resetPassword({ token, password: "short" })).toMatchObject({ ok: false, weak: true, error: expect.stringMatching(/short/) });
    expect(await resetPassword({ token, password: "" })).toMatchObject({ ok: false, error: expect.stringMatching(/Choose a password/) });
    expect(db.users.get("u1")!.passwordHash).toBe(oldHash);
    // "Use it anyway": the very same weak password is accepted, and the link is used up only now.
    expect(await resetPassword({ token, password: "short", allowWeak: true })).toMatchObject({ ok: true });
    expect(db.users.get("u1")!.passwordHash).not.toBe(oldHash);
  }, 10_000);

  it("refuses the same link a second time", async () => {
    addUser({ id: "u1", email: "sam@example.com" });
    const token = await linkFor("sam@example.com");
    expect(await resetPassword({ token, password: GOOD })).toMatchObject({ ok: true });
    const again = await resetPassword({ token, password: "another long passphrase" });
    expect(again).toMatchObject({ ok: false, expired: true });
    expect(await verifyPassword(GOOD, db.users.get("u1")!.passwordHash)).toBe(true);
  }, 10_000);

  it("refuses an older link once a newer one was asked for", async () => {
    addUser({ id: "u1", email: "sam@example.com" });
    const first = await linkFor("sam@example.com");
    const second = await linkFor("sam@example.com");
    expect(await resetPassword({ token: first, password: GOOD })).toMatchObject({ ok: false, expired: true });
    expect(await resetPassword({ token: second, password: GOOD })).toMatchObject({ ok: true });
  }, 10_000);

  it("leaves the link unused if saving the password fails", async () => {
    addUser({ id: "u1", email: "sam@example.com", passwordHash: oldHash });
    const token = await linkFor("sam@example.com");
    db.failNextTransaction = true;
    await expect(resetPassword({ token, password: GOOD })).rejects.toThrow();
    expect(db.users.get("u1")!.passwordHash).toBe(oldHash);
    expect(await resetPassword({ token, password: GOOD })).toMatchObject({ ok: true });
  }, 10_000);

  it("clears the address's sign-in limits afterwards", async () => {
    addUser({ id: "u1", email: "sam@example.com" });
    const token = await linkFor("sam@example.com");
    const keys = [throttleKey("signinEmail", "sam@example.com"), throttleKey("signinEmailIp", "sam@example.com", env.ip), throttleKey("changeUser", "u1")];
    for (const key of keys) db.throttle.set(key, { key, count: 30, windowStart: new Date(), blockedUntil: new Date(Date.now() + 600_000), updatedAt: new Date() });
    await resetPassword({ token, password: GOOD });
    for (const key of keys) expect(db.throttle.has(key)).toBe(false);
  }, 10_000);

  it("refuses junk tokens", async () => {
    expect(await resetPassword({ token: "nope", password: GOOD })).toMatchObject({ ok: false, expired: true });
    expect(await resetPassword({ token: undefined as never, password: GOOD })).toMatchObject({ ok: false, expired: true });
  });
});

describe("setAccountPassword", () => {
  it("needs a session", async () => {
    expect(await setAccountPassword({ password: GOOD })).toEqual({ ok: false, error: "Sign in first." });
  });

  it("sets a first password without a new stamp, so other devices stay signed in", async () => {
    addUser({ id: "u1", email: "sam@example.com", passwordPromptAfter: new Date("2030-01-01") });
    env.session = { user: { id: "u1", role: "CLIENT" } };
    expect(await setAccountPassword({ password: GOOD })).toEqual({ ok: true });
    const u = db.users.get("u1")!;
    expect(await verifyPassword(GOOD, u.passwordHash)).toBe(true);
    expect(u.passwordPromptAfter).toBeNull();
    expect(u.passwordChangedAt).toBeNull();
    expect(env.updates).toEqual([{}]); // this session re-reads the account, so the step lets go
  });

  it("warns about a weak password (common, short, the email's name) and saves nothing until the person says to use it anyway", async () => {
    addUser({ id: "u1", email: "jordanlee@example.com" });
    env.session = { user: { id: "u1", role: "TRAINER" } };
    expect(await setAccountPassword({ password: "qwertyuiop" })).toMatchObject({ ok: false, weak: true, error: expect.stringMatching(/common/) });
    expect(await setAccountPassword({ password: "jordanlee-squats" })).toMatchObject({ ok: false, weak: true, error: expect.stringMatching(/email/) });
    expect(await setAccountPassword({ password: "abc" })).toMatchObject({ ok: false, weak: true, error: expect.stringMatching(/short/) });
    expect(db.users.get("u1")!.passwordHash).toBeNull();
    expect(await setAccountPassword({ password: "abc", allowWeak: true })).toEqual({ ok: true });
    expect(db.users.get("u1")!.passwordHash).not.toBeNull();
  }, 10_000);
  it("refuses only an empty password, whatever allowWeak says", async () => {
    addUser({ id: "u1", email: "jordanlee@example.com" });
    env.session = { user: { id: "u1", role: "TRAINER" } };
    expect(await setAccountPassword({ password: "", allowWeak: true })).toMatchObject({ ok: false, error: expect.stringMatching(/Choose a password/) });
    expect(db.users.get("u1")!.passwordHash).toBeNull();
  });

  it("needs the current password to change one, and counts wrong ones: 5 free, then a wait", async () => {
    addUser({ id: "u1", email: "sam@example.com", passwordHash: oldHash });
    env.session = { user: { id: "u1", role: "TRAINER" } };
    for (let i = 0; i < 6; i++) expect(await setAccountPassword({ password: GOOD, current: "wrong" })).toEqual({ ok: false, error: "Your current password isn't right." });
    // The 6th wrong one started a wait: now even the right one has to wait.
    expect(await setAccountPassword({ password: GOOD, current: "the old one, long enough" })).toEqual({ ok: false, error: "Too many wrong tries. Try again in 1 min." });
    expect(db.users.get("u1")!.passwordHash).toBe(oldHash);
  }, 20_000);

  it("changes it with the right current password", async () => {
    addUser({ id: "u1", email: "sam@example.com", passwordHash: oldHash });
    env.session = { user: { id: "u1", role: "TRAINER" } };
    expect(await setAccountPassword({ password: GOOD, current: "the old one, long enough" })).toEqual({ ok: true });
    const u = db.users.get("u1")!;
    expect(await verifyPassword(GOOD, u.passwordHash)).toBe(true);
    // A change stamps the password (signing out other devices) and renews this session with a proof.
    expect(u.passwordChangedAt).toBeInstanceOf(Date);
    expect(env.updates).toEqual([{ pwProof: stampProof("u1", u.passwordChangedAt!.getTime()) }]);
  });

  it("refuses guest accounts", async () => {
    addUser({ id: "g1", email: "g-1@guest.atlas.local" });
    env.session = { user: { id: "g1", role: "CLIENT" } };
    expect(await setAccountPassword({ password: GOOD })).toEqual({ ok: false, error: "Save your account with an email first." });
  });
});

describe("snoozePasswordStep", () => {
  it("lets an account from before the step wait 7 days, and refreshes the session", async () => {
    addUser({ id: "u1", email: "sam@example.com", createdAt: new Date("2026-05-13T00:00:00Z") });
    env.session = { user: { id: "u1", role: "TRAINER" } };
    const t = Date.now();
    expect(await snoozePasswordStep()).toEqual({ ok: true });
    const until = db.users.get("u1")!.passwordPromptAfter!.getTime();
    expect(until - t).toBeGreaterThanOrEqual(SNOOZE_MS - 1000);
    expect(until - t).toBeLessThanOrEqual(SNOOZE_MS + 1000);
    expect(env.updates).toHaveLength(1);
  });

  it("lets an account created since the step shipped skip once, never twice", async () => {
    addUser({ id: "u1", email: "new@example.com", createdAt: new Date("2026-11-16T00:00:00Z") });
    env.session = { user: { id: "u1", role: "CLIENT" } };
    expect(await snoozePasswordStep()).toEqual({ ok: true });
    const first = db.users.get("u1")!.passwordPromptAfter!;
    expect(first).toBeInstanceOf(Date);
    // Asking again, even right away or after the 7 days, is refused and changes nothing.
    expect(await snoozePasswordStep()).toEqual({ ok: false, error: "Set a password to go on." });
    db.users.get("u1")!.passwordPromptAfter = new Date(Date.now() - 1000);
    expect(await snoozePasswordStep()).toEqual({ ok: false, error: "Set a password to go on." });
    expect(env.updates).toHaveLength(1);
  });

  it("lets an older account wait again and again", async () => {
    addUser({ id: "u1", email: "sam@example.com", createdAt: new Date("2026-05-13T00:00:00Z"), passwordPromptAfter: new Date(Date.now() - 1000) });
    env.session = { user: { id: "u1", role: "TRAINER" } };
    expect(await snoozePasswordStep()).toEqual({ ok: true });
    expect(await snoozePasswordStep()).toEqual({ ok: true });
  });

  it("needs a session", async () => {
    expect(await snoozePasswordStep()).toEqual({ ok: false, error: "Sign in first." });
  });
});
