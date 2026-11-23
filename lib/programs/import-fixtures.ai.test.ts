/**
 * The real reader (the model) on the import fixtures. Costs a few cents a run, so only when asked:
 *   set -a; . ./.env.local; set +a; ATLAS_AI_TEST=1 npx vitest run lib/programs/import-fixtures.ai.test.ts
 * More files: ATLAS_IMPORT_FILES="path/a.xlsx=4,path/b.pdf=3" (file = expected workouts).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { ONE_WORKOUT, SEVEN_TABS, makeXlsx } from "./fixtures/make-xlsx";

// The reader logs its usage to the database: not here.
vi.mock("@/lib/db/client", () => ({ prisma: { usageLog: { create: async () => ({}) } } }));

const RUN = !!process.env.ATLAS_AI_TEST && !!process.env.ANTHROPIC_API_KEY;
const fixture = (f: string) => join(__dirname, "fixtures", f);
const who = { workspaceId: "test", userId: "test", feature: "import-fixture-test" };

async function readXlsx(bytes: Uint8Array) {
  const { xlsxToCsv } = await import("./xlsx");
  const { readSheetText } = await import("./read-plan-file");
  const { foundInFile } = await import("./extract");
  return foundInFile((await readSheetText(xlsxToCsv(bytes), who)).grid);
}
async function readFiles(files: File[]) {
  const { readPlanFile } = await import("./read-plan-file");
  const { foundInFile } = await import("./extract");
  return foundInFile((await readPlanFile({ csv: "", files }, who)).grid);
}

describe.skipIf(!RUN)("the reader on real layouts", () => {
  it("Chloe's sheet (week overview, then DAY 1-4 tables): 4 workouts, 9 / 9 / 9 / 10 exercises", async () => {
    const found = await readXlsx(new Uint8Array(readFileSync(fixture("chloe-4wk-glute.xlsx"))));
    expect(found.workouts.map((w) => w.exercises)).toEqual([9, 9, 9, 10]);
  }, 180_000);

  it("a 1-tab, 1-workout plan: 1 workout, 4 exercises", async () => {
    const found = await readXlsx(makeXlsx(ONE_WORKOUT));
    expect(found.workouts.map((w) => w.exercises)).toEqual([4]);
  }, 180_000);

  it("a 7-tab plan, one workout per tab: 7 workouts", async () => {
    const found = await readXlsx(makeXlsx(SEVEN_TABS));
    expect(found.workouts).toHaveLength(7);
    expect(found.workouts.every((w) => w.exercises === 2)).toBe(true);
  }, 180_000);

  it("a screenshot of one week of a plan: its workouts", async () => {
    const png = readFileSync(fixture("strength-base-page1.png"));
    const found = await readFiles([new File([png], "week1.png", { type: "image/png" })]);
    expect(found.workouts.length).toBeGreaterThanOrEqual(2);
    expect(found.workouts.every((w) => w.exercises >= 3)).toBe(true);
  }, 180_000);

  const extra = (process.env.ATLAS_IMPORT_FILES ?? "").split(",").filter(Boolean).map((s) => s.split("="));
  it.each(extra)("%s: %s workouts", async (path, n) => {
    const bytes = readFileSync(path);
    const found = /\.xlsx$/i.test(path)
      ? await readXlsx(new Uint8Array(bytes))
      : await readFiles([new File([bytes], path.split("/").pop()!, { type: /\.pdf$/i.test(path) ? "application/pdf" : "image/png" })]);
    expect(found.workouts).toHaveLength(Number(n));
  }, 240_000);
});
