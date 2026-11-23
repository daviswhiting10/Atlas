import { unzipSync, strFromU8 } from "fflate";
import Papa from "papaparse";
import { noteFromTabs, pickPlanTab, type Tab } from "./plan-sheet";

/**
 * An Excel workbook (.xlsx) as the CSV the plan import already reads.
 *
 * Runs in the coach's browser, so the server only ever sees CSV. Each tab
 * with anything in it becomes its own block, headed "Tab: <name>". Cells
 * give their shown value: shared and inline text, cached formula results,
 * numbers, TRUE/FALSE, and dates as YYYY-MM-DD.
 *
 * Only the parts needed are unzipped, and each is size-checked first, so a
 * malformed or oversized file fails with a message instead of hanging.
 */

export class WorkbookError extends Error {}

/** Biggest .xlsx accepted. A plan is a few hundred KB at most. */
export const MAX_XLSX_BYTES = 5_000_000;
/** Biggest single part, once unzipped. */
const MAX_PART_BYTES = 30_000_000;
/** Stop reading once there's far more than the model is ever sent. */
const MAX_CSV_CHARS = 900_000;

/** Every visible tab with anything in it, as rows of shown cell values, in workbook order. */
export function readWorkbook(bytes: Uint8Array): Tab[] {
  if (bytes.byteLength > MAX_XLSX_BYTES) throw new WorkbookError("That file is too big for a plan. Save just the plan's tabs and try again.");
  // .xlsx files are zips ("PK"). An old .xls starts D0 CF.
  if (bytes[0] === 0xd0 && bytes[1] === 0xcf) throw new WorkbookError("That's an old .xls file. Open it in Excel and save it as .xlsx.");
  if (bytes[0] !== 0x50 || bytes[1] !== 0x4b) throw new WorkbookError("That file isn't an Excel workbook (.xlsx).");

  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(bytes, {
      filter: (f) =>
        f.originalSize <= MAX_PART_BYTES &&
        (f.name === "xl/workbook.xml" ||
          f.name === "xl/_rels/workbook.xml.rels" ||
          f.name === "xl/sharedStrings.xml" ||
          f.name === "xl/styles.xml" ||
          /^xl\/worksheets\/[^/]+\.xml$/.test(f.name)),
    });
  } catch {
    throw new WorkbookError("Couldn't open that workbook. Try saving it again as .xlsx.");
  }
  const text = (name: string) => (files[name] ? strFromU8(files[name]) : "");

  const workbook = text("xl/workbook.xml");
  if (!workbook) throw new WorkbookError("Couldn't open that workbook. Try saving it again as .xlsx.");

  const shared = readSharedStrings(text("xl/sharedStrings.xml"));
  const dateStyles = readDateStyles(text("xl/styles.xml"));
  const date1904 = /<workbookPr\b[^>]*\bdate1904="(1|true)"/.test(workbook);
  const targets = readRels(text("xl/_rels/workbook.xml.rels"));

  const tabs: Tab[] = [];
  let size = 0;
  for (const sheet of readSheets(workbook)) {
    if (sheet.hidden) continue;
    const target = targets.get(sheet.rid);
    if (!target) continue;
    const xml = text(sheetPath(target));
    if (!xml) continue;
    const rows = readRows(xml, shared, dateStyles, date1904);
    if (rows.length === 0) continue;
    tabs.push({ name: sheet.name, rows });
    size += rows.reduce((n, r) => n + r.join(",").length + 1, 0);
    if (size > MAX_CSV_CHARS) break;
  }
  if (tabs.length === 0) throw new WorkbookError("That workbook looks empty.");
  return tabs;
}

const toCsv = (rows: string[][]) => Papa.unparse(rows, { newline: "\n" });

/** Every tab as CSV, each headed "Tab: <name>" (a single tab needs no heading). */
export function xlsxToCsv(bytes: Uint8Array): string {
  const tabs = readWorkbook(bytes);
  if (tabs.length === 1) return toCsv(tabs[0].rows);
  return tabs.map((t) => `Tab: ${t.name}\n${toCsv(t.rows)}`).join("\n\n");
}

