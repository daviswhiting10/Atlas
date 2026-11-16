import { describe, expect, it } from "vitest";
import { strToU8, zipSync } from "fflate";
import { WorkbookError, xlsxToCsv } from "./xlsx";

/** A minimal workbook, laid out the way Excel writes one. */
function workbook(opts: {
  sheets: Array<{ name: string; xml: string; state?: string }>;
  shared?: string[];
  styles?: string;
  date1904?: boolean;
}): Uint8Array {
  const files: Record<string, Uint8Array> = {
    "[Content_Types].xml": strToU8("<Types/>"),
    "xl/workbook.xml": strToU8(
      `<workbook xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">` +
        (opts.date1904 ? `<workbookPr date1904="1"/>` : "") +
        `<sheets>${opts.sheets.map((s, i) => `<sheet name="${s.name}" sheetId="${i + 1}"${s.state ? ` state="${s.state}"` : ""} r:id="rId${i + 1}"/>`).join("")}</sheets></workbook>`
    ),
    "xl/_rels/workbook.xml.rels": strToU8(
      `<Relationships>${opts.sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join("")}</Relationships>`
    ),
  };
  opts.sheets.forEach((s, i) => (files[`xl/worksheets/sheet${i + 1}.xml`] = strToU8(`<worksheet><sheetData>${s.xml}</sheetData></worksheet>`)));
  if (opts.shared) files["xl/sharedStrings.xml"] = strToU8(`<sst>${opts.shared.map((t) => `<si><t xml:space="preserve">${t}</t></si>`).join("")}</sst>`);
  if (opts.styles) files["xl/styles.xml"] = strToU8(opts.styles);
  return zipSync(files);
}

describe("xlsxToCsv", () => {
  it("reads shared text, numbers and gaps into CSV", () => {
    const bytes = workbook({
      shared: ["Day 1", "Week 1", "Back squat", "3 x 8", "Tempo 3-1-1, no bounce"],
      sheets: [
        {
          name: "Plan",
          xml:
            `<row r="1"><c r="A1" t="s"><v>0</v></c><c r="C1" t="s"><v>1</v></c></row>` +
            `<row r="3"><c r="A3" t="s"><v>2</v></c><c r="B3" t="s"><v>4</v></c><c r="C3" t="s"><v>3</v></c><c r="D3"><v>72.499999999999986</v></c></row>`,
        },
      ],
    });
    expect(xlsxToCsv(bytes)).toBe('Day 1,,Week 1\n\nBack squat,"Tempo 3-1-1, no bounce",3 x 8,72.5');
  });

  it("reads inline text, formula results, booleans and escaped characters", () => {
    const bytes = workbook({
      sheets: [
        {
          name: "Plan",
          xml:
            `<row r="1"><c r="A1" t="inlineStr"><is><r><t>Push</t></r><r><t xml:space="preserve"> &amp; pull</t></r></is></c>` +
            `<c r="B1" t="str"><f>A1&amp;"!"</f><v>Push &amp; pull!</v></c><c r="C1" t="b"><v>1</v></c><c r="D1"><f>2+3</f></c></row>`,
        },
      ],
    });
    expect(xlsxToCsv(bytes)).toBe("Push & pull,Push & pull!,TRUE");
  });

  it("shows dated cells as days, built-in and custom formats, and 1904 workbooks", () => {
    const styles = `<styleSheet><numFmts><numFmt numFmtId="164" formatCode="d\\ mmm\\ yyyy"/><numFmt numFmtId="165" formatCode="0.0&quot;kg&quot;"/></numFmts><cellXfs><xf numFmtId="0"/><xf numFmtId="14"/><xf numFmtId="164"/><xf numFmtId="165"/></cellXfs></styleSheet>`;
    const xml = `<row r="1"><c r="A1" s="1"><v>46314</v></c><c r="B1" s="2"><v>46314</v></c><c r="C1" s="3"><v>80</v></c><c r="D1"><v>46314</v></c></row>`;
    expect(xlsxToCsv(workbook({ styles, sheets: [{ name: "P", xml }] }))).toBe("2026-10-19,2026-10-19,80,46314");
    expect(xlsxToCsv(workbook({ styles, date1904: true, sheets: [{ name: "P", xml: `<row r="1"><c r="A1" s="1"><v>1</v></c><c r="B1" s="1"><v>46314</v></c></row>` }] }))).toBe("1904-01-02,2030-10-20");
  });

  it("heads each tab when there are several, and skips hidden and empty tabs", () => {
    const bytes = workbook({
      shared: ["Squat", "Bench", "secret"],
      sheets: [
        { name: "Week 1", xml: `<row r="1"><c r="A1" t="s"><v>0</v></c></row>` },
        { name: "Old", state: "hidden", xml: `<row r="1"><c r="A1" t="s"><v>2</v></c></row>` },
        { name: "Blank", xml: `<row r="1"><c r="A1" t="s"><v>99</v></c><c r="B1" t="inlineStr"><is><t> </t></is></c></row>` },
        { name: "Week 2", xml: `<row r="1"><c r="B1" t="s"><v>1</v></c></row>` },
      ],
    });
    expect(xlsxToCsv(bytes)).toBe("Tab: Week 1\nSquat\n\nTab: Week 2\n,Bench");
  });

  it("says what to do with files it can't read", () => {
    const err = (bytes: Uint8Array) => {
      try {
        xlsxToCsv(bytes);
      } catch (e) {
        expect(e).toBeInstanceOf(WorkbookError);
        return (e as Error).message;
      }
      throw new Error("expected a WorkbookError");
    };
    expect(err(new Uint8Array([0xd0, 0xcf, 0x11, 0xe0]))).toMatch(/\.xls file.*save it as \.xlsx/);
    expect(err(strToU8("Day 1,Squat"))).toMatch(/isn't an Excel workbook/);
    expect(err(new Uint8Array([0x50, 0x4b, 3, 4, 0, 0]))).toMatch(/Couldn't open/);
    expect(err(zipSync({ "readme.txt": strToU8("hi") }))).toMatch(/Couldn't open/);
    expect(err(workbook({ sheets: [{ name: "P", xml: "" }] }))).toMatch(/looks empty/);
  });
});
