import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { SessionPoint } from "@/lib/plan/overload";
import { defaultLift } from "./default-lift";

const pt = (date: string) => ({ date, weight: 100, reps: 5, e1rm: 110, volume: 500, sets: 3, deload: false, record: false }) as SessionPoint;
const lift = (exerciseId: string, dates: string[]) => ({ exerciseId, series: dates.map(pt) });
const dates = (n: number, start = "2026-01-") => Array.from({ length: n }, (_, i) => `${start}${String(i + 1).padStart(2, "0")}`);

describe("defaultLift: the lift Progress opens on", () => {
  it("is the most-trained lift", () => {
    expect(defaultLift([lift("squat", dates(8)), lift("bench", dates(12)), lift("row", dates(5))])).toBe("bench");
  });
  it("a lift with too few sessions to draw a line is never the headline", () => {
    expect(defaultLift([lift("curl", dates(2)), lift("bench", dates(3))])).toBe("bench");
    expect(defaultLift([lift("curl", dates(2))])).toBeNull();
    expect(defaultLift([])).toBeNull();
  });
  it("a tie goes to the first listed, so the choice never flickers", () => {
    expect(defaultLift([lift("bench", dates(6, "2026-01-")), lift("squat", dates(6, "2026-03-"))])).toBe("bench");
    expect(defaultLift([lift("squat", dates(6, "2026-03-")), lift("bench", dates(6, "2026-01-"))])).toBe("squat");
  });
  it("works from a count when the series itself was left out of the page", () => {
    expect(defaultLift([{ exerciseId: "a", series: [], count: 9 }, { exerciseId: "b", series: [], count: 4 }])).toBe("a");
  });
});

describe("Progress opens on it", () => {
  const v = readFileSync(new URL("../../components/athlete/ProgressView.tsx", import.meta.url), "utf8");
  it("the chosen lift starts as the default, and All lifts is still a choice", () => {
    expect(v).toContain("useState<string | null>(() => defaultLift(data.exercises, THIN))");
    expect(v).toContain("All lifts");
  });
});

describe("the rest of the Progress polish", () => {
  const read = (p: string) => readFileSync(new URL(`../../${p}`, import.meta.url), "utf8");
  it("the latest record says when it was set", () => {
    expect(read("components/athlete/ProgressView.tsx")).toContain("{record.unit} · {day(record.date)}");
  });
  it("body weight has a soft fill under its line and a dot on the latest weigh-in only (like the strength curve)", () => {
    const b = read("components/athlete/BodyWeightSection.tsx");
    expect(b).toContain('id="bodyweight-fill"');
    expect(b).toContain("<polygon");
    expect(b).not.toContain("points.map((p) => <circle");
    expect((b.match(/<circle/g) ?? []).length).toBe(1);
  });
});

describe("the demo opens on its story", () => {
  it("the sample athlete's Progress opens on the bench (135 to 185)", async () => {
    const { DEMO_PROGRESS } = await import("@/lib/demo/sample");
    const id = defaultLift(DEMO_PROGRESS.exercises);
    expect(DEMO_PROGRESS.exercises.find((e) => e.exerciseId === id)?.name).toBe("Bench Press");
  });
});
