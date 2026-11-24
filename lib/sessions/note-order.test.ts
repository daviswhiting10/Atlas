import { describe, expect, it } from "vitest";
import { labelledNotes } from "./note-order";

const both = { coach: "Great bar path.", athlete: "Shoulder felt tight." };

describe("a session's notes: the other side's first", () => {
  it("a coach reads the athlete's note, then their own", () => {
    expect(labelledNotes(both, "coach", { athlete: "Alex" }).map((n) => [n.label, n.text])).toEqual([["Alex", "Shoulder felt tight."], ["Coach", "Great bar path."]]);
  });
  it("an athlete reads the coach's note, then their own", () => {
    expect(labelledNotes(both, "athlete", { coach: "Jess", athlete: "You" }).map((n) => n.label)).toEqual(["Coach Jess", "You"]);
  });
  it("one note alone is just that note, for either viewer", () => {
    expect(labelledNotes({ coach: "x", athlete: null }, "coach").map((n) => n.role)).toEqual(["COACH"]);
    expect(labelledNotes({ coach: null, athlete: "y" }, "athlete").map((n) => n.role)).toEqual(["ATHLETE"]);
  });
  it("no notes: nothing", () => {
    expect(labelledNotes({ coach: null, athlete: null }, "coach")).toEqual([]);
  });
});
