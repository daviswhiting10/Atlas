import { describe, expect, it } from "vitest";
import { dayToDate } from "@/lib/sessions/day";
import { addDays } from "./days";
import { evaluateGoal, type CheckInInput, type SessionInput } from "./evaluate";
import { GoalRules, addCheckInRule, removeRule } from "./rules";
import { SEVENTY_FIVE_HARD } from "./templates";

const TZ = "America/New_York";
const D1 = "2026-01-01";
const noon = (day: string, tz = TZ) => dayToDate(day, tz);
const hard = { startDay: D1, timeZone: TZ, rules: SEVENTY_FIVE_HARD.rules };
const oneWorkout = (days = 5) => GoalRules.parse({ length: { days }, onMiss: "reset", rules: [{ key: "w", label: "Workout", kind: "sessions", per: "day", min: 1 }] });
const small = (days = 5) => ({ startDay: D1, timeZone: TZ, rules: oneWorkout(days) });
const session = (day: string, durationMin: number | null = 50, n = 1, tz = TZ): SessionInput => ({ id: `s-${day}-${n}`, date: noon(day, tz), durationMin });

/** Everything 75 Hard asks, done on `day`: two 50-minute workouts (one outdoors) and four ticks. */
function fullDay(day: string): { sessions: SessionInput[]; checkIns: CheckInInput[] } {
  const sessions = [session(day, 50, 1), session(day, 50, 2)];
  const checkIns: CheckInInput[] = [
    { ruleKey: "outdoors", day, workoutLogId: sessions[1].id, excuse: false },
    ...["water", "reading", "diet", "photo"].map((ruleKey) => ({ ruleKey, day, workoutLogId: null, excuse: false })),
  ];
  return { sessions, checkIns };
}
const days = (list: string[]) => list.map(fullDay).reduce((a, d) => ({ sessions: [...a.sessions, ...d.sessions], checkIns: [...a.checkIns, ...d.checkIns] }), { sessions: [] as SessionInput[], checkIns: [] as CheckInInput[] });

describe("a day", () => {
  it("is met when every rule is met", () => {
    const { sessions, checkIns } = fullDay(D1);
    const r = evaluateGoal(hard, sessions, checkIns, noon(D1));
    expect(r.periods[0].state).toBe("met");
    expect(Object.values(r.periods[0].rules).every((s) => s === "met")).toBe(true);
    expect(r.dayOfGoal).toBe(1);
    expect(r.attempts).toEqual([{ fromDay: D1, toDay: D1, days: 1, current: true }]);
    expect(r.today.every((t) => t.state === "met")).toBe(true);
  });

  it("stays open through the next day, then closes", () => {
    const open = (now: string) => evaluateGoal(hard, [], [], noon(now));
    expect(open(D1).periods[0].state).toBe("pending");
    expect(open("2026-01-02").periods[0].state).toBe("pending"); // grace: still repairable
    expect(open("2026-01-03").periods[0].state).toBe("missed");
  });

  it("a late log repairs a day, so nothing resets", () => {
    const { sessions, checkIns } = fullDay(D1);
    const r = evaluateGoal(hard, sessions, checkIns, noon("2026-01-02"));
    expect(r.misses).toBe(0);
    expect(r.periods[0].state).toBe("met");
  });

  it("an excuse counts as met and is shown as excused", () => {
    const r = evaluateGoal(small(), [], [{ ruleKey: "w", day: D1, workoutLogId: null, excuse: true }], noon("2026-01-05"));
    expect(r.periods[0]).toMatchObject({ state: "met", excused: ["w"] });
  });
});

describe("workouts", () => {
  it("one outdoor workout is one of the two, not a third", () => {
    const only = [session(D1, 50, 1)];
    const r = evaluateGoal(hard, only, [{ ruleKey: "outdoors", day: D1, workoutLogId: only[0].id, excuse: false }], noon(D1));
    expect(r.periods[0].rules).toMatchObject({ workouts: "open", outdoors: "met" });
    expect(r.today.find((t) => t.ruleKey === "workouts")).toMatchObject({ need: 2, have: 1 });
  });

  it("an untagged pair meets the workouts rule but not the outdoor one", () => {
    const r = evaluateGoal(hard, [session(D1, 50, 1), session(D1, 50, 2)], [], noon(D1));
    expect(r.periods[0].rules).toMatchObject({ workouts: "met", outdoors: "open" });
  });

  it("ignores a tag on a session that isn't there or isn't finished", () => {
    const r = evaluateGoal(hard, [session(D1, 50, 1), session(D1, 50, 2)], [{ ruleKey: "outdoors", day: D1, workoutLogId: "ghost", excuse: false }], noon("2026-01-03"));
    expect(r.periods[0].rules.outdoors).toBe("missed");
  });

  it("a session under 45 minutes doesn't count", () => {
    const r = evaluateGoal(hard, [session(D1, 30, 1), session(D1, 50, 2)], [], noon("2026-01-03"));
    expect(r.periods[0].rules.workouts).toBe("missed");
  });
});

