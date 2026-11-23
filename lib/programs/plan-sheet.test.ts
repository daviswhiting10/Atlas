import { describe, expect, it, vi } from "vitest";
import { CHLOE_ROWS, HOW_TO_USE_ROWS, makeXlsx } from "./fixtures/make-xlsx";
import { PLAN_SCORE, noteFromTabs, pickPlanPages, pickPlanTab, scoreRows } from "./plan-sheet";
import { readWorkbook, xlsxPlan, xlsxToCsv } from "./xlsx";
import { plannedCount, readGrid } from "./sheet-plan";
import { fetchSheetPlan, parseSheetLink } from "./sheet";

const INTAKE_ROWS = [
  ["Client intake"],
  ["Name", "Chloe"],
  ["Goal", "Build glutes and get stronger on hip thrusts"],
  ["Injuries", "Old left ankle sprain, fine now"],
  ["Days per week", "4"],
];
const WEEK_COLUMNS_ROWS = [
  ["", "Exercise", "Wk 1", "Wk 2", "Wk 3", "Wk 4"],
  ["Day 1"],
  ["A", "Back Squat", "3x8", "3x8", "4x6", "4x6"],
  ["B", "RDL", "3x10", "3x10", "3x8", "3x8"],
  ["Day 2"],
  ["A", "Bench Press", "3x8", "3x8", "4x6", "4x6"],
];

describe("which tab holds the plan", () => {
  it("Chloe's sheet pattern scores as a plan; a how-to and an intake don't", () => {
    expect(scoreRows(CHLOE_ROWS)).toBeGreaterThanOrEqual(PLAN_SCORE);
    expect(scoreRows(WEEK_COLUMNS_ROWS)).toBeGreaterThanOrEqual(PLAN_SCORE);
    expect(scoreRows(HOW_TO_USE_ROWS)).toBeLessThan(PLAN_SCORE);
    expect(scoreRows(INTAKE_ROWS)).toBeLessThan(PLAN_SCORE);
  });

  it("2 tabs, 'How to use' first: imports 'Program', keeps the how-to as the plan's note", () => {
    const out = xlsxPlan(makeXlsx([{ name: "How to use", rows: HOW_TO_USE_ROWS }, { name: "Program", rows: CHLOE_ROWS }]));
    expect(out.tab).toBe("Program");
    expect(out.tabs).toBe(2);
    expect(out.csv).toContain("Barbell Hip Thrust");
    expect(out.csv).toContain("DAY 1 · GLUTES & HAMSTRINGS");
    expect(out.csv).not.toContain("How to use");
    expect(out.note).toMatch(/^How to use:\n/);
    expect(out.note).toContain("Train 4 days a week");
  });

  it("3 tabs with the plan on the third: imports tab 3, notes from tabs 1 and 2", () => {
    const out = xlsxPlan(
      makeXlsx([
        { name: "How to use", rows: HOW_TO_USE_ROWS },
        { name: "Client intake", rows: INTAKE_ROWS },
        { name: "Program", rows: CHLOE_ROWS },
      ])
    );
    expect(out.tab).toBe("Program");
    expect(out.csv.split("\n")[0]).toContain("Glute Program");
    expect(out.note).toContain("How to use:");
    expect(out.note).toContain("Client intake:");
    expect(out.note).toContain("Build glutes and get stronger");
    // Numbers and one-word cells aren't kept as a note.
    expect(out.note).not.toMatch(/\bChloe\b|^4$/m);
  });

  it("with two plan-like tabs, the one that looks most like a plan wins", () => {
    const short = [["Day 1"], ["Exercise", "Sets", "Reps"], ["Squat", "3", "5"]];
    const { plan } = pickPlanTab([
      { name: "Old block", rows: short },
      { name: "This block", rows: CHLOE_ROWS },
    ]);
    expect(plan?.name).toBe("This block");
  });

  it("a hidden tab is never read; one tab goes as it is; no plan-like tab sends every tab as before", () => {
    const hidden = xlsxPlan(makeXlsx([{ name: "Program", rows: CHLOE_ROWS, hidden: true }, { name: "How to use", rows: HOW_TO_USE_ROWS }]));
    expect(hidden.csv).not.toContain("Hip Thrust");
    const single = xlsxPlan(makeXlsx([{ name: "Program", rows: CHLOE_ROWS }]));
    expect(single).toMatchObject({ tab: null, note: null, tabs: 1 });
    expect(single.csv).toContain("Hip Thrust");
    const none = xlsxPlan(makeXlsx([{ name: "How to use", rows: HOW_TO_USE_ROWS }, { name: "Intake", rows: INTAKE_ROWS }]));
    expect(none.tab).toBeNull();
    expect(none.csv).toContain("Tab: How to use");
    expect(none.csv).toContain("Tab: Intake");
  });

  it("xlsxToCsv still gives every tab (unchanged)", () => {
    const bytes = makeXlsx([{ name: "How to use", rows: HOW_TO_USE_ROWS }, { name: "Program", rows: CHLOE_ROWS }]);
    expect(readWorkbook(bytes).map((t) => t.name)).toEqual(["How to use", "Program"]);
    expect(xlsxToCsv(bytes)).toContain("Tab: How to use");
  });

  it("the note is capped", () => {
    const long = Array.from({ length: 200 }, (_, i) => [`Line ${i}: keep your ribs down and brace before every single rep.`]);
    expect(noteFromTabs([{ name: "Guide", rows: long }])!.length).toBeLessThanOrEqual(2000);
  });
});

