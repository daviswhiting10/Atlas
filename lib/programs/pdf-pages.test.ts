import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { MAX_PDF_PAGES, PdfError, isPdf, pdfToImages } from "./pdf-pages";

// A real multi-week plan: one week to a page.
const PLAN = new Uint8Array(readFileSync(join(__dirname, "fixtures", "strength-base-4wk.pdf")));

describe("pdfToImages", () => {
  it("renders each page of a multi-week plan to a PNG for the photo reader", async () => {
    expect(isPdf(PLAN)).toBe(true);
    const out = await pdfToImages(PLAN);
    expect(out.pages).toBeGreaterThanOrEqual(4);
    expect(out.images.length).toBe(Math.min(out.pages, MAX_PDF_PAGES));
    expect(out.truncated).toBe(out.pages > MAX_PDF_PAGES);
    for (const img of out.images) {
      expect(img.mediaType).toBe("image/png");
      expect(Buffer.from(img.base64, "base64").subarray(1, 4).toString()).toBe("PNG");
    }
  }, 60_000);

  it("refuses something that is not a PDF", async () => {
    expect(isPdf(new Uint8Array([1, 2, 3]))).toBe(false);
    await expect(pdfToImages(new TextEncoder().encode("hello world"))).rejects.toBeInstanceOf(PdfError);
  });

  it("says so when a PDF can't be opened", async () => {
    await expect(pdfToImages(new TextEncoder().encode("%PDF-1.4 broken"))).rejects.toBeInstanceOf(PdfError);
  });
});
