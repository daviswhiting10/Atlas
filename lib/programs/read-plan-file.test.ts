import { readFileSync, existsSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

// The reader calls the model through the AI client, which opens the database: not needed to check the form.
vi.mock("@/lib/ai/client", () => ({ callAI: vi.fn(), callAIVision: vi.fn(), MODELS: {} }));

import { CHOOSE_A_FILE, PlanFileError, planFileFromForm } from "./read-plan-file";

const read = (p: string) => readFileSync(new URL(`../../${p}`, import.meta.url), "utf8");

describe("planFileFromForm", () => {
  it("takes a spreadsheet's CSV or files, and refuses an empty form", () => {
    const sheet = new FormData();
    sheet.append("csv", "Day,Exercise\nMon,Squat");
    expect(planFileFromForm(sheet).csv).toContain("Squat");
    const pages = new FormData();
    pages.append("file0", new File([new Uint8Array(10)], "a.png", { type: "image/png" }));
    pages.append("file1", new File([new Uint8Array(10)], "b.png", { type: "image/png" }));
    expect(planFileFromForm(pages).files).toHaveLength(2);
    expect(() => planFileFromForm(new FormData())).toThrow(CHOOSE_A_FILE);
  });
  it("refuses more than the host takes, with the size and what to do (413)", () => {
    const big = new FormData();
    big.append("file0", new File([new Uint8Array(6_200_000)], "plan.pdf", { type: "application/pdf" }));
    try {
      planFileFromForm(big);
      throw new Error("no error");
    } catch (e) {
      expect(e).toBeInstanceOf(PlanFileError);
      expect((e as PlanFileError).status).toBe(413);
      expect((e as Error).message).toMatch(/6\.2 MB.*screenshots/);
    }
  });
});

describe("one importer (static)", () => {
  it("every importer uses the shared drop zone", () => {
    for (const f of ["components/athlete/AthleteImport.tsx", "components/coach/SheetPlanUpload.tsx", "app/(dashboard)/programs/import/page.tsx"]) {
      expect(read(f)).toContain("<PlanDropZone");
    }
    // Today and You reach it through AthleteImport.
    expect(read("components/athlete/NoPlanCard.tsx")).toContain("<AthleteImport");
    expect(read("components/athlete/PlanWizard.tsx")).toContain("<AthleteImport");
  });
  it("every import route reads through the shared reader, week by week, and the flat photo reader is gone", () => {
    for (const f of ["app/api/athlete/plan-import/route.ts", "app/api/clients/[id]/plan-from-sheet/route.ts", "app/api/programs/import/route.ts"]) {
      expect(read(f)).toContain("readPlanFile(");
    }
    expect(existsSync(new URL("../../app/api/ai/program-import/route.ts", import.meta.url))).toBe(false);
    expect(read("lib/ai/prompts/program-import.ts")).not.toContain("buildProgramImportPrompt");
  });
});