/**
 * The plan in a workbook: the tab that looks most like a workout table (lib/programs/plan-sheet), as CSV, and the
 * sentences on the other tabs as a note for the plan. With no tab that looks like a plan, every tab goes (as before),
 * and `tab` is null.
 */
export function xlsxPlan(bytes: Uint8Array): { csv: string; tab: string | null; note: string | null; tabs: number } {
  const tabs = readWorkbook(bytes);
  if (tabs.length === 1) return { csv: toCsv(tabs[0].rows), tab: null, note: null, tabs: 1 };
  const { plan, others } = pickPlanTab(tabs);
  if (!plan) return { csv: tabs.map((t) => `Tab: ${t.name}\n${toCsv(t.rows)}`).join("\n\n"), tab: null, note: null, tabs: tabs.length };
  return { csv: toCsv(plan.rows), tab: plan.name, note: noteFromTabs(others), tabs: tabs.length };
}

// ── Parts of the workbook ──────────────────────────────────────────────────

function attr(tag: string, name: string): string | null {
  const m = tag.match(new RegExp(`\\s${name}="([^"]*)"`));
  return m ? decode(m[1]) : null;
}

function decode(s: string): string {
  return s.replace(/&(#x[0-9a-fA-F]+|#\d+|amp|lt|gt|quot|apos);/g, (_, e: string) => {
    if (e[0] === "#") {
      const code = e[1] === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) && code <= 0x10ffff ? String.fromCodePoint(code) : "";
    }
    return { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" }[e as "amp"];
  });
}

/** The text of every <t> inside a fragment (plain or rich text), skipping phonetic hints. */
function textOf(xml: string): string {
  const withoutPhonetic = xml.replace(/<rPh\b[\s\S]*?<\/rPh>/g, "");
  let out = "";
  for (const m of Array.from(withoutPhonetic.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g))) out += m[1];
  return decode(out).replace(/_x([0-9A-Fa-f]{4})_/g, (_, h: string) => String.fromCharCode(parseInt(h, 16)));
}

function readSharedStrings(xml: string): string[] {
  const out: string[] = [];
  for (const m of Array.from(xml.matchAll(/<si>([\s\S]*?)<\/si>|<si\/>/g))) out.push(m[1] ? textOf(m[1]) : "");
  return out;
}

function readSheets(workbook: string): Array<{ name: string; rid: string; hidden: boolean }> {
  const out: Array<{ name: string; rid: string; hidden: boolean }> = [];
  for (const m of Array.from(workbook.matchAll(/<sheet\b[^>]*\/?>/g))) {
    const tag = m[0];
    const name = attr(tag, "name");
    const rid = attr(tag, "r:id");
    if (!name || !rid) continue;
    const state = attr(tag, "state");
    out.push({ name, rid, hidden: state === "hidden" || state === "veryHidden" });
  }
  return out;
}

function readRels(xml: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const m of Array.from(xml.matchAll(/<Relationship\b[^>]*\/?>/g))) {
    const id = attr(m[0], "Id");
    const target = attr(m[0], "Target");
    if (id && target) out.set(id, target);
  }
  return out;
}

/** "worksheets/sheet1.xml" or "/xl/worksheets/sheet1.xml" → "xl/worksheets/sheet1.xml". */
function sheetPath(target: string): string {
  return target.startsWith("/") ? target.slice(1) : `xl/${target.replace(/^\.\//, "")}`;
}

/** Built-in number formats that show a date. */
const BUILTIN_DATE_FORMATS = new Set([14, 15, 16, 17, 22, 27, 30, 36, 45, 46, 47, 50, 57]);

