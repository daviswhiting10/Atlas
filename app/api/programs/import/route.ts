import { NextResponse } from "next/server";
import { z } from "zod";
import { withWorkspace } from "@/lib/api/middleware";
import { previewFromGrid } from "@/lib/athlete/plan-import";
import { NO_CONTEXT, contextFromText, contextWarnings } from "@/lib/programs/plan-context";
import { CHOOSE_A_FILE, PlanFileError, planFileFromForm, readPlanFile } from "@/lib/programs/read-plan-file";
import { foundInFile } from "@/lib/programs/extract";
import { saveProgramFromGrid } from "@/lib/programs/save-sheet-plan";
import { readGrid } from "@/lib/programs/sheet-plan";
import { summarizeSheetImport } from "@/lib/programs/sheet-summary";
import { rateLimiter } from "@/lib/password";

export const maxDuration = 120;

/** Reading a plan costs an AI call; this keeps one workspace from running up the bill. */
const perWorkspace = rateLimiter(20, 60 * 60_000);

const Context = z.object({ durationWeeks: z.number().int().min(1).max(52).nullable(), trainingDays: z.number().int().min(1).max(7).nullable(), startAtWeek: z.number().int().min(1).max(52).nullable() });
const Save = z.object({ grid: z.unknown(), context: Context.optional(), name: z.string().trim().max(120).optional() });

/**
 * The Programs library's import, in two steps like every importer:
 *  read (multipart): a PDF, screenshots or a spreadsheet's CSV, read by the shared reader. Nothing is saved.
 *  save (JSON): the grid as read becomes a library program, one block per week, each week as written.
 */
export const POST = withWorkspace(async (req, { workspaceId, userId }) => {
  if ((req.headers.get("content-type") ?? "").includes("application/json")) {
    const parsed = Save.safeParse(await req.json().catch(() => null));
    const grid = parsed.success ? readGrid(JSON.stringify(parsed.data.grid)) : null;
    if (!parsed.success || !grid) return NextResponse.json({ error: "Read the plan again, then save." }, { status: 400 });
    try {
      // The library's program is a template: loads written in it are the plan's targets.
      const saved = await saveProgramFromGrid({ workspaceId, grid, name: parsed.data.name || grid.programName || "Imported program", goals: [], context: parsed.data.context ?? NO_CONTEXT, loadsAsTargets: true });
      return NextResponse.json({ id: saved.programId });
    } catch (err) {
      console.error("[programs/import] save failed:", err);
      return NextResponse.json({ error: "Read the plan, but couldn't save it. Please try again." }, { status: 500 });
    }
  }

  const form = await req.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: CHOOSE_A_FILE }, { status: 400 });
  const notes = String(form.get("notes") ?? "").trim().slice(0, 1000) || undefined;
  try {
    const file = planFileFromForm(form);
    if (!perWorkspace(workspaceId)) return NextResponse.json({ error: "That's a lot of plans this hour. Try again shortly." }, { status: 429 });
    const { grid, warnings } = await readPlanFile(file, { workspaceId, userId, feature: file.csv ? "program-sheet-import" : "program-import", notes });
    // A library program starts at week 1: nothing in it is a session done.
    const context = { ...(notes ? contextFromText(notes) : NO_CONTEXT), startAtWeek: 1 };
    const summary = summarizeSheetImport({ grid, context, weekOneStart: null, today: new Date() });
    return NextResponse.json({ grid, context, found: foundInFile(grid), readAs: summary.readAs, preview: previewFromGrid(grid, context), warnings: [...warnings, ...contextWarnings(context, { days: summary.daysPerWeek }, "sheet")] });
  } catch (err) {
    if (err instanceof PlanFileError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
});
