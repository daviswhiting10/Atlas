import { describe, expect, it } from "vitest";
import { datedFinished, hardSetsOf } from "./days";
import { HONOLULU, set, sess, TONGA, UTC } from "./fixtures";

describe("datedFinished", () => {
  it("keeps only finished sessions, oldest day first, whatever order they arrive in", () => {
    const out = datedFinished(
      [sess("c", "2026-03-04T12:00:00Z"), sess("run", "2026-03-03T12:00:00Z", [], { completedAt: null }), sess("a", "2026-03-02T12:00:00Z")],
      UTC
    );
    expect(out.map((d) => [d.session.id, d.day])).toEqual([
      ["a", "2026-03-02"],
      ["c", "2026-03-04"],
    ]);
  });

  it("puts a session on the day it was done, not the day it was logged", () => {
    const late = sess("late", "2026-03-02T12:00:00Z", [], { completedAt: new Date("2026-03-09T09:00:00Z") });
    expect(datedFinished([late], UTC)[0].day).toBe("2026-03-02");
  });

  it("reads the day in the athlete's timezone: UTC+13 and UTC-10", () => {
    const a = sess("a", "2026-03-02T23:30:00Z"); // UTC Mar 2; Tonga Mar 3 12:30; Honolulu Mar 2 13:30
    const b = sess("b", "2026-03-03T05:00:00Z"); // UTC Mar 3; Tonga Mar 3 18:00; Honolulu Mar 2 19:00
    const c = sess("c", "2026-03-03T12:00:00Z"); // UTC Mar 3; Tonga Mar 4 01:00; Honolulu Mar 3 02:00
    expect(datedFinished([c, b, a], UTC).map((d) => d.day)).toEqual(["2026-03-02", "2026-03-03", "2026-03-03"]);
    expect(datedFinished([c, b, a], TONGA).map((d) => d.day)).toEqual(["2026-03-03", "2026-03-03", "2026-03-04"]);
    expect(datedFinished([c, b, a], HONOLULU).map((d) => d.day)).toEqual(["2026-03-02", "2026-03-02", "2026-03-03"]);
  });

  it("drops days after today, and orders two sessions on one day by when they were done", () => {
    const out = datedFinished([sess("pm", "2026-03-02T18:00:00Z"), sess("am", "2026-03-02T07:00:00Z"), sess("future", "2026-03-20T12:00:00Z")], UTC, "2026-03-05");
    expect(out.map((d) => d.session.id)).toEqual(["am", "pm"]);
  });

  it("falls back to UTC for a timezone name it doesn't know", () => {
    expect(datedFinished([sess("a", "2026-03-02T23:30:00Z")], "Not/AZone")[0].day).toBe("2026-03-02");
  });
});

describe("hardSetsOf", () => {
  const squat = (w: number | null, reps: number | null, extra = {}) => set("sq", w, reps, extra);

  it("RPE 7 or more is hard, below 7 is not", () => {
    const s = sess("s", "2026-03-02T12:00:00Z", [squat(100, 5, { rpe: 6 }), squat(100, 5, { rpe: 7 }), squat(100, 5, { rpe: 9.5 })]);
    expect(hardSetsOf(s).map((x) => x.rpe)).toEqual([7, 9.5]);
  });

  it("with no RPE, within 10% of the session's top weight for that exercise is hard; a warm-up is not", () => {
    const s = sess("s", "2026-03-02T12:00:00Z", [squat(135, 5), squat(205, 5), squat(225, 5)]);
    expect(hardSetsOf(s).map((x) => x.weight)).toEqual([205, 225]); // 205 is 91% of 225; 135 is 60%
  });

  it("the top weight is per exercise, not per session", () => {
    const s = sess("s", "2026-03-02T12:00:00Z", [squat(225, 5), set("curl", 30, 12)]);
    expect(hardSetsOf(s)).toHaveLength(2); // 30 lb is the curl's own top
  });

  it("unloaded work (bodyweight, band, timed) is hard", () => {
    const s = sess("s", "2026-03-02T12:00:00Z", [set("pu", null, 12), set("row", null, 15, { bandColor: "red" }), set("plank", 0, 45)]);
    expect(hardSetsOf(s)).toHaveLength(3);
  });

  it("sets that didn't happen don't count: not completed, or no reps", () => {
    const s = sess("s", "2026-03-02T12:00:00Z", [squat(225, 5, { completed: false }), squat(225, 0), squat(225, null), squat(225, 5)]);
    expect(hardSetsOf(s)).toHaveLength(1);
  });
});