describe("which PDF pages hold the plan", () => {
  const cover = "Chloe's Glute Program\nWelcome! Read this page before you start training with the program.";
  const plan1 = "DAY 1 · GLUTES\nBlock  Exercise  Sets  Reps  Rest\n1  Barbell Hip Thrust  3 (Wk 3-4: 4)  8-10  2 min\n2  Romanian Deadlift  3x10  90 sec";
  const plan2 = "DAY 2 · UPPER\nBlock  Exercise  Sets  Reps  Rest\n1  Lat Pulldown  3x10  90 sec";
  const tips = "Recovery tips\nSleep at least seven hours and walk on your rest days to stay loose.";

  it("reads the plan pages wherever they are, and keeps the others as a note", () => {
    expect(pickPlanPages([cover, plan1, plan2, tips], 10)).toEqual({ pages: [2, 3], notePages: [1, 4] });
  });
  it("more plan pages than can be read: the best ones, in page order", () => {
    const out = pickPlanPages([plan2, plan1, plan2, plan1], 2);
    expect(out.pages).toHaveLength(2);
    expect(out.pages).toEqual([...out.pages].sort((a, b) => a - b));
  });
  it("a scanned PDF (no text) or no plan-like page: the first pages, as before", () => {
    expect(pickPlanPages(["", "", ""], 2)).toEqual({ pages: [1, 2], notePages: [] });
    expect(pickPlanPages([cover, tips], 10)).toEqual({ pages: [1, 2], notePages: [] });
  });
});

describe("an empty plan is refused, the note rides along", () => {
  it("plannedCount is 0 when nothing reads as sets and reps", () => {
    const grid = readGrid(JSON.stringify({ days: [{ name: "Day 1", exercises: [{ name: "Hip Thrust", weeks: [{ week: 1, setsReps: "", load: "" }] }] }] }))!;
    expect(plannedCount(grid)).toBe(0);
    const ok = readGrid(JSON.stringify({ days: [{ name: "Day 1", exercises: [{ name: "Hip Thrust", weeks: [{ week: 1, setsReps: "3x10", load: "" }] }] }] }))!;
    expect(plannedCount(ok)).toBe(1);
  });
  it("readGrid keeps the plan's note (capped) for the save step", () => {
    const g = readGrid(JSON.stringify({ note: "How to use:\nWarm up first.", days: [{ name: "Day 1", exercises: [{ name: "Squat", weeks: [{ week: 1, setsReps: "3x5", load: "" }] }] }] }))!;
    expect(g.note).toBe("How to use:\nWarm up first.");
    expect(readGrid(JSON.stringify({ note: "x".repeat(5000), days: g.days }))!.note!.length).toBe(2000);
  });
});

