/** Tests only: a minimal .xlsx (inline strings) with the given tabs, and two plan layouts besides Chloe's real file. */
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

/** One tab, one workout, no day marker, sets and reps in one column. */
export const ONE_WORKOUT: TestTab[] = [
  {
    name: "Sheet1",
    rows: [
      ["Full body (do 3x a week)"],
      ["Exercise", "Sets x Reps", "Rest", "Notes"],
      ["Goblet squat", "3 x 10", "90 sec", ""],
      ["Push-up", "3 x 8-12", "60 sec", "Knees OK"],
      ["Dumbbell row", "3 x 10/side", "60 sec", ""],
      ["Plank", "3 x 30 sec", "", ""],
    ],
  },
];

/** Seven tabs, one workout each (Monday … Sunday), plus nothing else. */
export const SEVEN_TABS: TestTab[] = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"].map((day, i) => ({
  name: day,
  rows: [
    [`${day}: ${["Push", "Pull", "Legs", "Easy cardio", "Upper", "Lower", "Mobility"][i]}`],
    ["Exercise", "Sets", "Reps", "Rest"],
    [["Bench press", "Pull-up", "Back squat", "Bike", "Overhead press", "Deadlift", "Hip 90/90"][i], "3", i === 3 ? "30 min" : "8", i === 3 ? "" : "2 min"],
    [["Incline DB press", "Barbell row", "Walking lunge", "Walk", "Lat pulldown", "Leg curl", "Cat-cow"][i], "3", i === 3 ? "20 min" : "10", i === 3 ? "" : "90 sec"],
  ],
}));
