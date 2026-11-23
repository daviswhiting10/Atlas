import { describe, expect, it } from "vitest";
import { MAX_SECONDS, bumpSeconds, durationLabel, durationRange, formatClock, parseClock, stepSize } from "./duration";

describe("formatClock: seconds as m:ss", () => {
  it("shows minutes and two-digit seconds", () => {
    expect(formatClock(0)).toBe("0:00");
    expect(formatClock(5)).toBe("0:05");
    expect(formatClock(45)).toBe("0:45");
    expect(formatClock(90)).toBe("1:30");
    expect(formatClock(900)).toBe("15:00");
    expect(formatClock(1805)).toBe("30:05");
  });
  it("goes to h:mm:ss at an hour", () => {
    expect(formatClock(3600)).toBe("1:00:00");
    expect(formatClock(3725)).toBe("1:02:05");
  });
  it("is empty for no value", () => {
    expect(formatClock(null)).toBe("");
    expect(formatClock(undefined)).toBe("");
  });
});

describe("parseClock: typed entry in, seconds out", () => {
  it("reads m:ss, m.ss and m ss", () => {
    expect(parseClock("15:30")).toBe(930);
    expect(parseClock("15.30")).toBe(930);
    expect(parseClock("15 30")).toBe(930);
    expect(parseClock("1:5")).toBe(65);
    expect(parseClock("0:45")).toBe(45);
  });
  it("rejects seconds of 60 or more in a clock, and half-typed input", () => {
    expect(parseClock("1:75")).toBeNull();
    expect(parseClock("1:")).toBeNull();
    expect(parseClock("")).toBeNull();
    expect(parseClock("abc")).toBeNull();
  });
  it("reads a unit when one is written", () => {
    expect(parseClock("15 min")).toBe(900);
    expect(parseClock("15m")).toBe(900);
    expect(parseClock("1.5 min")).toBe(90);
    expect(parseClock("90s")).toBe(90);
    expect(parseClock("90 sec")).toBe(90);
  });
  it("reads a bare number as minutes for steady cardio and seconds for a hold", () => {
    expect(parseClock("15", "min")).toBe(900);
    expect(parseClock("15", "sec")).toBe(15);
    expect(parseClock("45")).toBe(45);
  });
  it("a bare number too big to be minutes is seconds, so 900 still means 15:00", () => {
    expect(parseClock("900", "min")).toBe(900);
    expect(parseClock("240", "min")).toBe(14400);
    expect(parseClock("241", "min")).toBe(241);
  });
  it("stays under the ceiling", () => {
    expect(parseClock("99999")).toBe(MAX_SECONDS);
    expect(parseClock("999 min")).toBe(MAX_SECONDS);
  });
  it("round-trips: what is shown reads back as the same seconds", () => {
    for (const s of [0, 5, 30, 45, 59, 60, 61, 90, 600, 900, 930, 1800, 3599]) expect(parseClock(formatClock(s))).toBe(s);
  });
});

describe("the stepper: 30 s, then 1 min above 10 minutes", () => {
  it("steps by 30 up to ten minutes", () => {
    expect(bumpSeconds(0, 1)).toBe(30);
    expect(bumpSeconds(30, 1)).toBe(60);
    expect(bumpSeconds(570, 1)).toBe(600);
    expect(bumpSeconds(600, -1)).toBe(570);
  });
  it("steps by 60 above ten minutes", () => {
    expect(bumpSeconds(600, 1)).toBe(660);
    expect(bumpSeconds(660, 1)).toBe(720);
    expect(bumpSeconds(720, -1)).toBe(660);
    expect(bumpSeconds(660, -1)).toBe(600);
    expect(stepSize(600, 1)).toBe(60);
    expect(stepSize(600, -1)).toBe(30);
  });
  it("lands on the grid from an off-grid value", () => {
    expect(bumpSeconds(15, 1)).toBe(30);
    expect(bumpSeconds(15, -1)).toBe(0);
    expect(bumpSeconds(45, 1)).toBe(60);
    expect(bumpSeconds(45, -1)).toBe(30);
    expect(bumpSeconds(850, 1)).toBe(900);
    expect(bumpSeconds(850, -1)).toBe(840);
  });
  it("never goes below 0 or past the ceiling; nothing yet starts at 0:30", () => {
    expect(bumpSeconds(0, -1)).toBe(0);
    expect(bumpSeconds(20, -1)).toBe(0);
    expect(bumpSeconds(MAX_SECONDS, 1)).toBe(MAX_SECONDS);
    expect(bumpSeconds(null, 1)).toBe(30);
    expect(bumpSeconds(null, -1)).toBe(0);
  });
  it("0:15 to 15:00 is 0:30 ... 10:00 then minutes: 20 + 5 taps", () => {
    let v = 15;
    let taps = 0;
    while (v < 900) {
      v = bumpSeconds(v, 1);
      taps++;
    }
    expect(v).toBe(900);
    expect(taps).toBe(25);
  });
});

describe("headers: 15 minutes reads as 15 min, not 15 sec", () => {
  it("one time", () => {
    expect(durationLabel(15)).toBe("15 sec");
    expect(durationLabel(45)).toBe("45 sec");
    expect(durationLabel(60)).toBe("1 min");
    expect(durationLabel(900)).toBe("15 min");
    expect(durationLabel(90)).toBe("1:30 min");
    expect(durationLabel(3600)).toBe("1:00:00");
  });
  it("ranges say the unit once", () => {
    expect(durationRange(30, 60)).toBe("30 sec–1 min");
    expect(durationRange(30, 45)).toBe("30–45 sec");
    expect(durationRange(300, 600)).toBe("5–10 min");
    expect(durationRange(900, 900)).toBe("15 min");
  });
});
