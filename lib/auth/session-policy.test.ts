import { describe, expect, it } from "vitest";
import { PASSWORD_REQUIRED_FROM, RECHECK_MS, SESSION_MAX_AGE_S, SNOOZE_MS, passwordStep, passwordStepEnabled, sessionCurrent, type StepInput } from "./session-policy";

const GUEST = "guest.atlas.local";
const now = new Date("2026-11-20T12:00:00Z");
const before = new Date(PASSWORD_REQUIRED_FROM.getTime() - 1);
const after = new Date(PASSWORD_REQUIRED_FROM.getTime() + 1);
const base: StepInput = { email: "sam@example.com", hasPassword: false, createdAt: before, passwordPromptAfter: null, googleLinked: false };

describe("passwordStepEnabled", () => {
  it("is off by default until the second deploy", () => {
    expect(passwordStepEnabled({})).toBe(false);
  });
  it("AUTH_PASSWORD_STEP turns it on or off, in any case", () => {
    expect(passwordStepEnabled({ AUTH_PASSWORD_STEP: "on" })).toBe(true);
    expect(passwordStepEnabled({ AUTH_PASSWORD_STEP: "ON" })).toBe(true);
    expect(passwordStepEnabled({ AUTH_PASSWORD_STEP: "off" })).toBe(false);
  });
  it("ignores values it doesn't know", () => {
    expect(passwordStepEnabled({ AUTH_PASSWORD_STEP: "yes" })).toBe(false);
  });
});

describe("passwordStep", () => {
  it("asks nobody while the step is off", () => {
    expect(passwordStep(base, now, false, GUEST)).toEqual({ needs: false, canSnooze: false });
    expect(passwordStep({ ...base, createdAt: after }, now, false, GUEST)).toEqual({ needs: false, canSnooze: false });
  });

  it("asks an older account without a password, and lets it say 'Not now'", () => {
    expect(passwordStep(base, now, true, GUEST)).toEqual({ needs: true, canSnooze: true });
  });

  it("asks a new account straight away, with no 'Not now'", () => {
    expect(passwordStep({ ...base, createdAt: after }, now, true, GUEST)).toEqual({ needs: true, canSnooze: false });
    expect(passwordStep({ ...base, createdAt: PASSWORD_REQUIRED_FROM }, now, true, GUEST)).toEqual({ needs: true, canSnooze: false });
  });

  it("leaves accounts with a password, Google accounts and guests alone", () => {
    expect(passwordStep({ ...base, hasPassword: true }, now, true, GUEST).needs).toBe(false);
    expect(passwordStep({ ...base, googleLinked: true }, now, true, GUEST).needs).toBe(false);
    expect(passwordStep({ ...base, createdAt: after, googleLinked: true }, now, true, GUEST).needs).toBe(false);
    expect(passwordStep({ ...base, email: `g-123@${GUEST}` }, now, true, GUEST).needs).toBe(false);
  });

  it("a snooze holds until it runs out, then asks again", () => {
    const until = new Date(now.getTime() + SNOOZE_MS);
    expect(passwordStep({ ...base, passwordPromptAfter: until }, now, true, GUEST).needs).toBe(false);
    expect(passwordStep({ ...base, passwordPromptAfter: until }, new Date(until.getTime() + 1), true, GUEST)).toEqual({ needs: true, canSnooze: true });
    expect(passwordStep({ ...base, passwordPromptAfter: until }, until, true, GUEST).needs).toBe(true);
  });

  it("a snooze date doesn't excuse a new account", () => {
    const until = new Date(now.getTime() + SNOOZE_MS);
    expect(passwordStep({ ...base, createdAt: after, passwordPromptAfter: until }, now, true, GUEST)).toEqual({ needs: true, canSnooze: false });
  });
});

describe("sessionCurrent", () => {
  const changed = new Date("2026-11-15T09:30:00.123Z");

  it("keeps sessions from before this shipped (no stamp, no change)", () => {
    expect(sessionCurrent(undefined, null)).toBe(true);
  });

  it("signs out a session that has no stamp once the password changes", () => {
    expect(sessionCurrent(undefined, changed)).toBe(false);
  });

  it("keeps a session issued under the current stamp, and drops older ones", () => {
    expect(sessionCurrent(changed.getTime(), changed)).toBe(true);
    expect(sessionCurrent(changed.getTime() - 1, changed)).toBe(false);
    expect(sessionCurrent(0, changed)).toBe(false);
  });
});

describe("timings", () => {
  it("sessions last 180 days, re-checked every 10 minutes, snoozed for 7 days", () => {
    expect(SESSION_MAX_AGE_S).toBe(180 * 86400);
    expect(RECHECK_MS).toBe(10 * 60_000);
    expect(SNOOZE_MS).toBe(7 * 86400_000);
  });
});
