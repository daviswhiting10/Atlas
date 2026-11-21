import { describe, expect, it } from "vitest";
import { noteHistory } from "./note-history";

const w = (id: string, name: string, week: number, note?: [string, string]) => ({ id, name, week, sessionNote: note ? { date: note[0], text: note[1] } : null });

describe("noteHistory", () => {
  const plan = [
    w("a1", "Upper A", 1, ["2026-11-02", "Bench felt heavy"]),
    w("b1", "Lower A", 1, ["2026-11-03", "Knee ok"]),
    w("a2", "Upper A", 2, ["2026-11-09", "  "]),
    w("a3", "upper a", 3, ["2026-11-16", "Add a set of rows"]),
    w("a4", "Upper A", 4),
  ];
  it("lists past sessions' notes of the same workout, newest first", () => {
    const h = noteHistory(plan);
    expect(h.get("a4")).toEqual([
      { week: 3, date: "2026-11-16", text: "Add a set of rows" },
      { week: 1, date: "2026-11-02", text: "Bench felt heavy" },
    ]);
    expect(h.get("b1")).toEqual([{ week: 1, date: "2026-11-03", text: "Knee ok" }]);
  });
  it("never shows a later week's note on an earlier workout, and skips empty notes", () => {
    expect(noteHistory(plan).get("a1")).toEqual([{ week: 1, date: "2026-11-02", text: "Bench felt heavy" }]);
    expect(noteHistory(plan).get("a2")!.map((n) => n.week)).toEqual([1]);
  });
  it("keeps the history short", () => {
    const many = Array.from({ length: 9 }, (_, i) => w(`x${i}`, "Upper A", i + 1, [`2026-11-${String(i + 1).padStart(2, "0")}`, `note ${i}`]));
    expect(noteHistory(many, 3).get("x8")!.map((n) => n.text)).toEqual(["note 8", "note 7", "note 6"]);
  });
});
