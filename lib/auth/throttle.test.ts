import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db/client", async () => ({ prisma: (await import("./test-db")).fakePrisma }));

import { db, resetDb } from "./test-db";
import { POLICIES, afterEvent, blockedFor, clear, ipFrom, record, throttleKey, waitFor, type Row } from "./throttle";

const t0 = new Date("2026-11-15T10:00:00Z");
const at = (ms: number) => new Date(t0.getTime() + ms);
const SEC = 1000;
const MIN = 60 * SEC;

/** n events in a row, `gap` ms apart, starting at t0. */
function run(policy: (typeof POLICIES)[keyof typeof POLICIES], n: number, gap = 0): Row {
  let row: Row | null = null;
  for (let i = 0; i < n; i++) row = afterEvent(row, policy, at(i * gap));
  return row!;
}

describe("blockedFor", () => {
  it("is 0 without a row or a block, and after the block ends", () => {
    expect(blockedFor(null, t0)).toBe(0);
    expect(blockedFor({ count: 3, windowStart: t0, blockedUntil: null }, t0)).toBe(0);
    expect(blockedFor({ count: 9, windowStart: t0, blockedUntil: at(30 * SEC) }, at(31 * SEC))).toBe(0);
  });
  it("is the time left while blocked", () => {
    expect(blockedFor({ count: 9, windowStart: t0, blockedUntil: at(30 * SEC) }, at(10 * SEC))).toBe(20 * SEC);
  });
});

describe("wrong passwords, same email and connection (signinEmailIp)", () => {
  const p = POLICIES.signinEmailIp;

  it("the first 5 are free", () => {
    for (let n = 1; n <= 5; n++) expect(run(p, n).blockedUntil).toBeNull();
  });

  it("then 30 s, doubling each time", () => {
    const waits = [6, 7, 8, 9].map((n) => blockedFor(run(p, n), t0));
    expect(waits).toEqual([30 * SEC, 60 * SEC, 120 * SEC, 240 * SEC]);
  });

  it("never more than 15 minutes, however many", () => {
    expect(blockedFor(run(p, 12), t0)).toBe(15 * MIN);
    expect(blockedFor(run(p, 40), t0)).toBe(15 * MIN);
  });

  it("starts again from zero once the hour has passed", () => {
    const tired = run(p, 9);
    const fresh = afterEvent(tired, p, at(60 * MIN));
    expect(fresh).toEqual({ count: 1, windowStart: at(60 * MIN), blockedUntil: null });
    // ...but not a moment before.
    expect(afterEvent(tired, p, at(60 * MIN - 1)).count).toBe(10);
  });
});

describe("wrong passwords, same email from anywhere (signinEmail)", () => {
  it("20 free an hour, then one a minute", () => {
    expect(run(POLICIES.signinEmail, 20).blockedUntil).toBeNull();
    expect(blockedFor(run(POLICIES.signinEmail, 21), t0)).toBe(MIN);
    expect(blockedFor(run(POLICIES.signinEmail, 30), t0)).toBe(MIN);
  });
});

describe("requests (signinIp, resetEmail, resetIp)", () => {
  it("allows up to the maximum, then blocks until the window ends", () => {
    const p = POLICIES.resetEmail; // 3 an hour
    expect(run(p, 2, MIN).blockedUntil).toBeNull();
    const third = run(p, 3, MIN);
    expect(third.blockedUntil).toEqual(at(60 * MIN)); // the third is allowed; the next waits for the window
    expect(blockedFor(third, at(2 * MIN))).toBe(58 * MIN);
  });

  it("limits sign-in attempts from one connection to 50 per 15 minutes", () => {
    expect(run(POLICIES.signinIp, 49).blockedUntil).toBeNull();
    expect(run(POLICIES.signinIp, 50).blockedUntil).toEqual(at(15 * MIN));
  });

  it("10 reset emails an hour from one connection", () => {
    expect(run(POLICIES.resetIp, 9).blockedUntil).toBeNull();
    expect(run(POLICIES.resetIp, 10).blockedUntil).toEqual(at(60 * MIN));
  });
});

describe("wrong current password on change (changeUser)", () => {
  it("5 free, then 1 minute doubling to 15", () => {
    expect(run(POLICIES.changeUser, 5).blockedUntil).toBeNull();
    expect([6, 7, 8, 9, 10].map((n) => blockedFor(run(POLICIES.changeUser, n), t0))).toEqual([MIN, 2 * MIN, 4 * MIN, 8 * MIN, 15 * MIN]);
  });
});

