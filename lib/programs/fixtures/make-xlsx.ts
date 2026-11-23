/** Tests only: a minimal .xlsx (inline strings) with the given tabs, for the workbook reader and the plan-sheet picker. */
import { zipSync, strToU8 } from "fflate";

export type TestTab = { name: string; rows: string[][]; hidden?: boolean };

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const col = (i: number) => (i < 26 ? String.fromCharCode(65 + i) : String.fromCharCode(64 + Math.floor(i / 26)) + String.fromCharCode(65 + (i % 26)));

export function makeXlsx(tabs: TestTab[]): Uint8Array {
  const files: Record<string, Uint8Array> = {
    "[Content_Types].xml": strToU8(`<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/></Types>`),
    "xl/workbook.xml": strToU8(
      `<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${tabs
        .map((t, i) => `<sheet name="${esc(t.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"${t.hidden ? ' state="hidden"' : ""}/>`)
        .join("")}</sheets></workbook>`
    ),
    "xl/_rels/workbook.xml.rels": strToU8(
      `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${tabs
        .map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`)
        .join("")}</Relationships>`
    ),
  };
  tabs.forEach((t, i) => {
    files[`xl/worksheets/sheet${i + 1}.xml`] = strToU8(
      `<?xml version="1.0" encoding="UTF-8"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${t.rows
        .map((r, ri) => `<row r="${ri + 1}">${r.map((v, ci) => (v === "" ? "" : `<c r="${col(ci)}${ri + 1}" t="inlineStr"><is><t>${esc(v)}</t></is></c>`)).join("")}</row>`)
        .join("")}</sheetData></worksheet>`
    );
  });
  return zipSync(files);
}

/** Chloe's glute program pattern: "DAY N · NAME" headers, Block 3a/3b supersets, 10/side, mixed rest, "X (Wk 3-4: Y)" sets. */
export const CHLOE_ROWS: string[][] = [
  ["Glute Program: 4 weeks (4 workouts, repeat each week)"],
  [],
  ["DAY 1 · GLUTES & HAMSTRINGS"],
  ["Block", "Exercise", "Sets", "Reps", "Rest", "Notes"],
  ["1", "Barbell Hip Thrust", "3 (Wk 3-4: 4)", "8-10", "2 min", "Pause 1 s at the top"],
  ["2", "Romanian Deadlift", "3", "10", "90 sec", ""],
  ["Block 3a", "Bulgarian Split Squat", "3", "10/side", "60 sec", ""],
  ["Block 3b", "Cable Kickback", "3", "12/side", "60 sec", ""],
  [],
  ["DAY 2 · UPPER & CORE"],
  ["Block", "Exercise", "Sets", "Reps", "Rest", "Notes"],
  ["1", "Lat Pulldown", "3 (Wk 3-4: 4)", "10-12", "90 sec", ""],
  ["Block 2a", "Seated Cable Row", "3", "12", "1 min", ""],
  ["Block 2b", "Push-Up", "3", "AMRAP", "1 min", ""],
  [],
  ["DAY 3 · GLUTES & QUADS"],
  ["Block", "Exercise", "Sets", "Reps", "Rest", "Notes"],
  ["1", "Goblet Squat", "4", "10", "2 min", ""],
  ["2", "Reverse Lunge", "3", "8/side", "60 sec", ""],
  [],
  ["DAY 4 · FULL BODY"],
  ["Block", "Exercise", "Sets", "Reps", "Rest", "Notes"],
  ["1", "Trap Bar Deadlift", "3 (Wk 3-4: 4)", "6", "2.5 min", ""],
  ["2", "Side Plank", "3", "30 sec/side", "45 sec", ""],
];

export const HOW_TO_USE_ROWS: string[][] = [
  ["How to use this program"],
  ["Warm up for 5-10 minutes before every session: bike or brisk walk, then the first exercise with light weight."],
  ["Train 4 days a week with a rest day after days 2 and 4. Leave 1-2 reps in the tank on every set."],
  ["If a weight feels easy for every rep, go up 5 lb next session."],
];