describe("a session with no duration", () => {
  const two = [session(D1, null, 1), session(D1, null, 2)];
  const tag: CheckInInput = { ruleKey: "outdoors", day: D1, workoutLogId: two[1].id, excuse: false };

  it("reads 'needs duration' while the day is open, and lists the sessions to ask about", () => {
    const r = evaluateGoal(hard, two, [tag], noon(D1));
    expect(r.periods[0].rules).toMatchObject({ workouts: "needs_duration", outdoors: "needs_duration" });
    expect(r.needsDuration.sort()).toEqual([two[0].id, two[1].id].sort());
  });

  it("doesn't count once the day closes", () => {
    const r = evaluateGoal(hard, two, [tag], noon("2026-01-03"));
    expect(r.periods[0].rules.workouts).toBe("missed");
    expect(r.needsDuration).toEqual([]);
  });

  it("is repaired when the duration is added in time", () => {
    const fixed = two.map((s) => ({ ...s, durationMin: 50 }));
    const r = evaluateGoal(hard, fixed, [tag], noon("2026-01-02"));
    expect(r.periods[0].rules).toMatchObject({ workouts: "met", outdoors: "met" });
  });

  it("isn't asked about when it couldn't make the difference", () => {
    const r = evaluateGoal(hard, [session(D1, 30, 1), session(D1, null, 2)], [], noon(D1));
    expect(r.periods[0].rules.workouts).toBe("open");
    expect(r.needsDuration).toEqual([]);
  });
});

describe("resets", () => {
  it("starts again the day after a missed day, and keeps the earlier attempt", () => {
    const sessions = ["2026-01-01", "2026-01-02", "2026-01-03", "2026-01-05", "2026-01-06"].map((d) => session(d));
    const r = evaluateGoal(small(10), sessions, [], noon("2026-01-07"));
    expect(r.misses).toBe(1);
    expect(r.attempts).toEqual([
      { fromDay: "2026-01-01", toDay: "2026-01-03", days: 3, current: false },
      { fromDay: "2026-01-05", toDay: "2026-01-06", days: 2, current: true },
    ]);
    expect(r.attemptNumber).toBe(2);
    expect(r.dayOfGoal).toBe(3); // Jan 5 was day 1; today is Jan 7
    expect(r.streak).toEqual({ current: 2, best: 3 });
  });

  it("a miss on the first day is an attempt of zero days", () => {
    const r = evaluateGoal(small(), [], [], noon("2026-01-03"));
    expect(r.attempts[0]).toEqual({ fromDay: D1, toDay: null, days: 0, current: false });
    expect(r.attempts[1]).toMatchObject({ fromDay: "2026-01-02", current: true });
    expect(r.dayOfGoal).toBe(2);
  });

  it("a late log that fills the gap undoes the reset", () => {
    const base = ["2026-01-01", "2026-01-02", "2026-01-03", "2026-01-05", "2026-01-06"].map((d) => session(d));
    const before = evaluateGoal(small(10), base, [], noon("2026-01-07"));
    const after = evaluateGoal(small(10), [...base, session("2026-01-04")], [], noon("2026-01-07"));
    expect(before.misses).toBe(1);
    expect(after.misses).toBe(0);
    expect(after.attempts).toEqual([{ fromDay: D1, toDay: "2026-01-06", days: 6, current: true }]);
  });
});

