import { describe, expect, it } from "vitest";
import { HONOLULU, onDays, set, sess, TONGA, UTC } from "./fixtures";
import { timelineEvents, type TimelineChapter, type TimelineEvent, type TimelineExercise } from "./timeline";

const run = (sessions: ReturnType<typeof sess>[], today: string, extra: Partial<Parameters<typeof timelineEvents>[1]> = {}) =>
  timelineEvents(sessions, { timeZone: UTC, today, ...extra });
const all = (t: ReturnType<typeof timelineEvents>) => [...t.events, ...t.more.flatMap((m) => m.events)];
const kinds = (t: ReturnType<typeof timelineEvents>, kind: string) => all(t).filter((e) => e.kind === kind);

/** n consecutive days from `start`. */
const consecutive = (start: string, n: number): string[] =>
  Array.from({ length: n }, (_, i) => new Date(Date.parse(`${start}T00:00:00Z`) + i * 86_400_000).toISOString().slice(0, 10));

const BENCH: TimelineExercise = { id: "bench", name: "Bench press", keyLift: true, plate: "bench" };

describe("first session and session counts", () => {
  it("marks the first session and the 10th and 25th, on the day each happened", () => {
    const t = run(onDays(consecutive("2026-01-05", 25)), "2026-01-31");
    expect(t.events.map((e) => [e.day, e.kind, e.title])).toEqual([
      ["2026-01-29", "count", "25 sessions"],
      ["2026-01-14", "count", "10 sessions"],
      ["2026-01-05", "first_session", "First session"],
    ]);
    expect(t.events[0].line).toBe("Your 25th session.");
    expect(t.more).toEqual([]);
  });

  it("then every hundred", () => {
    const counts = kinds(run(onDays(consecutive("2025-01-01", 205)), "2026-01-01", { perMonth: 99 }), "count").map((e) => e.value);
    expect(counts.sort((a, b) => (a as number) - (b as number))).toEqual([10, 25, 50, 100, 200]);
  });

  it("ignores unfinished sessions", () => {
    const t = run([...onDays(consecutive("2026-01-05", 9)), sess("run", "2026-01-20T12:00:00Z", [], { completedAt: null })], "2026-01-31");
    expect(kinds(t, "count")).toEqual([]);
  });

  it("a session logged late moves the numbers: it takes the day it was done", () => {
    const late = sess("late", "2026-01-02T12:00:00Z", [], { completedAt: new Date("2026-02-01T09:00:00Z") });
    const t = run([...onDays(consecutive("2026-01-05", 9)), late], "2026-02-03");
    expect(kinds(t, "first_session")[0].day).toBe("2026-01-02");
    expect(kinds(t, "count")[0]).toMatchObject({ value: 10, day: "2026-01-13" }); // the ninth plus the late one
  });
});