describe("the shared reader: tab, note and the empty-plan refusal", () => {
  vi.mock("@/lib/ai/client", () => ({
    MODELS: { sonnet: "sonnet" },
    callAIVision: vi.fn(),
    callAI: vi.fn(async ({ user }: { user: string }) => ({
      content: JSON.stringify({
        days: [{ name: "DAY 1", exercises: [{ name: "Barbell Hip Thrust", weeks: [{ week: 1, setsReps: user.includes("EMPTY") ? "" : "3x8-10", load: "" }] }] }],
      }),
    })),
  }));

  it("puts the other tabs' note on the grid and says which tab it read", async () => {
    const { readPlanFile } = await import("./read-plan-file");
    const out = await readPlanFile({ csv: "DAY 1,Barbell Hip Thrust,3,8-10", files: [], tab: "Program", note: "How to use:\nWarm up first." }, { workspaceId: "w", userId: "u", feature: "t" });
    expect(out.grid.note).toBe("How to use:\nWarm up first.");
    expect(out.warnings[0]).toBe('Read the "Program" tab; the other tabs are kept as a note on the plan.');
  });

  it("refuses a file where nothing reads as sets and reps, instead of saving 0 exercises", async () => {
    const { readPlanFile, NO_EXERCISES } = await import("./read-plan-file");
    await expect(readPlanFile({ csv: "EMPTY,Barbell Hip Thrust,,", files: [] }, { workspaceId: "w", userId: "u", feature: "t" })).rejects.toThrow(NO_EXERCISES);
  });

  it("the form carries tab and note only with a spreadsheet", async () => {
    const { planFileFromForm } = await import("./read-plan-file");
    const form = new FormData();
    form.append("csv", "a,b");
    form.append("sheetTab", "Program");
    form.append("sheetNote", "How to use:\nWarm up.");
    expect(planFileFromForm(form)).toMatchObject({ csv: "a,b", tab: "Program", note: "How to use:\nWarm up." });
  });
});

describe("a Google Sheets link to the whole sheet reads every tab", () => {
  it("fetches the .xlsx export and keeps the plan's tab; a link to one tab (gid) reads that tab's CSV", async () => {
    const bytes = makeXlsx([{ name: "How to use", rows: HOW_TO_USE_ROWS }, { name: "Program", rows: CHLOE_ROWS }]);
    const asked: string[] = [];
    const fetcher = (async (url: string) => {
      asked.push(url);
      return url.includes("format=xlsx")
        ? new Response(bytes, { status: 200, headers: { "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" } })
        : new Response("Exercise,Sets\nSquat,3x5", { status: 200, headers: { "content-type": "text/csv" } });
    }) as unknown as typeof fetch;
    const whole = await fetchSheetPlan(parseSheetLink("https://docs.google.com/spreadsheets/d/1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789/edit")!, fetcher);
    expect(asked[0]).toMatch(/\/export\?format=xlsx$/);
    expect(whole.tab).toBe("Program");
    expect(whole.csv).toContain("Barbell Hip Thrust");
    expect(whole.note).toContain("How to use:");
    const one = await fetchSheetPlan(parseSheetLink("https://docs.google.com/spreadsheets/d/1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789/edit#gid=42")!, fetcher);
    expect(asked[1]).toMatch(/format=csv&gid=42$/);
    expect(one).toEqual({ csv: "Exercise,Sets\nSquat,3x5", tab: null, note: null });
  });
});