describe("finishing", () => {
  const sessions = ["2026-01-01", "2026-01-02", "2026-01-03"].map((d) => session(d));

  it("the last day has to close first", () => {
    const r = evaluateGoal(small(3), sessions, [], noon("2026-01-03"));
    expect(r).toMatchObject({ suggestion: "keep_going", completedOn: null, dayOfGoal: 3 });
  });

  it("completes once it has, and ignores what comes after", () => {
    const r = evaluateGoal(small(3), sessions, [], noon("2026-01-20"));
    expect(r).toMatchObject({ suggestion: "complete", completedOn: "2026-01-03", dayOfGoal: 3, misses: 0 });
    expect(r.periods).toHaveLength(3);
    expect(r.attempts).toEqual([{ fromDay: D1, toDay: "2026-01-03", days: 3, current: false }]);
  });

  it("can be asked to stop looking at a day (a goal that has ended)", () => {
    const r = evaluateGoal(small(30), sessions, [], noon("2026-01-20"), { lastDay: "2026-01-03" });
    expect(r.periods).toHaveLength(3);
    expect(r.today).toEqual([]);
    expect(r.misses).toBe(0);
  });

  it("a goal that starts in the future hasn't started", () => {
    expect(evaluateGoal({ ...small(), startDay: "2026-02-01" }, [], [], noon("2026-01-15")).started).toBe(false);
  });
});

describe("changing the rules mid-run", () => {
  it("an added rule only judges from today; earlier days keep their result", () => {
    const sessions = ["2026-01-01", "2026-01-02", "2026-01-03"].map((d) => session(d));
    const rules = addCheckInRule(oneWorkout(), "Reading", "2026-01-03");
    const r = evaluateGoal({ ...small(), rules }, sessions, [], noon("2026-01-03"));
    expect(r.periods[0]).toMatchObject({ state: "met", rules: { w: "met" } });
    expect(r.periods[1].state).toBe("met");
    expect(r.periods[2]).toMatchObject({ state: "pending", rules: { w: "met", reading: "open" } });
  });

  it("a removed rule stops judging from tomorrow", () => {
    const withReading = addCheckInRule(oneWorkout(), "Reading", "2026-01-01");
    const rules = removeRule(withReading, "reading", "2026-01-02");
    const sessions = ["2026-01-01", "2026-01-02", "2026-01-03", "2026-01-04"].map((d) => session(d));
    const ticks = ["2026-01-01", "2026-01-02"].map((day) => ({ ruleKey: "reading", day, workoutLogId: null, excuse: false }));
    const r = evaluateGoal({ ...small(), rules }, sessions, ticks, noon("2026-01-06"));
    expect(r.misses).toBe(0);
    expect("reading" in r.periods[2].rules).toBe(false);
    expect(r.periods[1].rules.reading).toBe("met");
  });

  it("forgetting a tick before a rule was removed still counts as a miss on the days it covered", () => {
    const withReading = addCheckInRule(oneWorkout(), "Reading", "2026-01-01");
    const rules = removeRule(withReading, "reading", "2026-01-02");
    const sessions = ["2026-01-01", "2026-01-02", "2026-01-03"].map((d) => session(d));
    const r = evaluateGoal({ ...small(), rules }, sessions, [], noon("2026-01-06"));
    expect(r.periods[0].state).toBe("missed"); // judged on Jan 1 and left unticked
    expect(r.periods[2].state).toBe("met");
  });
});

describe("timezones decide where a day ends", () => {
  const goal = (tz: string, startDay: string) => ({ startDay, timeZone: tz, rules: oneWorkout() });

  it("counts a session on its local day in UTC+13", () => {
    // 20:30 UTC on Jan 10 is 09:30 on Jan 11 in Auckland (NZDT).
    const s: SessionInput = { id: "a", date: new Date("2026-01-10T20:30:00Z"), durationMin: 50 };
    const r = evaluateGoal(goal("Pacific/Auckland", "2026-01-11"), [s], [], new Date("2026-01-11T09:45:00Z"));
    expect(r.periods[0]).toMatchObject({ day: "2026-01-11", state: "met" });
  });

  it("counts a session on its local day in UTC-10", () => {
    // 05:00 UTC on Jan 11 is 19:00 on Jan 10 in Honolulu.
    const s: SessionInput = { id: "b", date: new Date("2026-01-11T05:00:00Z"), durationMin: 50 };
    const r = evaluateGoal(goal("Pacific/Honolulu", "2026-01-10"), [s], [], new Date("2026-01-11T06:00:00Z"));
    expect(r.periods[0]).toMatchObject({ day: "2026-01-10", state: "met" });
  });

  it("a day closes by the goal's clock, not the server's", () => {
    // 20:00 UTC on Jan 11 is already Jan 12 in Auckland (Jan 10 has closed) but still Jan 11 in New York (it hasn't).
    const now = new Date("2026-01-11T20:00:00Z");
    expect(evaluateGoal(goal("Pacific/Auckland", "2026-01-10"), [], [], now).periods[0].state).toBe("missed");
    expect(evaluateGoal(goal("America/New_York", "2026-01-10"), [], [], now).periods[0].state).toBe("pending");
  });
});