describe("records, plates and firsts", () => {
  const sessions = [
    sess("s1", "2026-03-02T12:00:00Z", [set("bench", 135, 5)]),
    sess("s2", "2026-03-09T12:00:00Z", [set("bench", 185, 5)]),
    sess("s3", "2026-03-16T12:00:00Z", [set("bench", 190, 5)]),
    sess("s4", "2026-03-23T12:00:00Z", [set("bench", 185, 8)]), // lighter: nothing
  ];

  it("a record on a key lift, with the number; the baseline is not one", () => {
    const t = run(sessions, "2026-03-30", { exercises: [BENCH] });
    expect(kinds(t, "record").map((e) => [e.day, e.title, e.line])).toEqual([
      ["2026-03-16", "Bench press 190 lb", "Heaviest set so far."],
      ["2026-03-09", "Bench press 185 lb", "Heaviest set so far."],
    ]);
  });

  it("no records for a lift that isn't a key lift", () => {
    expect(kinds(run(sessions, "2026-03-30", { exercises: [{ id: "bench", name: "Bench press" }] }), "record")).toEqual([]);
  });

  it("the plate thresholds on a main lift, on the first day each was reached", () => {
    const t = run(sessions, "2026-03-30", { exercises: [BENCH] });
    expect(kinds(t, "plate").map((e) => [e.day, e.title, e.line]).sort()).toEqual([
      ["2026-03-02", "First plate on bench", "First set at 135 lb."],
      ["2026-03-09", "185 lb bench", "First set at 185 lb."],
    ]);
  });

  it("the first time of a lift you then did ten times", () => {
    const ten = onDays(consecutive("2026-03-02", 10)).map((s) => ({ ...s, sets: [set("rdl", 135, 8)] }));
    const nine = onDays(consecutive("2026-03-02", 9)).map((s) => ({ ...s, sets: [set("rdl", 135, 8)] }));
    const ex = [{ id: "rdl", name: "Romanian deadlift" }];
    expect(kinds(run(ten, "2026-03-20", { exercises: ex }), "first_lift")[0]).toMatchObject({
      day: "2026-03-02",
      title: "First Romanian deadlift",
      line: "You went on to do it 10 times.",
    });
    expect(kinds(run(nine, "2026-03-20", { exercises: ex }), "first_lift")).toEqual([]);
  });

  it("a record logged late slots in by the day it was done and can stop a later day being a record", () => {
    const lateHeavy = sess("late", "2026-03-03T12:00:00Z", [set("bench", 245, 5)], { completedAt: new Date("2026-03-12T08:00:00Z") });
    const base = [sess("a", "2026-03-02T12:00:00Z", [set("bench", 225, 5)]), sess("b", "2026-03-10T12:00:00Z", [set("bench", 240, 5)])];
    expect(kinds(run(base, "2026-03-15", { exercises: [BENCH] }), "record").map((e) => e.day)).toEqual(["2026-03-10"]);
    expect(kinds(run([...base, lateHeavy], "2026-03-15", { exercises: [BENCH] }), "record").map((e) => e.day)).toEqual(["2026-03-03"]);
  });
});

describe("comebacks", () => {
  it("the first session after 21 or more quiet days, with the quiet stretch", () => {
    const t = run(onDays(["2026-01-05", "2026-01-07", "2026-02-02"]), "2026-02-05");
    const [c] = kinds(t, "comeback");
    expect(c).toMatchObject({ day: "2026-02-02", title: "Back on February 2", line: "First session in four weeks." });
    expect(c.gap).toEqual({ from: "2026-01-08", to: "2026-02-01", days: 25, line: "Three quiet weeks." });
  });

  it("20 quiet days is not a comeback and 21 is", () => {
    expect(kinds(run(onDays(["2026-01-05", "2026-01-26"]), "2026-02-01"), "comeback")).toEqual([]); // 20 quiet days
    const c = kinds(run(onDays(["2026-01-05", "2026-01-27"]), "2026-02-01"), "comeback"); // 21 quiet days
    expect(c).toHaveLength(1);
    expect(c[0].gap?.line).toBe("Three quiet weeks.");
  });

  it("the very first session is never a comeback, and a current quiet stretch isn't one yet", () => {
    expect(kinds(run(onDays(["2026-01-05"]), "2026-03-01"), "comeback")).toEqual([]);
  });

  it("a session logged late can close a gap, and then there is no comeback", () => {
    const late = sess("late", "2026-01-20T12:00:00Z", [], { completedAt: new Date("2026-02-10T09:00:00Z") });
    expect(kinds(run(onDays(["2026-01-05", "2026-02-02"]), "2026-02-12"), "comeback")).toHaveLength(1);
    expect(kinds(run([...onDays(["2026-01-05", "2026-02-02"]), late], "2026-02-12"), "comeback")).toEqual([]);
  });
});

