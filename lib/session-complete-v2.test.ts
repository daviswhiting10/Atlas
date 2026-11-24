import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

describe("Session complete: the other side's note first", () => {
  it("the coach's screen shows the athlete's note above the coach's own", () => {
    const c = read("app/(dashboard)/clients/[id]/log/WorkoutLogger.tsx");
    expect(c.indexOf("<AthleteNote")).toBeGreaterThan(-1);
    expect(c.indexOf("<AthleteNote")).toBeLessThan(c.indexOf("{soapPanel}\n          {notesUnsaved"));
  });
  it("the athlete's screen shows the coach's note above their own", () => {
    const a = read("components/athlete/WorkoutLogger.tsx");
    expect(a.indexOf("data.coachNote")).toBeGreaterThan(-1);
    expect(a.indexOf("data.coachNote")).toBeLessThan(a.indexOf("<MySessionNote"));
  });
  it("the coach's session page and latest-session card list the athlete's note first", () => {
    const page = read("app/(dashboard)/clients/[id]/sessions/[workoutLogId]/page.tsx");
    expect(page.indexOf("session.notes?.athlete && (")).toBeLessThan(page.indexOf("session.notes?.coach ?? session.clientNotes) && ("));
    const l = read("components/coach/LatestSession.tsx");
    expect(l.indexOf("s.athleteNote && (")).toBeLessThan(l.indexOf("s.note && ("));
  });
  it("what the screen adds is loaded after it shows, and each part can be missing", () => {
    const c = read("app/(dashboard)/clients/[id]/log/WorkoutLogger.tsx");
    expect(c).toContain("void sessionWrapUp({ workoutLogId }).then(setWrap).catch(() => {});");
    expect(c).toContain("wrap?.medals ?? []");
    expect(c).toContain("wrap?.compare ?? null");
    expect(c).toContain("wrap?.next ?? null");
  });
});
