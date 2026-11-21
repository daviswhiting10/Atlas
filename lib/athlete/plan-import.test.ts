import { describe, expect, it } from "vitest";
import { previewFromProgram } from "./plan-import";
import type { ImportedProgram } from "@/lib/programs/screenshot-program";

const ex = (n: number) => Array.from({ length: n }, (_, i) => ({ exerciseId: `e${i}`, order: i + 1, notes: "", prescribedSets: [{ setNumber: 1 }] }));
const program: ImportedProgram = {
  name: "Upper/Lower 4 weeks",
  description: "",
  durationWeeks: 4,
  goals: [],
  conditions: [],
  days: [
    { name: "Monday", dayOfWeek: 1, order: 1, sections: [{ name: "Main", exercises: ex(4) }, { name: "Finisher", exercises: ex(1) }] },
    { name: "Thursday", dayOfWeek: 4, order: 2, sections: [{ name: "Main", exercises: ex(1) }] },
  ],
};

describe("previewFromProgram", () => {
  it("lists each day with its exercise count, for a check before saving", () => {
    const p = previewFromProgram(program, "4 weeks, 2 days a week");
    expect(p.title).toBe("Upper/Lower 4 weeks");
    expect(p.meta).toBe("4 weeks, 2 days a week · 6 exercises");
    expect(p.lines).toEqual(["Monday: 5 exercises", "Thursday: 1 exercise"]);
  });
});
