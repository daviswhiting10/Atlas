import { describe, expect, it } from "vitest";
import { lastLogged } from "./last-logged";

const NOW = new Date("2026-11-20T15:00:00Z"); // 10:00 in New York
const TZ = "America/New_York";

describe("lastLogged", () => {
  it("is Logged today for a session done today, in the coach's own time zone", () => {
    expect(lastLogged("2026-11-20T13:00:00Z", NOW, TZ)).toEqual({ label: "Logged today", today: true });
    // 02:00 UTC on the 21st is still the evening of the 20th in New York
    expect(lastLogged("2026-11-21T02:00:00Z", new Date("2026-11-21T03:00:00Z"), TZ)?.today).toBe(true);
  });
  it("is Yesterday, then the date", () => {
    expect(lastLogged("2026-11-19T18:00:00Z", NOW, TZ)).toEqual({ label: "Yesterday", today: false });
    expect(lastLogged("2026-11-14T18:00:00Z", NOW, TZ)).toEqual({ label: "Nov 14", today: false });
  });
  it("shows the year when it isn't this one", () => {
    expect(lastLogged("2025-03-02T18:00:00Z", NOW, TZ)?.label).toBe("Mar 2, 2025");
  });
  it("is nothing when she has never logged, or the date is junk", () => {
    expect(lastLogged(null, NOW, TZ)).toBeNull();
    expect(lastLogged("nope", NOW, TZ)).toBeNull();
  });
});
