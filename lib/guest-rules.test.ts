import { describe, expect, it } from "vitest";
import { DEMO_CAPS, DEMO_TTL_MS, demoBusy, isExpiredGuestWorkspace, isGuestEmail } from "./guest-rules";

const now = new Date("2026-11-19T12:00:00Z");
const ago = (h: number) => new Date(now.getTime() - h * 3_600_000);
const coach = (n = 1) => ({ email: `${"abcdef0123456789".repeat(2)}${n}@guest.atlas.app`, role: "TRAINER" });
const athlete = (n = 1) => ({ email: `${"abcdef0123456789".repeat(2)}${n}@guest.atlas.app`, role: "CLIENT" });
const real = { email: "someone@example.com", role: "TRAINER" };
const realClient = { email: "client@example.com", role: "CLIENT" };

describe("isGuestEmail", () => {
  it("is only the guest domain, exactly", () => {
    expect(isGuestEmail("a1b2@guest.atlas.app")).toBe(true);
    expect(isGuestEmail("A1B2@GUEST.ATLAS.APP")).toBe(true);
    for (const e of ["a@atlas.app", "a@notguest.atlas.app", "a@guest.atlas.app.evil.com", "guest.atlas.app@gmail.com", "a@sub.guest.atlas.app", "", "a@guest.atlas.app "]) expect(isGuestEmail(e), e).toBe(false);
  });
});

describe("isExpiredGuestWorkspace: only an old demo, and never a real workspace", () => {
  it("selects a demo (a guest coach, every user a guest) older than 6 hours", () => {
    expect(DEMO_TTL_MS).toBe(6 * 3_600_000);
    expect(isExpiredGuestWorkspace({ createdAt: ago(7), users: [coach()] }, now)).toBe(true);
    expect(isExpiredGuestWorkspace({ createdAt: ago(6), users: [coach(1), athlete(2)] }, now)).toBe(true);
  });
  it("does not select a demo younger than 6 hours", () => {
    expect(isExpiredGuestWorkspace({ createdAt: ago(5.9), users: [coach()] }, now)).toBe(false);
    expect(isExpiredGuestWorkspace({ createdAt: ago(0), users: [coach()] }, now)).toBe(false);
  });
  it("never selects a try-it guest athlete's workspace, however old", () => {
    for (const h of [7, 24, 24 * 30, 24 * 365]) expect(isExpiredGuestWorkspace({ createdAt: ago(h), users: [athlete()] }, now), `${h} h`).toBe(false);
  });
  it("never selects one with any real login, however old", () => {
    expect(isExpiredGuestWorkspace({ createdAt: ago(24 * 365), users: [real] }, now)).toBe(false);
    expect(isExpiredGuestWorkspace({ createdAt: ago(24 * 365), users: [realClient] }, now)).toBe(false);
    expect(isExpiredGuestWorkspace({ createdAt: ago(24 * 365), users: [coach(), real] }, now)).toBe(false);
    expect(isExpiredGuestWorkspace({ createdAt: ago(24 * 365), users: [real, coach()] }, now)).toBe(false);
    expect(isExpiredGuestWorkspace({ createdAt: ago(24 * 365), users: [coach(), realClient] }, now)).toBe(false);
    // a guest coach who saved their account has a real address now
    expect(isExpiredGuestWorkspace({ createdAt: ago(48), users: [{ email: "saved@example.com", role: "TRAINER" }] }, now)).toBe(false);
  });
  it("never selects a workspace with no users", () => {
    expect(isExpiredGuestWorkspace({ createdAt: ago(100), users: [] }, now)).toBe(false);
  });
  it("never selects lookalike addresses", () => {
    expect(isExpiredGuestWorkspace({ createdAt: ago(48), users: [{ email: "x@guest.atlas.app.evil.com", role: "TRAINER" }] }, now)).toBe(false);
    expect(isExpiredGuestWorkspace({ createdAt: ago(48), users: [{ email: "guest.atlas.app@gmail.com", role: "TRAINER" }] }, now)).toBe(false);
  });
  it("only a test can include athletes, and it still needs every user to be a guest", () => {
    expect(isExpiredGuestWorkspace({ createdAt: ago(48), users: [athlete()] }, now, DEMO_TTL_MS, true)).toBe(true);
    expect(isExpiredGuestWorkspace({ createdAt: ago(48), users: [athlete(), realClient] }, now, DEMO_TTL_MS, true)).toBe(false);
    expect(isExpiredGuestWorkspace({ createdAt: ago(48), users: [] }, now, DEMO_TTL_MS, true)).toBe(false);
  });
});

describe("the demo cap", () => {
  it("is 10 an hour overall", () => {
    expect(DEMO_CAPS.perHour).toBe(10);
    expect(demoBusy(9, 0)).toBe(false);
    expect(demoBusy(10, 0)).toBe(true);
    expect(demoBusy(500, 0)).toBe(true);
  });
  it("makes one connection wait once it is over its own limit, however empty the demo is", () => {
    expect(demoBusy(0, 1)).toBe(true);
    expect(demoBusy(0, 0)).toBe(false);
  });
  it("takes the cap as an argument", () => {
    expect(demoBusy(1, 0, 2)).toBe(false);
    expect(demoBusy(2, 0, 2)).toBe(true);
  });
});
