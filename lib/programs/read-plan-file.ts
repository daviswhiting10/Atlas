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
import { readGrid, type SheetGrid } from "./sheet-plan";
import { tidyCsv } from "./sheet";

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

export async function readPlanFile(
  { csv, files }: PlanFile,
  opts: { workspaceId: string; userId: string; feature: string; notes?: string }
): Promise<{ grid: SheetGrid; warnings: string[] }> {
  const warnings: string[] = [];
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
          if (pdf.truncated) warnings.push(`Read the first ${MAX_PDF_PAGES} of ${pdf.pages} pages.`);
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
  return { grid, warnings };
}
