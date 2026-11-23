import { describe, expect, it } from "vitest";
import { comingNotes, noteForWeek, readWeekNotes, setWeekNote } from "./week-notes";

describe("week notes", () => {
  it("read: checked, one per week (last wins), in week order; anything else dropped", () => {
    expect(readWeekNotes(null)).toEqual([]);
    expect(
      readWeekNotes([{ week: 22, text: "Back to 185" }, { week: 20, title: "Deload week next", text: "Same weights", by: "Coach Jess" }, { week: 20, text: "Half the sets" }, { week: 99, text: "x" }, { week: 3, text: "  " }, "junk"])
    ).toEqual([{ week: 20, text: "Half the sets" }, { week: 22, text: "Back to 185" }]);
  });
  it("this week's note, and the ones still to come", () => {
    const notes = readWeekNotes([{ week: 20, text: "a" }, { week: 21, text: "b" }, { week: 22, text: "c" }]);
    expect(noteForWeek(notes, 20)?.text).toBe("a");
    expect(noteForWeek(notes, 19)).toBeNull();
    expect(comingNotes(notes, 20).map((n) => n.week)).toEqual([21, 22]);
  });
  it("set replaces a week's note; empty text clears it", () => {
    const one = setWeekNote([], 4, "Deload", { by: "Coach Jess" });
    expect(one).toEqual([{ week: 4, text: "Deload", by: "Coach Jess" }]);
    expect(setWeekNote(one, 4, "Heavy")).toEqual([{ week: 4, text: "Heavy" }]);
    expect(setWeekNote(one, 4, "")).toEqual([]);
  });
});
