import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const ath = readFileSync(new URL("../components/athlete/WorkoutLogger.tsx", import.meta.url), "utf8");
const coach = readFileSync(new URL("../app/(dashboard)/clients/[id]/log/WorkoutLogger.tsx", import.meta.url), "utf8");

describe("the logger's title is never cut with an ellipsis", () => {
  it("athlete header: the name wraps (up to two lines), not truncate", () => {
    expect(ath).toContain("[overflow-wrap:anywhere]\">{data.name}</span>");
    expect(ath).not.toContain("line-clamp-2");
    expect(ath).not.toMatch(/truncate[^>]*>\{data\.name\}/);
  });
  it("coach header row: date, week and name wrap in a row that grows", () => {
    expect(coach).toContain('[overflow-wrap:anywhere]">\n          {dateLabel} · Week {currentWorkoutWeek} · {workoutName}');
    expect(coach).toContain("min-h-11 w-full items-center gap-2 rounded-xl");
  });
});
