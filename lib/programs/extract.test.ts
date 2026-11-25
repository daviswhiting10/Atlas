import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { extractionToGrid, foundInFile, numberSheetText, parseExtraction } from "./extract";
import { xlsxToCsv } from "./xlsx";
import { shapeSheet } from "./sheet-summary";
import { SEVEN_TABS, makeXlsx } from "./fixtures/make-xlsx";

const fixture = (f: string) => join(__dirname, "fixtures", f);
const chloeXlsx = () => new Uint8Array(readFileSync(fixture("chloe-4wk-glute.xlsx")));
/** What the reader returned for Chloe's sheet (recorded from a real run), so the conversion is tested without the model. */
const chloeReply = () => readFileSync(fixture("chloe-4wk-glute.reply.json"), "utf8");

describe("every tab goes to the reader, with row numbers", () => {
  it("Chloe's sheet: rows keep their numbers, the week overview and all four DAY tables are there", () => {
    const text = numberSheetText(xlsxToCsv(chloeXlsx()));
    expect(text).toMatch(/^1,Chloe · 4-Week Glute Focus Program/m);
    expect(text).toMatch(/^4,Week,Main lift sets,/m);
    for (const [row, day] of [[10, "DAY 1"], [22, "DAY 2"], [34, "DAY 3"], [46, "DAY 4"]] as const) expect(text).toMatch(new RegExp(`^${row},${day} · `, "m"));
    expect(text).toMatch(/^15,Block 1,Barbell hip thrust,3 \(Wk 3-4: 4\),8-10,2 min,/m);
    // Empty rows are left out; their numbers aren't reused.
    expect(text).not.toMatch(/^3,/m);
  });

  it("several tabs: each headed, each numbered from its own row 1", () => {
    const text = numberSheetText(xlsxToCsv(makeXlsx(SEVEN_TABS)));
    expect(text.match(/^Tab: /gm)).toHaveLength(7);
    expect(text).toMatch(/^Tab: Sunday\n1,Sunday: Mobility/m);
  });
});

describe("Chloe's sheet, as read (recorded reply)", () => {
  const grid = () => extractionToGrid(parseExtraction(chloeReply())!);

  it("4 workouts with the right number of exercises; the week overview is not a workout", () => {
    const found = foundInFile(grid());
    expect(found.workouts.map((w) => w.exercises)).toEqual([9, 9, 9, 10]);
    expect(found.workouts.map((w) => w.name.slice(0, 5))).toEqual(["DAY 1", "DAY 2", "DAY 3", "DAY 4"]);
    expect(grid().days.flatMap((d) => d.exercises.map((e) => e.name))).not.toContain("Week 1");
  });

  it("the week overview and the title's notes become the plan's note", () => {
    expect(grid().note).toMatch(/Week 1/);
    expect(grid().note).toMatch(/Week 4/);
  });

  it("4 weeks; '3 (Wk 3-4: 4)' is 3 sets in weeks 1-2 and 4 in weeks 3-4", () => {
    const plan = shapeSheet(grid());
    expect(plan.weeks).toHaveLength(4);
    const thrust = (w: number) => plan.weeks[w - 1].days[0].entries.find((e) => e.exercise === "Barbell hip thrust")!;
    expect([1, 2, 3, 4].map((w) => thrust(w).rx.sets)).toEqual([3, 3, 4, 4]);
    expect(thrust(1).rx).toMatchObject({ repMin: 8, repMax: 10, unit: "reps" });
    // An exercise with no bump stays the same every week.
    const abd = plan.weeks[2].days[0].entries.find((e) => /abduction/i.test(e.exercise))!;
    expect(abd.rx.sets).toBe(3);
  });

  it("Block 3a / 3b pair into one superset; warm-ups and cool-down keep their place", () => {
    const day1 = shapeSheet(grid()).weeks[0].days[0].entries;
    const section = (re: RegExp) => day1.find((e) => re.test(e.exercise))!.section;
    expect(section(/back extension/i)).toBe(section(/abduction/i));
    expect(section(/back extension/i)).toMatch(/^block:/);
    expect(section(/Glute bridge/)).toBe("warmup");
    expect(section(/Figure-4/)).toBe("cooldown");
    // Day 4's 2a / 2b too.
    const day4 = shapeSheet(grid()).weeks[0].days[3].entries;
    expect(day4.find((e) => /Single-arm dumbbell row/.test(e.exercise))!.section).toBe(day4.find((e) => /chest press/i.test(e.exercise))!.section);
  });

  it("'/side' is one side at a time: the reps stay a number, the note says each side", () => {
    const day1 = shapeSheet(grid()).weeks[0].days[0].entries;
    const kick = day1.find((e) => /kickback/i.test(e.exercise))!;
    expect(kick.rx).toMatchObject({ sets: 2, repMin: 12, unit: "reps" });
    expect(kick.notes).toMatch(/Each side\./);
  });

  it("rest in minutes and seconds becomes seconds; '—' is no rest", () => {
    const day1 = shapeSheet(grid()).weeks[0].days[0].entries;
    const rest = (re: RegExp) => day1.find((e) => re.test(e.exercise))!.rest;
    expect(rest(/hip thrust/)).toBe(120);
    expect(rest(/Romanian/)).toBe(90);
    expect(rest(/abduction/i)).toBe(60);
    expect(rest(/Glute bridge/)).toBeNull();
  });
});

