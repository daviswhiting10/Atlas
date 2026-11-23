import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { MAX_PDF_PAGES, PDF_FAILED, PDF_OFF, PdfError, isPdf, pdfImportOn, pdfToImages } from "./pdf-pages";

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

describe("IMPORT_PDF switch", () => {
  it("off on the production site unless IMPORT_PDF=on; on elsewhere unless IMPORT_PDF=off", () => {
    expect(pdfImportOn({ VERCEL_ENV: "production" })).toBe(false);
    expect(pdfImportOn({ VERCEL_ENV: "production", IMPORT_PDF: "on" })).toBe(true);
    expect(pdfImportOn({ VERCEL_ENV: "preview" })).toBe(true);
    expect(pdfImportOn({})).toBe(true);
    expect(pdfImportOn({ IMPORT_PDF: "off" })).toBe(false);
  });

  it("switched off, a PDF gets the plain message and nothing is loaded", async () => {
    const before = process.env.IMPORT_PDF;
    process.env.IMPORT_PDF = "off";
    let loaded = false;
    try {
      await expect(pdfToImages(plan(), async () => { loaded = true; return import("pdf-parse"); })).rejects.toThrow(PDF_OFF);
      expect(loaded).toBe(false);
    } finally {
      if (before === undefined) delete process.env.IMPORT_PDF;
      else process.env.IMPORT_PDF = before;
    }
  });
});