describe("throttleKey", () => {
  it("is stable, names its policy, and holds no raw email or IP", () => {
    const k = throttleKey("signinEmailIp", "sam@example.com", "203.0.113.9");
    expect(k).toBe(throttleKey("signinEmailIp", "sam@example.com", "203.0.113.9"));
    expect(k.startsWith("signinEmailIp:")).toBe(true);
    expect(k).not.toMatch(/sam|example|203/);
  });
  it("differs by policy and by subject", () => {
    expect(throttleKey("signinEmail", "a@x.co")).not.toBe(throttleKey("resetEmail", "a@x.co"));
    expect(throttleKey("signinEmail", "a@x.co")).not.toBe(throttleKey("signinEmail", "b@x.co"));
  });
});

describe("ipFrom", () => {
  it("takes the first forwarded address, then x-real-ip", () => {
    expect(ipFrom(new Headers({ "x-forwarded-for": "203.0.113.9, 10.0.0.1" }))).toBe("203.0.113.9");
    expect(ipFrom(new Headers({ "x-real-ip": "198.51.100.4" }))).toBe("198.51.100.4");
    expect(ipFrom(new Headers())).toBe("unknown");
  });
});

describe("stored limits", () => {
  beforeEach(() => resetDb());

  it("record, waitFor and clear work together", async () => {
    const key = throttleKey("signinEmailIp", "sam@example.com", "1.2.3.4");
    for (let i = 0; i < 6; i++) await record(key, POLICIES.signinEmailIp, t0);
    expect(await waitFor(key, t0)).toBe(30 * SEC);
    expect(await waitFor(key, at(30 * SEC))).toBe(0);
    await clear(key);
    expect(await waitFor(key, t0)).toBe(0);
    expect(db.throttle.size).toBe(0);
  });

  /**
   * Password sign-in, step for step as lib/auth.ts does it: all three keys are asked before the password is
   * looked at, every attempt counts against the connection, and every wrong one against the address.
   */
  async function attempt(email: string, ip: string, right: boolean, now: Date): Promise<"signed in" | "wrong" | "blocked"> {
    const keys = { emailIp: throttleKey("signinEmailIp", email, ip), email: throttleKey("signinEmail", email), ip: throttleKey("signinIp", ip) };
    const waits = await Promise.all([waitFor(keys.emailIp, now), waitFor(keys.email, now), waitFor(keys.ip, now)]);
    await record(keys.ip, POLICIES.signinIp, now);
    if (waits.some((w) => w > 0)) return "blocked";
    if (!right) {
      await Promise.all([record(keys.emailIp, POLICIES.signinEmailIp, now), record(keys.email, POLICIES.signinEmail, now)]);
      return "wrong";
    }
    await clear(keys.emailIp);
    return "signed in";
  }

  it("password sign-in, per address and connection: 5 wrong are free, then even the RIGHT password waits", async () => {
    for (let i = 0; i < 5; i++) expect(await attempt("sam@example.com", "1.2.3.4", false, t0)).toBe("wrong");
    expect(await attempt("sam@example.com", "1.2.3.4", false, t0)).toBe("wrong"); // the 6th wrong one starts the wait
    expect(await attempt("sam@example.com", "1.2.3.4", true, t0)).toBe("blocked");
    expect(await attempt("sam@example.com", "1.2.3.4", true, at(31 * SEC))).toBe("signed in"); // never a permanent lock
    expect(await attempt("sam@example.com", "9.9.9.9", true, t0)).toBe("signed in"); // someone else's connection is not held
  });

  it("password sign-in, per connection: 50 attempts in 15 minutes, then every address from it waits", async () => {
    for (let i = 0; i < 50; i++) await attempt(`user${i}@example.com`, "5.6.7.8", true, t0);
    expect(await attempt("fresh@example.com", "5.6.7.8", true, at(MIN))).toBe("blocked");
    expect(await attempt("fresh@example.com", "5.6.7.9", true, at(MIN))).toBe("signed in");
    expect(await attempt("fresh@example.com", "5.6.7.8", true, at(16 * MIN))).toBe("signed in");
  });

  it("password sign-in, per address from anywhere: 20 wrong an hour (from many connections), then one a minute", async () => {
    for (let i = 0; i < 21; i++) await attempt("sam@example.com", `10.0.0.${i}`, false, t0);
    expect(await attempt("sam@example.com", "10.0.1.1", true, at(SEC))).toBe("blocked");
    expect(await attempt("sam@example.com", "10.0.1.1", true, at(MIN + SEC))).toBe("signed in");
  });
});
