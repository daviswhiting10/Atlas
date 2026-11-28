import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const r = (p: string) => readFileSync(new URL(p, import.meta.url), "utf8");
describe("Change date (the calendar day a session was done on)", () => {
  const a = r("./actions/athlete.ts");
  const fn = a.slice(a.indexOf("export async function changeMySessionDate"), a.indexOf("export async function freshLoggerSets"));
  it("own sessions only, never the future", () => {
    expect(fn).toContain("where: { id: parsed.data.workoutLogId, clientId }");
    expect(fn).toContain("hasn't happened yet");
  });
  it("only the day moves: its plan day (assignedWorkoutId) and sets are not touched, the time of day is kept", () => {
    expect(fn).not.toContain("assignedWorkoutId:");
    expect(fn).not.toContain("setLog");
    expect(fn).toContain("days * 86_400_000");
  });
  const m = r("../components/athlete/SessionMini.tsx");
  it("the button is above Reassign, and Reassign says what it moves", () => {
    expect(m.indexOf("Change date\n")).toBeLessThan(m.indexOf("Reassign plan day"));
    expect(m).not.toContain("Reassign to…\n");
  });
  it("it is offered on the Plan calendar and in History, not in the demo", () => {
    expect(r("../app/(client)/plan/page.tsx")).toContain("changeDate={changeMySessionDate}");
    expect(r("../app/(client)/progress/page.tsx")).toContain("changeDate={changeMySessionDate}");
    expect(r("../app/demo/progress/page.tsx")).not.toContain("changeDate");
  });
});