describe("best week and best month", () => {
  const week = (monday: string, n: number) => [0, 1, 2, 3, 4, 5].slice(0, n).map((i) => new Date(Date.parse(`${monday}T00:00:00Z`) + i * 86_400_000).toISOString().slice(0, 10));

  it("a complete week that beats every earlier one, on its last day", () => {
    const days = [...week("2026-01-05", 3), ...week("2026-01-12", 4), ...week("2026-01-19", 4), ...week("2026-01-26", 5)];
    const t = run(onDays(days), "2026-02-10");
    expect(kinds(t, "best_week").map((e) => [e.day, e.value, e.line])).toEqual([
      ["2026-02-01", 5, "5 sessions, the most in a week so far."],
      ["2026-01-18", 4, "4 sessions, the most in a week so far."],
    ]); // the first week has nothing to beat and the equal 4 is not a new best
  });

  it("not the week in progress, and not under three sessions", () => {
    expect(kinds(run(onDays([...week("2026-01-05", 1), ...week("2026-01-12", 2)]), "2026-02-01"), "best_week")).toEqual([]);
    expect(kinds(run(onDays([...week("2026-01-05", 2), ...week("2026-01-12", 5)]), "2026-01-14"), "best_week")).toEqual([]);
  });

  it("a complete month that beats every earlier one", () => {
    const jan = ["2026-01-05", "2026-01-12", "2026-01-19"];
    const feb = consecutive("2026-02-02", 9);
    const t = run(onDays([...jan, ...feb]), "2026-03-05");
    expect(kinds(t, "best_month").map((e) => [e.day, e.title, e.line])).toEqual([["2026-02-28", "Best month", "9 sessions in February, the most in a month so far."]]);
  });
});

describe("chapters", () => {
  const ch: TimelineChapter = { id: "g1", name: "75 Hard", outcome: "completed", startDay: "2026-01-05", endDay: "2026-03-19", line: "Completed. 75 days, third attempt." };

  it("appears on the day it ended, with its own line, and outranks everything in its month", () => {
    const t = run(onDays(consecutive("2026-03-02", 20)), "2026-03-25", { chapters: [ch], perMonth: 2 });
    expect(t.events[t.events.findIndex((e) => e.kind === "chapter")]).toMatchObject({ day: "2026-03-19", title: "75 Hard", line: "Completed. 75 days, third attempt.", chapterId: "g1" });
    expect(t.events.filter((e) => e.day.startsWith("2026-03"))).toHaveLength(2); // the first session (kept) and the chapter
  });

  it("shows even with no sessions at all", () => {
    expect(run([], "2026-03-25", { chapters: [ch] }).events.map((e) => e.kind)).toEqual(["chapter"]);
  });
});

describe("the five-a-month cap", () => {
  it("keeps five by tier, the first session always, and collapses the rest into 'More from March'", () => {
    // Twelve days in March, bench up 5 lb a day: a first session, 11 records, the 10th session, two plates (135, 185)
    // and a "first bench press" (done ten times or more): 16 events
    const sessions = consecutive("2026-03-02", 12).map((d, i) => sess(`s${i}`, `${d}T12:00:00Z`, [set("bench", 135 + 5 * i, 5)]));
    const t = run(sessions, "2026-03-20", { exercises: [BENCH] });

    expect(t.events).toHaveLength(5);
    expect(t.events.map((e) => e.kind).sort()).toEqual(["first_session", "record", "record", "record", "record"]);
    expect(t.events.filter((e) => e.kind === "record").map((e) => e.day)).toEqual(["2026-03-13", "2026-03-12", "2026-03-11", "2026-03-10"]); // the most recent four

    expect(t.more).toHaveLength(1);
    expect(t.more[0].month).toBe("2026-03");
    expect(t.more[0].label).toBe("More from March");
    expect(t.more[0].events).toHaveLength(16 - 5);
    expect(all(t)).toHaveLength(16);
    expect(t.more[0].events.map((e) => e.kind).sort()).toEqual(["count", "first_lift", "plate", "plate", "record", "record", "record", "record", "record", "record", "record"]);
  });

  it("applies per month, so a busy March doesn't crowd out February", () => {
    const feb = consecutive("2026-02-02", 3).map((d, i) => sess(`f${i}`, `${d}T12:00:00Z`, [set("bench", 135 + 5 * i, 5)]));
    const mar = consecutive("2026-03-02", 12).map((d, i) => sess(`m${i}`, `${d}T12:00:00Z`, [set("bench", 160 + 5 * i, 5)]));
    const t = run([...feb, ...mar], "2026-03-20", { exercises: [BENCH] });
    expect(t.events.filter((e) => e.day.startsWith("2026-02")).length).toBeGreaterThan(0);
    expect(t.events.filter((e) => e.day.startsWith("2026-03"))).toHaveLength(5);
  });

  it("lists events newest first", () => {
    const t = run(onDays(consecutive("2026-01-05", 25)), "2026-01-31");
    const days = t.events.map((e) => e.day);
    expect(days).toEqual([...days].sort().reverse());
  });
});

