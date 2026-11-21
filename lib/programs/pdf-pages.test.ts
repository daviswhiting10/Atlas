import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { MAX_PDF_PAGES, PDF_FAILED, PdfError, isPdf, pdfToImages } from "./pdf-pages";

// A real multi-week plan: one week to a page.
// A fresh copy each time: pdf.js takes over (detaches) the buffer it is given.
const plan = () => new Uint8Array(readFileSync(join(__dirname, "fixtures", "strength-base-4wk.pdf")));

describe("pdfToImages", () => {
  it("renders each page of a multi-week plan to a PNG for the photo reader", async () => {
    expect(isPdf(plan())).toBe(true);
    const out = await pdfToImages(plan());
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

  it("says so plainly when a PDF can't be opened", async () => {
    await expect(pdfToImages(new TextEncoder().encode("%PDF-1.4 broken"))).rejects.toThrow(PDF_FAILED);
  });

  it("gives the same plain message when the drawing module can't load or draw (e.g. its native build is missing)", async () => {
    const missing = () => Promise.reject(new Error("Cannot find module '@napi-rs/canvas-linux-x64-gnu'"));
    await expect(pdfToImages(plan(), missing)).rejects.toThrow(PDF_FAILED);
    const cantDraw = async () => ({ PDFParse: class { getScreenshot() { return Promise.reject(new Error("canvas.toBuffer is not a function")); } destroy() { return Promise.resolve(); } } as never });
    await expect(pdfToImages(plan(), cantDraw)).rejects.toThrow(PDF_FAILED);
  });
});
