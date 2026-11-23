import { NextResponse } from "next/server";
import { z } from "zod";
import { withWorkspace } from "@/lib/api/middleware";
import { prisma } from "@/lib/db/client";
import { ROSTER } from "@/lib/db/roster";
import { callAI, MODELS } from "@/lib/ai/client";
import { buildProgramSheetPrompt } from "@/lib/ai/prompts/program-import";
import { plannedCount, readGrid } from "@/lib/programs/sheet-plan";
import { summarizeSheetImport } from "@/lib/programs/sheet-summary";
import { NO_CONTEXT, pagesContext, contextFromText, contextWarnings, describeReadAs, mergeContext, modelContextFromReply, type PlanContext } from "@/lib/programs/plan-context";
import { saveSheetPlan } from "@/lib/programs/save-sheet-plan";
import { SheetError, fetchSheetPlan, parseSheetLink, tidyCsv } from "@/lib/programs/sheet";
import { CATEGORIES } from "@/lib/programs/categories";
import { rateLimiter } from "@/lib/password";
import { CHOOSE_A_FILE, NO_EXERCISES, PlanFileError, planFileFromForm, readPlanFile } from "@/lib/programs/read-plan-file";

export const maxDuration = 120;

const Context = z.object({
  durationWeeks: z.number().int().min(1).max(52).nullable(),
  trainingDays: z.number().int().min(1).max(7).nullable(),
  startAtWeek: z.number().int().min(1).max(52).nullable(),
});

const Body = z.object({
  /** "read": read the sheet and say what importing it will do (nothing is saved). "save": save what was read. */
  step: z.enum(["read", "save"]).default("read"),
  sheetUrl: z.string().max(2000).optional(),
  csv: z.string().max(1_000_000).optional(),
  /** save: the grid and context the read step returned, as the coach confirmed them. */
  grid: z.unknown().optional(),
  context: Context.optional(),
  /** save: import the weeks the sheet shows as done as finished sessions (source IMPORT). */
  history: z.boolean().default(false),
  /** save: loads in the plan are each week's target weights (a PDF or screenshots of a plan), not sessions done. */
  targets: z.boolean().default(false),
  /** When week 1 began. Left out, it's worked out from the weeks the sheet shows as done. */
  weekOneStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  name: z.string().trim().max(120).optional(),
  /** The coach's note: "4 week block, start fresh". */
  notes: z.string().trim().max(1000).optional(),
});

/** Reading a plan costs an AI call; this keeps one workspace from running up the bill. */
const perWorkspace = rateLimiter(20, 60 * 60_000);

/** A PDF or screenshots (targets): week 1 with nothing done, or the week the coach's note names (see pagesContext). */
const pagesRule = (context: PlanContext, targets: boolean): PlanContext => (targets ? pagesContext(context) : context);

/**
 * A client's plan from the coach's own spreadsheet, in two steps:
 *  1. read: the sheet (Google Sheets link, or CSV the browser made from an
 *     .xlsx or .csv) is read into a grid, and the reply says what importing
 *     it will do, including the sessions "Import completed weeks as history"
 *     would backdate. Nothing is saved.
 *  2. save: the grid comes back as confirmed, is saved to the coach's library,
 *     and opens for this client as a draft to check and assign. No second AI call.
 */
