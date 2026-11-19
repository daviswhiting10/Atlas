import { describe, expect, it } from "vitest";
import { DEMO_CAPS, GUEST_TTL_MS, demoBusy, isExpiredGuestWorkspace, isGuestEmail } from "./guest-rules";

const now = new Date("2026-11-19T12:00:00Z");
const ago = (h: number) => new Date(now.getTime() - h * 3_600_000);
const guest = (n = 1) => ({ email: `${"abcdef0123456789".repeat(2)}${n}@guest.atlas.app` });
const real = { email: "someone@example.com" };

describe("isGuestEmail", () => {
  it("is only the guest domain, exactly", () => {
    expect(isGuestEmail("a1b2@guest.atlas.app")).toBe(true);
    expect(isGuestEmail("A1B2@GUEST.ATLAS.APP")).toBe(true);
    for (const e of ["a@atlas.app", "a@notguest.atlas.app", "a@guest.atlas.app.evil.com", "guest.atlas.app@gmail.com", "a@sub.guest.atlas.app", "", "a@guest.atlas.app "]) expect(isGuestEmail(e), e).toBe(false);
  });
});

describe("isExpiredGuestWorkspace: a non-guest workspace is never selected", () => {
  it("selects an old workspace whose every user is a guest", () => {
    expect(isExpiredGuestWorkspace({ createdAt: ago(25), users: [guest()] }, now)).toBe(true);
    expect(isExpiredGuestWorkspace({ createdAt: ago(24), users: [guest(1), guest(2)] }, now)).toBe(true);
  });
  it("never selects one with any real login, however old", () => {
    expect(isExpiredGuestWorkspace({ createdAt: ago(24 * 365), users: [real] }, now)).toBe(false);
    expect(isExpiredGuestWorkspace({ createdAt: ago(24 * 365), users: [guest(), real] }, now)).toBe(false);
    expect(isExpiredGuestWorkspace({ createdAt: ago(24 * 365), users: [real, guest()] }, now)).toBe(false);
    // a guest who saved their account has a real address now
    expect(isExpiredGuestWorkspace({ createdAt: ago(48), users: [{ email: "saved@example.com" }] }, now)).toBe(false);
  });
  it("never selects a workspace with no users (nothing says it is a guest's)", () => {
    expect(isExpiredGuestWorkspace({ createdAt: ago(100), users: [] }, now)).toBe(false);
  });
  it("never selects a recent one", () => {
    expect(isExpiredGuestWorkspace({ createdAt: ago(23.9), users: [guest()] }, now)).toBe(false);
    expect(isExpiredGuestWorkspace({ createdAt: ago(0), users: [guest()] }, now)).toBe(false);
    expect(GUEST_TTL_MS).toBe(24 * 3_600_000);
  });
  it("never selects lookalike addresses", () => {
    expect(isExpiredGuestWorkspace({ createdAt: ago(48), users: [{ email: "x@guest.atlas.app.evil.com" }] }, now)).toBe(false);
    expect(isExpiredGuestWorkspace({ createdAt: ago(48), users: [{ email: "guest.atlas.app@gmail.com" }] }, now)).toBe(false);
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
