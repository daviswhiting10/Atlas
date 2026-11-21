/**
 * A PDF's pages as images, so the photo reader (lib/programs/read-images) can read a plan that arrives as a PDF.
 * Server side (pdf-parse draws each page with @napi-rs/canvas). Only the first pages are read: a plan is a few.
 */
import { PDFParse } from "pdf-parse";
import type { ImageInput } from "@/lib/ai/client";

export const MAX_PDF_PAGES = 10;
/** Wide enough to read small print, small enough to send ten pages in one request. */
const PAGE_WIDTH = 1100;

export class PdfError extends Error {}

export const isPdf = (bytes: Uint8Array): boolean => bytes.length > 4 && bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46 && bytes[4] === 0x2d;

export async function pdfToImages(bytes: Uint8Array): Promise<{ images: ImageInput[]; pages: number; truncated: boolean }> {
  if (!isPdf(bytes)) throw new PdfError("That doesn't look like a PDF.");
  const parser = new PDFParse({ data: bytes });
  try {
    const shots = await parser.getScreenshot({ first: MAX_PDF_PAGES, desiredWidth: PAGE_WIDTH, imageBuffer: true, imageDataUrl: false });
    if (shots.pages.length === 0) throw new PdfError("That PDF has no pages.");
    return {
      images: shots.pages.map((p) => ({ base64: Buffer.from(p.data).toString("base64"), mediaType: "image/png" as const })),
      pages: shots.total,
      truncated: shots.total > MAX_PDF_PAGES,
    };
  } catch (err) {
    if (err instanceof PdfError) throw err;
    console.error("[pdf-pages]", err);
    throw new PdfError("Couldn't open that PDF. Is it protected? Try a screenshot of the plan instead.");
  } finally {
    await parser.destroy().catch(() => {});
  }
}