describe("timezones: UTC+13 and UTC-10", () => {
  it("dates events by the athlete's day", () => {
    const tonga = [sess("t", "2026-03-01T12:00:00Z")]; // Mar 2 in Tonga
    expect(run(tonga, "2026-03-05", { timeZone: TONGA }).events[0].day).toBe("2026-03-02");
    expect(run(tonga, "2026-03-05", { timeZone: UTC }).events[0].day).toBe("2026-03-01");
    const honolulu = [sess("h", "2026-03-02T05:00:00Z")]; // Mar 1 in Honolulu
    expect(run(honolulu, "2026-03-05", { timeZone: HONOLULU }).events[0].day).toBe("2026-03-01");
    expect(run(honolulu, "2026-03-05", { timeZone: UTC }).events[0].day).toBe("2026-03-02");
  });

  it("measures a gap in the athlete's own days", () => {
    // Tonga (+13): Jan 5 10:00Z is Jan 5 23:00 and Jan 26 12:00Z is Jan 27 01:00, so 21 quiet days. In UTC the days are Jan 5 and Jan 26: 20.
    const tonga = [sess("a", "2026-01-05T10:00:00Z"), sess("b", "2026-01-26T12:00:00Z")];
    expect(kinds(run(tonga, "2026-02-01", { timeZone: UTC }), "comeback")).toEqual([]);
    expect(kinds(run(tonga, "2026-02-01", { timeZone: TONGA }), "comeback")).toHaveLength(1);

    // Honolulu (-10): Jan 27 05:00Z is Jan 26 19:00, so 20 quiet days there. In UTC the days are Jan 5 and Jan 27: 21.
    const honolulu = [sess("a", "2026-01-05T12:00:00Z"), sess("b", "2026-01-27T05:00:00Z")];
    expect(kinds(run(honolulu, "2026-02-01", { timeZone: UTC }), "comeback")).toHaveLength(1);
    expect(kinds(run(honolulu, "2026-02-01", { timeZone: HONOLULU }), "comeback")).toEqual([]);
  });
});

describe("wording", () => {
  it("is neutral: no exclamation marks and none of the banned words, in any title or line", () => {
    const sessions = [
      ...consecutive("2026-01-05", 30).map((d, i) => sess(`a${i}`, `${d}T12:00:00Z`, [set("bench", 135 + 2.5 * i, 5), set("squat", 135 + 5 * i, 5)])),
      ...consecutive("2026-03-20", 12).map((d, i) => sess(`b${i}`, `${d}T12:00:00Z`, [set("bench", 200 + 5 * i, 5)])),
    ];
    const exercises: TimelineExercise[] = [BENCH, { id: "squat", name: "Back squat", keyLift: true, plate: "squat" }];
    const events = all(run(sessions, "2026-06-01", { exercises, perMonth: 99 }));
    expect(new Set(events.map((e) => e.kind)).size).toBeGreaterThanOrEqual(6);
    const text = events.flatMap((e: TimelineEvent) => [e.title, e.line, e.gap?.line ?? ""]).join(" | ");
    expect(text).not.toMatch(/!/);
    expect(text).not.toMatch(/\b(missed|lost|broke|behind|failed|only)\b/i);
  });
});
