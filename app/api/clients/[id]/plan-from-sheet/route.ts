import { NextResponse } from "next/server";
import { z } from "zod";
import { withWorkspace } from "@/lib/api/middleware";
import { prisma } from "@/lib/db/client";
import { ROSTER } from "@/lib/db/roster";
import { callAI, MODELS } from "@/lib/ai/client";
import { buildProgramSheetPrompt } from "@/lib/ai/prompts/program-import";
import { readGrid } from "@/lib/programs/sheet-plan";
import { NO_CONTEXT, contextFromText, contextWarnings, describeReadAs, mergeContext, modelContextFromReply } from "@/lib/programs/plan-context";
import { saveSheetPlan } from "@/lib/programs/save-sheet-plan";
import { SheetError, fetchSheetCsv, parseSheetLink, tidyCsv } from "@/lib/programs/sheet";
import { CATEGORIES } from "@/lib/programs/categories";
import { rateLimiter } from "@/lib/password";

export const maxDuration = 120;

const Body = z.object({
  sheetUrl: z.string().max(2000).optional(),
  csv: z.string().max(1_000_000).optional(),
  /** When week 1 began. Left out, it's worked out from the weeks the sheet shows as done. */
  weekOneStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  name: z.string().trim().max(120).optional(),
  /** The coach's note: "4 week block, start fresh". */
  notes: z.string().trim().max(1000).optional(),
});

/** Reading a plan costs an AI call; this keeps one workspace from running up the bill. */
const perWorkspace = rateLimiter(20, 60 * 60_000);

/**
 * A client's plan from the coach's own spreadsheet: read it (Google Sheets
 * link or CSV), save it to the coach's library, and open it for this client
 * as a draft to check and assign.
 */
export const POST = withWorkspace<{ id: string }>(async (req, { workspaceId, userId }, { params }) => {
  const { id } = await params;
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success || (!parsed.data.sheetUrl && !parsed.data.csv)) {
    return NextResponse.json({ error: "Paste a Google Sheets link or choose a CSV file." }, { status: 400 });
  }

  const client = await prisma.clientProfile.findFirst({ where: { id, workspaceId, deletedAt: null, ...ROSTER }, select: { id: true, fullName: true, primaryGoal: true } });
  if (!client) return NextResponse.json({ error: "Client not found" }, { status: 404 });
  if (!perWorkspace(workspaceId)) return NextResponse.json({ error: "That's a lot of plans this hour. Try again shortly." }, { status: 429 });

  // 1. The sheet's contents.
  let csv: string;
  if (parsed.data.sheetUrl) {
    const link = parseSheetLink(parsed.data.sheetUrl);
    if (!link) return NextResponse.json({ error: "That isn't a Google Sheets link. Copy it from the sheet's address bar or its Share button." }, { status: 400 });
    try {
      csv = await fetchSheetCsv(link);
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

  // The coach's note beats what the sheet suggests (e.g. "start fresh" ignores last block's loads).
  const context = notes ? mergeContext(contextFromText(notes), modelContext) : NO_CONTEXT;

  // 3. Into the library under the client's goal, then a draft for the client with the weeks already done logged.
  const category = CATEGORIES.find((c) => c.goalCode === client.primaryGoal)?.tag;
  const first = client.fullName.split(" ")[0];
  try {
    const saved = await saveSheetPlan({
      workspaceId,
      clientId: client.id,
      grid,
      name: parsed.data.name || grid.programName || `${first}'s plan`,
      goals: category ? [category] : [],
      weekOneStart: parsed.data.weekOneStart ? new Date(`${parsed.data.weekOneStart}T00:00:00`) : null,
      context,
    });
    return NextResponse.json({
      ...saved,
      readAs: describeReadAs({ weeks: saved.weeks, days: saved.days, startAtWeek: Math.min(saved.weeksDone + 1, saved.weeks) }),
      warnings: contextWarnings(context, { days: saved.days }, "sheet"),
    });
  } catch (err) {
    console.error("[plan-from-sheet] save failed:", err);
    return NextResponse.json({ error: "Read the sheet, but couldn't save the plan. Please try again." }, { status: 500 });
  }
});
