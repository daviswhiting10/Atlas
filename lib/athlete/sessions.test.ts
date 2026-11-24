import { describe, expect, it } from "vitest";
import { DAY_MS, localDay, mondayOf, referenceSession, safeTimeZone, sessionBefore, weekOf } from "./sessions";

const set = (weight: number | null, reps: number, completed = true) => ({ weight, reps, completed });

describe("localDay", () => {
  // 01:30 UTC on the 11th is still the evening of the 10th in New York.
  const lateEvening = new Date("2026-11-11T01:30:00Z");

  it("places an instant on the athlete's calendar day, not the server's", () => {
    expect(localDay(lateEvening, "America/New_York")).toBe("2026-11-10");
    expect(localDay(lateEvening, "UTC")).toBe("2026-11-11");
    expect(localDay(lateEvening, "Asia/Tokyo")).toBe("2026-11-11");
  });

  it("falls back to UTC for a missing or invalid timezone", () => {
    expect(safeTimeZone(undefined)).toBe("UTC");
    expect(safeTimeZone("Not/AZone")).toBe("UTC");
    expect(safeTimeZone("Europe/London")).toBe("Europe/London");
  });
});

describe("mondayOf", () => {
  it("returns the Monday of the week, treating Sunday as the last day", () => {
    expect(mondayOf("2026-11-10")).toBe("2026-11-09"); // Tuesday
    expect(mondayOf("2026-11-09")).toBe("2026-11-09"); // Monday
    expect(mondayOf("2026-11-15")).toBe("2026-11-09"); // Sunday
    expect(mondayOf("2026-11-16")).toBe("2026-11-16");
  });
});

describe("weekOf", () => {
  const start = new Date("2026-09-07T00:00:00Z").getTime();

  it("is 1-indexed and changes every seven days", () => {
    expect(weekOf(start, start)).toBe(1);
    expect(weekOf(start + 6 * DAY_MS, start)).toBe(1);
    expect(weekOf(start + 7 * DAY_MS, start)).toBe(2);
    expect(weekOf(start + 63 * DAY_MS, start)).toBe(10);
  });

  it("is not thrown off by a one-hour daylight-saving shift", () => {
    expect(weekOf(start + 7 * DAY_MS - 3_600_000, start)).toBe(2);
    expect(weekOf(start + 7 * DAY_MS + 3_600_000, start)).toBe(2);
  });

  it("never returns less than 1", () => {
    expect(weekOf(start - 3 * DAY_MS, start)).toBe(1);
  });
});

describe("referenceSession", () => {
  const normal = { deload: false, sets: [set(225, 10)] };
  const lighter = { deload: true, sets: [set(225, 7)] };
  const untouched = { deload: false, sets: [set(225, 8, false)] };

  it("skips a lighter week so the back-off is not the bar to beat", () => {
    expect(referenceSession([normal, lighter])).toBe(normal);
  });

  it("skips a session where nothing was completed", () => {
    expect(referenceSession([normal, untouched])).toBe(normal);
  });

  it("falls back to a lighter week when it is the only history", () => {
    expect(referenceSession([lighter])).toBe(lighter);
  });

  it("returns null with no usable history", () => {
    expect(referenceSession([])).toBeNull();
    expect(referenceSession([untouched])).toBeNull();
  });
});

describe("sessionBefore", () => {
  const a = { deload: false, sets: [set(225, 10)] };
  const b = { deload: false, sets: [set(225, 10)] };
  const lighter = { deload: true, sets: [set(225, 7)] };
  const untouched = { deload: false, sets: [set(225, 8, false)] };

  it("is the counted session before the reference, skipping lighter weeks and empty sessions", () => {
    const sessions = [a, lighter, untouched, b];
    expect(sessionBefore(sessions, referenceSession(sessions))).toBe(a);
  });

  it("is null with nothing earlier, or when the reference is a lighter-week fallback", () => {
    expect(sessionBefore([a], a)).toBeNull();
    expect(sessionBefore([lighter], lighter)).toBeNull();
    expect(sessionBefore([], null)).toBeNull();
  });
});
