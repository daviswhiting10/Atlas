import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { TARGET_LIMIT_MESSAGE, TIME_LIMIT_TEXT, durationRange } from "@/lib/sessions/duration";
import { describeLast } from "@/lib/sessions/quick-log";
import { nextTarget } from "@/lib/plan/overload";

const t = (repMin: number, repMax = repMin) => [{ setNumber: 1, weight: null, unit: "secs" as const, repMin, repMax, rpe: null, restSeconds: 60 }];
const src = (p: string) => readFileSync(p, "utf8");

describe("a time reads as minutes and seconds everywhere", () => {
  it("plan overview, MCP and the plan wizard use the one range writer", () => {
    expect(durationRange(900, 900)).toBe("15 min");
    expect(durationRange(30, 45)).toBe("30–45 sec");
    expect(durationRange(90, 90)).toBe("1:30 min");
    for (const p of ["lib/plan/overview.ts", "lib/mcp/data.ts", "components/athlete/PlanWizard.tsx"]) expect(src(p)).toContain("durationRange(");
    expect(src("lib/plan/overview.ts")).not.toMatch(/\$\{range\}s/);
  });
  it("last time and progression text", () => {
    expect(describeLast({ date: "2026-11-06", unit: "secs", sets: [{ weight: null, reps: 900, band: null }] })).toBe("1 × 15 min");
    const n = nextTarget({ last: [{ weight: null, reps: 600, completed: true }], repMin: 600, repMax: 900, increment: 0, unit: "secs" } as never);
    expect(n.headline).toBe("Beat 10 min");
  });
  it("the limit is said in minutes", () => {
    expect(src("lib/plan/edit.ts")).toContain("seconds: 14400");
    expect(TIME_LIMIT_TEXT).toBe("240 min");
    expect(TARGET_LIMIT_MESSAGE).toContain("240 min");
    expect(src("lib/actions/coach-plan.ts")).toContain("TARGET_LIMIT_MESSAGE");
    expect(src("lib/actions/athlete.ts")).toContain("TARGET_LIMIT_MESSAGE");
    expect(src("lib/mcp/tools/plan.ts")).toContain("240 min");
  });
});

describe("the coach logger takes a min:sec field", () => {
  const f = src("app/(dashboard)/clients/[id]/log/WorkoutLogger.tsx");
  it("uses TimeField for timed sets, the target editor and the desktop row", () => {
    expect(f).toContain("<TimeField");
    expect(f).toContain("parseClock");
    expect(f).toContain('label={`Set ${idx + 1} time`}');
    expect(f).toContain('"Time from"');
    expect(f).not.toMatch(/"Seconds (from|to)"/);
    expect(f).toContain('{secs ? "Time" : "Reps"}');
  });
  it("steps 30 s with the arrow keys and keeps seconds in the set", () => {
    expect(f).toContain("bumpSeconds");
    expect(f).toContain("onChange(String(next))");
  });
});