describe("the extraction is checked", () => {
  it("not JSON, or no workouts list: null; values capped; nothing invented", () => {
    expect(parseExtraction("I couldn't read it")).toBeNull();
    expect(parseExtraction(JSON.stringify({ plan_title: "x" }))).toBeNull();
    const ex = parseExtraction(JSON.stringify({ workouts: [{ day_label: "Day 1", exercises: [{ name: "Squat", sets: 99, reps: "5", rest_seconds: 99999 }, { name: "" }] }] }))!;
    expect(ex.workouts[0].exercises).toHaveLength(1);
    expect(ex.workouts[0].exercises[0]).toMatchObject({ sets: null, rest_seconds: null, unilateral: false, superset_group: null });
  });

  it("a 1-tab, 1-workout plan with no day marker: one workout", () => {
    const grid = extractionToGrid({
      plan_title: "Full body",
      plan_notes: "",
      weeks: null,
      uncertain: [],
      workouts: [
        {
          day_label: "",
          exercises: [
            { name: "Goblet squat", block: "", sets: 3, reps: "10", rest_seconds: 90, note: "", unilateral: false, superset_group: null, week_overrides: [], uncertain: [] },
            { name: "Plank", block: "", sets: 3, reps: "30 sec", rest_seconds: null, note: "", unilateral: false, superset_group: null, week_overrides: [], uncertain: ["rest"] },
          ],
        },
      ],
    });
    expect(foundInFile(grid)).toEqual({ workouts: [{ name: "Workout 1", exercises: 2 }], uncertain: ["Workout 1 · Plank: rest", "Workout 1 · Goblet squat: range added, 10 → 8–10", "Workout 1 · Plank: range added, 30 s → 15–30 s"] });
    expect(shapeSheet(grid).weeks[0].days[0].entries[1].rx).toMatchObject({ repMin: 30, unit: "secs" });
  });

  it("AMRAP has no number: one rep as the floor, the words in the note", () => {
    const grid = extractionToGrid({ plan_title: "", plan_notes: "", weeks: 1, uncertain: [], workouts: [{ day_label: "Day 1", exercises: [{ name: "Push-up", block: "", sets: 3, reps: "AMRAP", rest_seconds: null, note: "", unilateral: false, superset_group: null, week_overrides: [], uncertain: [] }] }] });
    const e = shapeSheet(grid).weeks[0].days[0].entries[0];
    expect(e.rx).toMatchObject({ sets: 3, repMin: 1 });
    expect(e.notes).toMatch(/AMRAP/);
  });
});

describe("zero workouts is said plainly, never saved", () => {
  vi.mock("@/lib/ai/client", () => ({ MODELS: { sonnet: "sonnet" }, callAIVision: vi.fn(), callAI: vi.fn(async () => ({ content: JSON.stringify({ plan_title: "", plan_notes: "", weeks: null, workouts: [], uncertain: [] }) })) }));
  it("the reader refuses with a plain message", async () => {
    const { readSheetText, NO_WORKOUTS } = await import("./read-plan-file");
    await expect(readSheetText("How to use,Read this first before you start", { workspaceId: "w", userId: "u", feature: "t" })).rejects.toThrow(NO_WORKOUTS);
  });
});