export const POST = withWorkspace<{ id: string }>(async (req, { workspaceId, userId }, { params }) => {
  const { id } = await params;
  // A PDF or screenshots (multipart): the shared reader, into the same grid as a sheet, so each week is read as written.
  if ((req.headers.get("content-type") ?? "").includes("multipart/form-data")) return readFiles(req, id, { workspaceId, userId });
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Drop an .xlsx or .csv file, or paste a Google Sheets link." }, { status: 400 });

  const client = await prisma.clientProfile.findFirst({ where: { id, workspaceId, deletedAt: null, ...ROSTER }, select: { id: true, fullName: true, primaryGoal: true } });
  if (!client) return NextResponse.json({ error: "Client not found" }, { status: 404 });

  const weekOneStart = parsed.data.weekOneStart ? new Date(`${parsed.data.weekOneStart}T00:00:00`) : null;

  if (parsed.data.step === "save") {
    // The grid as read in step 1, run through the same checks as the model's reply.
    const grid = parsed.data.grid ? readGrid(JSON.stringify(parsed.data.grid)) : null;
    if (!grid) return NextResponse.json({ error: "Read the sheet again, then save." }, { status: 400 });
    return save(client, { workspaceId, grid, name: parsed.data.name, weekOneStart, context: pagesRule(parsed.data.context ?? NO_CONTEXT, parsed.data.targets), history: parsed.data.targets ? false : parsed.data.history, targets: parsed.data.targets });
  }

  if (!parsed.data.sheetUrl && !parsed.data.csv) {
    return NextResponse.json({ error: "Drop an .xlsx or .csv file, or paste a Google Sheets link." }, { status: 400 });
  }
  if (!perWorkspace(workspaceId)) return NextResponse.json({ error: "That's a lot of plans this hour. Try again shortly." }, { status: 429 });

  // 1. The sheet's contents.
  let csv: string;
  let sheetTab: string | null = null;
  let sheetNote: string | null = null;
  if (parsed.data.sheetUrl) {
    const link = parseSheetLink(parsed.data.sheetUrl);
    if (!link) return NextResponse.json({ error: "That isn't a Google Sheets link. Copy it from the sheet's address bar or its Share button." }, { status: 400 });
    try {
      ({ csv, tab: sheetTab, note: sheetNote } = await fetchSheetPlan(link));
    } catch (err) {
      return NextResponse.json({ error: err instanceof SheetError ? err.message : "Couldn't read that sheet." }, { status: 400 });
    }
  } else {
    csv = parsed.data.csv!;
  }
  const tidy = tidyCsv(csv);
  if (tidy.length < 10) return NextResponse.json({ error: "That sheet looks empty." }, { status: 400 });

  // 2. Transcribe the grid. Reading it (weeks, loads, what's done) happens by rule in lib/programs/sheet-plan.
  const notes = parsed.data.notes || undefined;
  const { system, user } = buildProgramSheetPrompt(tidy, notes);
  let grid;
  let modelContext = NO_CONTEXT;
  try {
    const result = await callAI({ system, user, model: MODELS.sonnet, maxTokens: 16000, feature: "program-sheet-import", workspaceId, userId });
    grid = readGrid(result.content);
    modelContext = modelContextFromReply(result.content);
  } catch (err) {
    console.error("[plan-from-sheet] AI call failed:", err);
    return NextResponse.json({ error: "Couldn't read the plan right now. Please try again." }, { status: 502 });
  }
  if (!grid) return NextResponse.json({ error: "Couldn't find workouts in that sheet. Check it lists exercises with sets and reps." }, { status: 422 });
  if (plannedCount(grid) === 0) return NextResponse.json({ error: NO_EXERCISES }, { status: 422 });
  if (sheetNote) grid.note = sheetNote;

  // The coach's note beats what the sheet suggests (e.g. "start fresh" ignores last block's loads).
  const context = notes ? mergeContext(contextFromText(notes), modelContext) : NO_CONTEXT;
  const summary = summarizeSheetImport({ grid, context, weekOneStart, today: new Date() });
  return NextResponse.json({
    grid,
    context,
    summary,
    readAs: summary.readAs,
    warnings: [
      ...(sheetTab ? [`Read the "${sheetTab}" tab${sheetNote ? "; the other tabs are kept as a note on the plan" : ""}.`] : []),
      ...contextWarnings(context, { days: summary.daysPerWeek }, "sheet"),
    ],
  });
});

async function save(
  client: { id: string; fullName: string; primaryGoal: string | null },
  input: { workspaceId: string; grid: NonNullable<ReturnType<typeof readGrid>>; name?: string; weekOneStart: Date | null; context: PlanContext; history: boolean; targets: boolean }
) {
  // Into the library under the client's goal, then a draft for the client (and, if asked, the weeks already done as history).
  const category = CATEGORIES.find((c) => c.goalCode === client.primaryGoal)?.tag;
  const first = client.fullName.split(" ")[0];
  try {
    const saved = await saveSheetPlan({
      workspaceId: input.workspaceId,
      clientId: client.id,
      grid: input.grid,
      name: input.name || input.grid.programName || `${first}'s plan`,
      goals: category ? [category] : [],
      weekOneStart: input.weekOneStart,
      context: input.context,
      history: input.history,
      loadsAsTargets: input.targets,
    });
    return NextResponse.json({
      ...saved,
      readAs: describeReadAs({ weeks: saved.weeks, days: saved.days, startAtWeek: Math.min(saved.weeksDone + 1, saved.weeks) }),
    });
  } catch (err) {
    console.error("[plan-from-sheet] save failed:", err);
    return NextResponse.json({ error: "Read the sheet, but couldn't save the plan. Please try again." }, { status: 500 });
  }
}

/** The read step for files (a PDF, screenshots, or a spreadsheet the browser turned into CSV): the shared reader. */
async function readFiles(req: Request, id: string, who: { workspaceId: string; userId: string }) {
  const client = await prisma.clientProfile.findFirst({ where: { id, workspaceId: who.workspaceId, deletedAt: null, ...ROSTER }, select: { id: true } });
  if (!client) return NextResponse.json({ error: "Client not found" }, { status: 404 });
  const form = await req.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: CHOOSE_A_FILE }, { status: 400 });
  const weekOne = String(form.get("weekOneStart") ?? "");
  const weekOneStart = /^\d{4}-\d{2}-\d{2}$/.test(weekOne) ? new Date(`${weekOne}T00:00:00`) : null;
  const notes = String(form.get("notes") ?? "").trim().slice(0, 1000) || undefined;
  try {
    const file = planFileFromForm(form);
    if (!perWorkspace(who.workspaceId)) return NextResponse.json({ error: "That's a lot of plans this hour. Try again shortly." }, { status: 429 });
    const { grid, warnings } = await readPlanFile(file, { ...who, feature: file.csv ? "program-sheet-import" : "program-import", notes });
    // A spreadsheet keeps the sheet rule (a filled-in load is a week done). A PDF or screenshots show a plan: its loads
    // are each week's targets; it starts at week 1 with nothing marked done, unless the coach's note names a week.
    const pages = !file.csv;
    const noted = notes ? contextFromText(notes) : NO_CONTEXT;
    const context = pages ? pagesContext(noted) : noted;
    const summary = summarizeSheetImport({ grid, context, weekOneStart, today: new Date() });
    return NextResponse.json({ grid, context, summary, targets: pages, readAs: summary.readAs, warnings: [...warnings, ...contextWarnings(context, { days: summary.daysPerWeek }, "sheet")] });
  } catch (err) {
    if (err instanceof PlanFileError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
}