describe("75 Hard end to end", () => {
  it("75 full days complete it once the last day closes", () => {
    const all = Array.from({ length: 75 }, (_, i) => addDays(D1, i));
    const { sessions, checkIns } = days(all);
    const last = all[74];
    const during = evaluateGoal(hard, sessions, checkIns, noon(last));
    const after = evaluateGoal(hard, sessions, checkIns, noon(addDays(last, 2)));
    expect(during).toMatchObject({ suggestion: "keep_going", dayOfGoal: 75 });
    expect(after).toMatchObject({ suggestion: "complete", completedOn: last, misses: 0, streak: { current: 75, best: 75 } });
  });
});

describe("days carried in from before Atlas", () => {
  const carried = (days: number, through: string) => ({ startDay: "2026-01-01", timeZone: TZ, rules: GoalRules.parse({ ...hard.rules, length: { days }, carriedThrough: through }) });

  it("count as met with no sessions or ticks, and today is judged for real", () => {
    const r = evaluateGoal(carried(75, "2026-01-09"), [], [], noon("2026-01-10"));
    expect(r.periods.slice(0, 9).every((p) => p.carried === true && p.state === "met" && Object.values(p.rules).every((s) => s === "met"))).toBe(true);
    expect(r.periods[9]).toMatchObject({ day: "2026-01-10", state: "pending" });
    expect(r.periods[9].carried).toBeUndefined();
    expect(r).toMatchObject({ dayOfGoal: 10, misses: 0, attemptNumber: 1, streak: { current: 9, best: 9 } });
    expect(r.attempts).toEqual([{ fromDay: "2026-01-01", toDay: "2026-01-09", days: 9, current: true }]);
    expect(r.today.map((t) => t.state).every((s) => s === "open")).toBe(true);
  });

  it("are closed: nothing about them can be repaired or undone", () => {
    const r = evaluateGoal(carried(75, "2026-01-09"), [], [], noon("2026-01-10"));
    expect(r.needsDuration).toEqual([]);
    expect(r.periods[8].state).toBe("met");
  });

  it("today then counts in the same attempt as a real day", () => {
    const { sessions, checkIns } = fullDay("2026-01-10");
    const r = evaluateGoal(carried(75, "2026-01-09"), sessions, checkIns, noon("2026-01-10"));
    expect(r).toMatchObject({ dayOfGoal: 10, streak: { current: 10, best: 10 } });
    expect(r.periods[9].state).toBe("met");
  });

  it("a real miss afterwards ends the attempt, and the carried days stay in the earlier one", () => {
    const r = evaluateGoal(carried(75, "2026-01-09"), [], [], noon("2026-01-12")); // Jan 10 closed with nothing
    expect(r.misses).toBe(1);
    expect(r.attempts[0]).toEqual({ fromDay: "2026-01-01", toDay: "2026-01-09", days: 9, current: false });
    expect(r.attempts[1]).toMatchObject({ fromDay: "2026-01-11", current: true });
  });

  it("can't swallow today, whatever it was given", () => {
    const r = evaluateGoal(carried(75, "2026-01-10"), [], [], noon("2026-01-10"));
    expect(r.periods[9].carried).toBeUndefined();
    expect(r.periods[9].state).toBe("pending");
    expect(r.dayOfGoal).toBe(10);
  });

  it("count toward the length: 75 days with 9 carried finishes 66 real days later", () => {
    const real = Array.from({ length: 66 }, (_, i) => addDays("2026-01-10", i));
    const { sessions, checkIns } = days(real);
    const last = real[65];
    const r = evaluateGoal(carried(75, "2026-01-09"), sessions, checkIns, noon(addDays(last, 2)));
    expect(r).toMatchObject({ suggestion: "complete", completedOn: last, misses: 0 });
    expect(last).toBe("2026-03-16");
  });
});
