/**
 * In the browser: a dropped or chosen plan file made ready to send, the same for every importer. A spreadsheet becomes
 * CSV here (lib/programs/xlsx); screenshots are made smaller; a PDF goes as it is. Sizes are checked before upload.
 */
import { MAX_UPLOAD_BYTES, fitWithin, tooBigMessage } from "@/lib/programs/upload-limits";
import { PHOTO_TYPES } from "@/lib/programs/screenshot-program";

export const ACCEPT = ".pdf,application/pdf,.xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv," + PHOTO_TYPES.join(",");
/** A spreadsheet is a few hundred KB at most. */
const MAX_SHEET_BYTES = 5_000_000;

const ext = (f: File) => f.name.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1] ?? "";
export const isPdfFile = (f: File) => f.type === "application/pdf" || ext(f) === "pdf";

/** A spreadsheet as CSV text (every tab of a workbook, each headed "Tab: <name>"), or what to do instead. */
export async function sheetToCsv(f: File): Promise<string> {
  const e = ext(f);
  if (e === "numbers") throw new Error("That's a Numbers file. In Numbers, File → Export To → Excel, then drop the .xlsx here.");
  if (e === "xls") throw new Error("That's an old .xls file. Open it in Excel and save it as .xlsx.");
  if (e !== "xlsx" && e !== "csv") throw new Error("Choose a PDF, a spreadsheet (.xlsx or .csv) or screenshots of the plan.");
  if (f.size > MAX_SHEET_BYTES) throw new Error("That file is too big for a plan. Save just the plan's tabs and try again.");
  if (e === "csv") return f.text();
  const { xlsxToCsv } = await import("@/lib/programs/xlsx");
  return xlsxToCsv(new Uint8Array(await f.arrayBuffer()));
}

/** A screenshot made smaller before upload (a phone photo is often 3–5 MB; this is a few hundred KB). Kept as is if it can't be. */
async function shrink(f: File): Promise<File> {
  if (f.type === "image/gif" || f.size < 500_000) return f;
  try {
    const bmp = await createImageBitmap(f);
    const { width, height } = fitWithin(bmp.width, bmp.height);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    canvas.getContext("2d")!.drawImage(bmp, 0, 0, width, height);
    bmp.close();
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", 0.85));
    return blob && blob.size < f.size ? new File([blob], f.name.replace(/\.\w+$/, "") + ".jpg", { type: "image/jpeg" }) : f;
  } catch {
    return f;
  }
}

/** The files as the form every import route reads (`csv`, or `file0`, `file1`…), with a name to show. Throws a plain message. */
export async function planForm(list: File[]): Promise<{ form: FormData; name: string; kind: "sheet" | "pages" }> {
  if (list.length === 0) throw new Error("Choose a PDF, a spreadsheet or screenshots of the plan.");
  const form = new FormData();
  const visual = list.every((f) => isPdfFile(f) || PHOTO_TYPES.includes(f.type));
  if (!visual) {
    if (list.length > 1) throw new Error("Choose one spreadsheet, or a PDF, or screenshots.");
    form.append("csv", await sheetToCsv(list[0]));
    return { form, name: list[0].name, kind: "sheet" };
  }
  const pdf = list.some(isPdfFile);
  const sending = pdf ? list : await Promise.all(list.map(shrink));
  const bytes = sending.reduce((n, f) => n + f.size, 0);
  if (bytes > MAX_UPLOAD_BYTES) throw new Error(tooBigMessage(bytes, pdf));
  sending.forEach((f, i) => form.append(`file${i}`, f));
  return { form, name: list.length === 1 ? list[0].name : `${list.length} files`, kind: "pages" };
}

/** The server's answer, or a plain message when there isn't one (the host refused the upload, or the server failed). */
export async function answer(res: Response): Promise<Record<string, unknown>> {
  const data = await res.json().catch(() => null);
  if (data) return data;
  if (res.status === 413) return { error: "That's bigger than Atlas can take in one go. Try screenshots of the pages, a few at a time." };
  return { error: "Couldn't read that plan. Try screenshots of its pages instead." };
}
