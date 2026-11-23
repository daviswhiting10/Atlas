/**
 * A PDF's pages as images, so a plan that arrives as a PDF can be read like screenshots of it.
 *
 * Server side: pdf-parse (which bundles pdfjs-dist) draws each page with @napi-rs/canvas, a native module. Its build for
 * the server's platform must be installed (on Vercel: @napi-rs/canvas-linux-x64-gnu). If anything about drawing fails,
 * at load or at render, the athlete gets one plain message, never a crash: pdf-parse is loaded only here, on demand.
 */
import type { ImageInput } from "@/lib/ai/client";

import { noteFromTabs, pickPlanPages, rowsFromText } from "./plan-sheet";

export const MAX_PDF_PAGES = 10;
/** Wide enough to read small print, small enough to send ten pages in one request. */
const PAGE_WIDTH = 1100;
export const PDF_FAILED = "Couldn't read this PDF. Try screenshots of its pages instead.";

export class PdfError extends Error {}

export const isPdf = (bytes: Uint8Array): boolean => bytes.length > 4 && bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46 && bytes[4] === 0x2d;

type Loader = () => Promise<{ PDFParse: typeof import("pdf-parse").PDFParse }>;

export async function pdfToImages(
  bytes: Uint8Array,
  load: Loader = () => import("pdf-parse")
): Promise<{ images: ImageInput[]; pages: number; truncated: boolean; read: number[]; note: string | null }> {
  if (!isPdf(bytes)) throw new PdfError("That doesn't look like a PDF.");
  let parser: InstanceType<Awaited<ReturnType<Loader>>["PDFParse"]> | null = null;
  try {
    const { PDFParse } = await load();
    parser = new PDFParse({ data: bytes });
    // Every page's text, so the plan's pages are found wherever they are (a cover or "How to use" first is common).
    // A scanned PDF has no text: then the first pages, as many as are read.
    const texts = await parser
      .getText()
      .then((t) => t.pages.map((p) => p.text ?? ""))
      .catch(() => [] as string[]);
    const pick = pickPlanPages(texts, MAX_PDF_PAGES);
    const shots = await parser.getScreenshot({ ...(texts.length > 0 ? { partial: pick.pages } : { first: MAX_PDF_PAGES }), desiredWidth: PAGE_WIDTH, imageBuffer: true, imageDataUrl: false });
    if (shots.pages.length === 0) throw new PdfError("That PDF has no pages.");
    const note = noteFromTabs(pick.notePages.map((n) => ({ name: `Page ${n}`, rows: rowsFromText(texts[n - 1]) })));
    return {
      images: shots.pages.map((p) => ({ base64: Buffer.from(p.data).toString("base64"), mediaType: "image/png" as const })),
      pages: shots.total,
      truncated: shots.total > shots.pages.length + pick.notePages.length,
      read: shots.pages.map((p) => p.pageNumber),
      note,
    };
  } catch (err) {
    if (err instanceof PdfError) throw err;
    // A protected or broken file, or the native drawing module missing on this server: the same plain answer.
    console.error("[pdf-pages] drawing failed:", err);
    throw new PdfError(PDF_FAILED);
  } finally {
    await parser?.destroy().catch(() => {});
  }
}
