import { describe, expect, it } from "vitest";
import type { SessionPoint } from "@/lib/plan/overload";
import { strengthHeadline } from "./strength-headline";

const pt = (date: string, weight: number | null, reps: number, e1rm: number | null, extra: Partial<SessionPoint> = {}): SessionPoint => ({ date, weight, reps, e1rm, volume: 0, sets: 3, deload: false, record: false, best: false, ...extra });

describe("estimated 1RM headline (the default for a loaded lift)", () => {
  const series = [pt("2026-11-21", 185, 8, 234, { e1rmWeight: 185, e1rmReps: 8 }), pt("2026-11-24", 185, 10, 247, { e1rmWeight: 185, e1rmReps: 10 }), pt("2026-11-27", 185, 10, 253, { e1rmWeight: 185, e1rmReps: 10 })];
  it("names the metric and the baseline, and shows the actual set", () => {
    const h = strengthHeadline(series, "e1rm", { loaded: true })!;
    expect(h.pct).toBe(8);
    expect(h.label).toBe("est. 1RM since Nov 21");
    expect(h.subtitle).toBe("185 lb × 10, up from 185 × 8.");
  });
  it("more reps at a LIGHTER weight is not read as progress when the 1RM fell", () => {
    const h = strengthHeadline([pt("2026-11-21", 200, 5, 233, { e1rmWeight: 200, e1rmReps: 5 }), pt("2026-11-24", 150, 12, 210, { e1rmWeight: 150, e1rmReps: 12 })], "e1rm", { loaded: true })!;
    expect(h.pct).toBeLessThan(0);
    expect(h.subtitle).toBe("150 lb × 12, down from 200 × 5.");
  });
  it("a lighter week is left out", () => {
    const h = strengthHeadline([...series, pt("2026-11-28", 100, 5, 117, { deload: true })], "e1rm", { loaded: true })!;
    expect(h.pct).toBe(8);
  });
  it("one session: no percentage, just the set", () => {
    const h = strengthHeadline([series[0]], "e1rm", { loaded: true })!;
    expect(h.pct).toBeNull();
    expect(h.subtitle).toBe("185 lb × 8.");
  });
});

describe("reps on a loaded lift compare at one weight", () => {
  it("+25% reps at 185 lb, ignoring sessions at other weights", () => {
    const h = strengthHeadline([pt("2026-11-14", 135, 15, 200), pt("2026-11-21", 185, 8, 234), pt("2026-11-24", 175, 12, 245), pt("2026-11-27", 185, 10, 247)], "reps", { loaded: true })!;
    expect(h.pct).toBe(25);
    expect(h.label).toBe("reps at 185 lb since Nov 21");
    expect(h.subtitle).toBe("185 lb × 10, up from 185 × 8.");
    expect(h.sessions).toBe(2);
  });
  it("one session at this weight: nothing to compare yet", () => {
    const h = strengthHeadline([pt("2026-11-21", 175, 8, 222), pt("2026-11-27", 185, 10, 247)], "reps", { loaded: true })!;
    expect(h.pct).toBeNull();
    expect(h.label).toBe("reps at 185 lb");
  });
});

describe("a lift with no weight", () => {
  it("compares reps as logged", () => {
    const h = strengthHeadline([pt("2026-11-14", null, 8, null), pt("2026-11-27", null, 12, null)], "reps", { loaded: false })!;
    expect(h.pct).toBe(50);
    expect(h.label).toBe("reps since Nov 14");
    expect(h.subtitle).toBe("12 reps, up from 8.");
  });
});
