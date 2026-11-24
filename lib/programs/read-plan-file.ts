/**
 * One reader for a plan that arrives as a file, used by every importer (the Programs library, a client's Plan tab, the
 * athlete's Today and You): a spreadsheet's CSV (made in the browser), or images (screenshots, or a PDF's pages drawn
 * on the server). Either way the plan comes back as the same grid, so each week keeps its own sets, reps and loads
 * (lib/programs/sheet-plan reads it). Nothing is saved here.
 */
import { callAI, callAIVision, MODELS, type ImageInput } from "@/lib/ai/client";
import { buildProgramPagesPrompt, buildProgramSheetPrompt } from "@/lib/ai/prompts/program-import";
import { MAX_UPLOAD_BYTES, tooBigMessage } from "@/lib/programs/upload-limits";
import { MAX_PDF_PAGES, PdfError, isPdf, pdfToImages } from "./pdf-pages";
import { PHOTO_TYPES } from "./screenshot-program";
import { plannedCount, type SheetGrid } from "./sheet-plan";
import { extractionToGrid, numberSheetText, parseExtraction } from "./extract";
import { NO_CONTEXT, modelContextFromReply, type PlanContext } from "./plan-context";
import type { ExerciseMatch } from "./dedupe";

export class PlanFileError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

export const CHOOSE_A_FILE = "Choose a PDF, a spreadsheet or screenshots of the plan.";

export type PlanFile = { csv: string; files: File[] };

/** What the browser sent (`csv`, or `file0`, `file1`…), checked for size before anything is read. */
export function planFileFromForm(form: FormData): PlanFile {
  const files = Array.from(form.entries())
    .filter(([k, v]) => /^(file|image)\d+$/.test(k) && v instanceof File)
    .map(([, v]) => v as File);
  const csv = typeof form.get("csv") === "string" ? (form.get("csv") as string) : "";
  if (files.length === 0 && !csv) throw new PlanFileError(CHOOSE_A_FILE, 400);
  const bytes = files.reduce((n, f) => n + f.size, 0);
  if (bytes > MAX_UPLOAD_BYTES) throw new PlanFileError(tooBigMessage(bytes, files.some((f) => f.type === "application/pdf")), 413);
  return { csv, files };
}

/** Nothing read as a workout: refused plainly, never saved as an empty plan. */
export const NO_WORKOUTS = "Couldn't find any workouts in that file, so nothing was saved. Check it lists exercises with sets and reps.";

type Who = { workspaceId: string; userId: string; feature: string; notes?: string };

/** A spreadsheet's text (one tab, or every tab headed "Tab: <name>"), read into the plan grid. */
export type ReadPlan = {
  grid: SheetGrid;
  warnings: string[];
  /** What the coach's note says, as the model read it. */
  modelContext: PlanContext;
  /** Names that are a library exercise with a cue in them, for the coach to confirm (lib/programs/dedupe). */
  matches: ExerciseMatch[];
};

export async function readSheetText(csv: string, opts: Who): Promise<ReadPlan> {
  // Numbered before anything is dropped, so row numbers match the sheet the coach sees.
  const numbered = numberSheetText(csv);
  if (numbered.length < 10) throw new PlanFileError("That sheet looks empty.", 400);
  const { system, user } = buildProgramSheetPrompt(numbered, opts.notes);
  const reply = await ask(() => callAI({ system, user, model: MODELS.sonnet, maxTokens: 16000, feature: opts.feature, workspaceId: opts.workspaceId, userId: opts.userId }));
  const grid = toGrid(reply);
  return { grid, warnings: [], modelContext: opts.notes ? modelContextFromReply(reply) : NO_CONTEXT, matches: await matchesFor(grid, opts.workspaceId) };
}

export async function readPlanFile({ csv, files }: PlanFile, opts: Who): Promise<ReadPlan> {
  if (csv) return readSheetText(csv, opts);
  const warnings: string[] = [];
  const images: ImageInput[] = [];
  const texts: string[] = [];
  try {
    for (const f of files) {
      const bytes = new Uint8Array(await f.arrayBuffer());
      if (f.type === "application/pdf" || isPdf(bytes)) {
        const pdf = await pdfToImages(bytes);
        images.push(...pdf.images);
        texts.push(...pdf.texts);
        if (pdf.truncated) warnings.push(`Read the first ${MAX_PDF_PAGES} of ${pdf.pages} pages.`);
      } else if (PHOTO_TYPES.includes(f.type)) {
        images.push({ base64: Buffer.from(bytes).toString("base64"), mediaType: f.type as ImageInput["mediaType"] });
        texts.push("");
      } else {
        throw new PlanFileError(CHOOSE_A_FILE, 400);
      }
    }
  } catch (err) {
    if (err instanceof PlanFileError) throw err;
    if (err instanceof PdfError) throw new PlanFileError(err.message, 400);
    throw err;
  }
  if (images.length > MAX_PDF_PAGES) {
    images.length = MAX_PDF_PAGES;
    texts.length = MAX_PDF_PAGES;
  }
  const { system, user } = buildProgramPagesPrompt(images.length, opts.notes, texts);
  const reply = await ask(() => callAIVision({ system, user, images, model: MODELS.sonnet, maxTokens: 16000, feature: opts.feature, workspaceId: opts.workspaceId, userId: opts.userId }));
  const grid = toGrid(reply);
  return { grid, warnings, modelContext: opts.notes ? modelContextFromReply(reply) : NO_CONTEXT, matches: await matchesFor(grid, opts.workspaceId) };
}

async function ask(call: () => Promise<{ content: string }>): Promise<string> {
  try {
    return (await call()).content;
  } catch (err) {
    console.error("[read-plan-file] read failed:", err);
    throw new PlanFileError("Couldn't read the plan right now. Please try again.", 502);
  }
}

/** The model's reply as the plan grid. No workouts, or nothing that reads as sets and reps: refused plainly. */
function toGrid(reply: string): SheetGrid {
  const extracted = parseExtraction(reply);
  if (!extracted || extracted.workouts.length === 0) throw new PlanFileError(NO_WORKOUTS, 422);
  const grid = extractionToGrid(extracted);
  if (plannedCount(grid) === 0) throw new PlanFileError(NO_WORKOUTS, 422);
  return grid;
}

/** Suggestions are a help, never a reason the read fails. */
async function matchesFor(grid: SheetGrid, workspaceId: string): Promise<ExerciseMatch[]> {
  try {
    // Loaded here, not at the top: the library read is the only part of the reader that needs the database.
    const { exerciseMatches } = await import("./dedupe-server");
    return await exerciseMatches(grid, workspaceId);
  } catch (err) {
    console.error("[read-plan-file] exercise matches failed:", err);
    return [];
  }
}
