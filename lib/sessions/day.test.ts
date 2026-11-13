import { describe, expect, it } from "vitest";
import { localDay } from "@/lib/athlete/sessions";
import { dayToDate } from "./day";

const ZONES = ["America/New_York", "America/Los_Angeles", "Europe/London", "Asia/Tokyo", "Pacific/Auckland", "Pacific/Kiritimati", "Pacific/Pago_Pago", "UTC"];

describe("dayToDate", () => {
  it.each(ZONES)("a picked day reads back as that day in %s", (tz) => {
    for (const day of ["2026-11-13", "2026-03-08", "2026-11-01", "2026-12-31", "2028-02-29"]) {
      expect(localDay(dayToDate(day, tz), tz)).toBe(day);
    }
  });

  it("is noon there (the bug: midnight UTC is yesterday in New York)", () => {
    expect(localDay(new Date("2026-11-13"), "America/New_York")).toBe("2026-11-12");
    expect(dayToDate("2026-11-13", "America/New_York").toISOString()).toBe("2026-11-13T17:00:00.000Z");
    expect(dayToDate("2026-07-13", "America/New_York").toISOString()).toBe("2026-07-13T16:00:00.000Z");
  });

  it("rejects anything that isn't a real day", () => {
    for (const bad of ["2026-13-01", "2026-02-30", "11/13/2026", "2026-11-13T00:00:00Z", ""]) {
      expect(() => dayToDate(bad, "UTC")).toThrow();
    }
  });
});
