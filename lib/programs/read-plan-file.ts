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
import { plannedCount, readGrid, type SheetGrid } from "./sheet-plan";
import { MAX_NOTE_CHARS } from "./plan-sheet";
import { tidyCsv } from "./sheet";

export class PlanFileError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

export const CHOOSE_A_FILE = "Choose a PDF, a spreadsheet or screenshots of the plan.";

/** `tab` and `note`: the workbook tab the browser picked as the plan, and the sentences on its other tabs. */
export type PlanFile = { csv: string; files: File[]; tab?: string; note?: string };

/** What the browser sent (`csv`, or `file0`, `file1`…), checked for size before anything is read. */
export function planFileFromForm(form: FormData): PlanFile {
  const files = Array.from(form.entries())
    .filter(([k, v]) => /^(file|image)\d+$/.test(k) && v instanceof File)
    .map(([, v]) => v as File);
  const csv = typeof form.get("csv") === "string" ? (form.get("csv") as string) : "";
  if (files.length === 0 && !csv) throw new PlanFileError(CHOOSE_A_FILE, 400);
  const bytes = files.reduce((n, f) => n + f.size, 0);
  if (bytes > MAX_UPLOAD_BYTES) throw new PlanFileError(tooBigMessage(bytes, files.some((f) => f.type === "application/pdf")), 413);
  const tab = typeof form.get("sheetTab") === "string" ? (form.get("sheetTab") as string).trim().slice(0, 100) : "";
  const note = typeof form.get("sheetNote") === "string" ? (form.get("sheetNote") as string).trim().slice(0, MAX_NOTE_CHARS) : "";
  return { csv, files, ...(csv && tab ? { tab } : {}), ...(csv && note ? { note } : {}) };
}

/** No exercise read as sets and reps: refused, never saved as an empty plan. */
export const NO_EXERCISES = "Couldn't find any exercises with sets and reps in that file. If the plan is on another tab or page, check it has columns like Exercise, Sets and Reps.";

export async function readPlanFile(
  { csv, files, tab, note: sheetNote }: PlanFile,
  opts: { workspaceId: string; userId: string; feature: string; notes?: string }
): Promise<{ grid: SheetGrid; warnings: string[] }> {
  const warnings: string[] = [];
  let note: string | null = sheetNote ?? null;
  if (tab) warnings.push(`Read the "${tab}" tab${note ? "; the other tabs are kept as a note on the plan" : ""}.`);
  let reply: string;
  try {
    if (csv) {
      const tidy = tidyCsv(csv);
      if (tidy.length < 10) throw new PlanFileError("That sheet looks empty.", 400);
      const { system, user } = buildProgramSheetPrompt(tidy, opts.notes);
      reply = (await callAI({ system, user, model: MODELS.sonnet, maxTokens: 16000, feature: opts.feature, workspaceId: opts.workspaceId, userId: opts.userId })).content;
    } else {
      const images: ImageInput[] = [];
      for (const f of files) {
        const bytes = new Uint8Array(await f.arrayBuffer());
        if (f.type === "application/pdf" || isPdf(bytes)) {
          const pdf = await pdfToImages(bytes);
          images.push(...pdf.images);
          const skipped = pdf.read.length < pdf.pages && pdf.read.some((n, i) => n !== i + 1);
          if (skipped) warnings.push(`Read page${pdf.read.length === 1 ? "" : "s"} ${pdf.read.join(", ")} of ${pdf.pages} (the plan)${pdf.note ? "; the other pages are kept as a note on the plan" : ""}.`);
          else if (pdf.truncated) warnings.push(`Read the first ${MAX_PDF_PAGES} of ${pdf.pages} pages.`);
          if (pdf.note) note = note ? `${note}\n\n${pdf.note}` : pdf.note;
        } else if (PHOTO_TYPES.includes(f.type)) {
          images.push({ base64: Buffer.from(bytes).toString("base64"), mediaType: f.type as ImageInput["mediaType"] });
        } else {
          throw new PlanFileError(CHOOSE_A_FILE, 400);
        }
      }
      if (images.length > MAX_PDF_PAGES) images.length = MAX_PDF_PAGES;
      const { system, user } = buildProgramPagesPrompt(images.length, opts.notes);
      reply = (await callAIVision({ system, user, images, model: MODELS.sonnet, maxTokens: 16000, feature: opts.feature, workspaceId: opts.workspaceId, userId: opts.userId })).content;
    }
  } catch (err) {
    if (err instanceof PlanFileError) throw err;
    if (err instanceof PdfError) throw new PlanFileError(err.message, 400);
    console.error("[read-plan-file] read failed:", err);
    throw new PlanFileError("Couldn't read the plan right now. Please try again.", 502);
  }
  const grid = readGrid(reply);
  if (!grid) throw new PlanFileError("Couldn't find a plan in that. Check it lists exercises with sets and reps.", 422);
  if (plannedCount(grid) === 0) throw new PlanFileError(NO_EXERCISES, 422);
  if (note) grid.note = note.slice(0, MAX_NOTE_CHARS);
  return { grid, warnings };
}