/** Which cell styles (index into cellXfs) show their number as a date. */
function readDateStyles(xml: string): Set<number> {
  const custom = new Map<number, string>();
  for (const m of Array.from(xml.matchAll(/<numFmt\b[^>]*\/?>/g))) {
    const id = Number(attr(m[0], "numFmtId"));
    const code = attr(m[0], "formatCode");
    if (Number.isFinite(id) && code) custom.set(id, code);
  }
  const isDate = (id: number) => {
    if (BUILTIN_DATE_FORMATS.has(id)) return true;
    const code = custom.get(id);
    if (!code) return false;
    // Ignore quoted text and [colours]; a date format has a day, month or year token.
    const bare = code.replace(/"[^"]*"|\[[^\]]*\]|\\./g, "");
    return /[dy]/i.test(bare) || /(^|[^h:])m+([^:s]|$)/i.test(bare);
  };
  const out = new Set<number>();
  const xfs = xml.match(/<cellXfs\b[^>]*>([\s\S]*?)<\/cellXfs>/)?.[1] ?? "";
  let i = 0;
  for (const m of Array.from(xfs.matchAll(/<xf\b[^>]*\/?>/g))) {
    if (isDate(Number(attr(m[0], "numFmtId")))) out.add(i);
    i++;
  }
  return out;
}

/** "AB12" → 27 (0-based column). */
function columnOf(ref: string): number {
  let n = 0;
  for (const ch of ref) {
    const c = ch.charCodeAt(0);
    if (c < 65 || c > 90) break;
    n = n * 26 + (c - 64);
  }
  return n - 1;
}

function serialToDay(serial: number, date1904: boolean): string {
  // Excel's day 0 is 1899-12-30 (it counts a 29 Feb 1900 that never was); 1904 workbooks start 1904-01-01.
  const epoch = date1904 ? Date.UTC(1904, 0, 1) : Date.UTC(1899, 11, 30);
  return new Date(epoch + Math.floor(serial) * 86_400_000).toISOString().slice(0, 10);
}

function readRows(xml: string, shared: string[], dateStyles: Set<number>, date1904: boolean): string[][] {
  const data = xml.match(/<sheetData\b[^>]*>([\s\S]*?)<\/sheetData>/)?.[1];
  if (!data) return [];
  const rows: string[][] = [];
  let nextRow = 0;
  for (const rm of Array.from(data.matchAll(/<row\b([^>]*)>([\s\S]*?)<\/row>|<row\b[^>]*\/>/g))) {
    const r = rm[1] ? Number(attr(rm[1], "r")) : NaN;
    const rowIndex = Number.isFinite(r) && r > 0 ? r - 1 : nextRow;
    nextRow = rowIndex + 1;
    const cells: string[] = [];
    let nextCol = 0;
    for (const cm of Array.from((rm[2] ?? "").matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g))) {
      const head = cm[1];
      const body = cm[2] ?? "";
      const ref = attr(head, "r");
      const col = ref ? columnOf(ref) : nextCol;
      nextCol = col + 1;
      if (col < 0 || col > 2000) continue;
      const value = cellValue(head, body, shared, dateStyles, date1904);
      if (value.trim() === "") continue;
      while (cells.length < col) cells.push("");
      cells[col] = value;
    }
    if (cells.length === 0) continue;
    while (rows.length < rowIndex) rows.push([]);
    rows[rowIndex] = cells;
  }
  // Blank rows are kept as gaps (they separate groups); trailing ones go.
  while (rows.length && rows[rows.length - 1].length === 0) rows.pop();
  return rows;
}

function cellValue(head: string, body: string, shared: string[], dateStyles: Set<number>, date1904: boolean): string {
  const type = attr(head, "t") ?? "n";
  if (type === "inlineStr") return textOf(body.match(/<is>([\s\S]*?)<\/is>/)?.[1] ?? "");
  const v = body.match(/<v>([\s\S]*?)<\/v>/)?.[1];
  if (v == null) return "";
  const raw = decode(v);
  switch (type) {
    case "s":
      return shared[Number(raw)] ?? "";
    case "b":
      return raw === "1" ? "TRUE" : "FALSE";
    case "str":
    case "e":
      return raw;
    default: {
      const n = Number(raw);
      if (!Number.isFinite(n)) return raw;
      const style = Number(attr(head, "s") ?? 0);
      if (dateStyles.has(style) && n > 0 && n < 2_958_466) return serialToDay(n, date1904);
      // Floating-point noise from Excel (72.49999999999999) reads as what Excel shows.
      return String(Number(n.toPrecision(15)));
    }
  }
}
