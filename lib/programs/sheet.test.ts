import { vi } from "vitest";
vi.hoisted(() => { process.env.DATABASE_URL ??= "postgresql://test:test@localhost:5432/test"; });
import { describe, expect, it } from "vitest";
import { parseSheetLink, tidyCsv } from "./sheet";

const ID = "1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789_-xyz";

describe("Google Sheets links", () => {
  it("builds the CSV export address from the sheet id and tab", () => {
    expect(parseSheetLink(`https://docs.google.com/spreadsheets/d/${ID}/edit#gid=123`)).toEqual({
      id: ID,
      gid: "123",
      exportUrl: `https://docs.google.com/spreadsheets/d/${ID}/export?format=csv&gid=123`,
    });
    expect(parseSheetLink(`https://docs.google.com/spreadsheets/d/${ID}/edit?usp=sharing`)?.exportUrl).toBe(`https://docs.google.com/spreadsheets/d/${ID}/export?format=csv`);
  });

  it("refuses anything that isn't a Google Sheet", () => {
    for (const link of [
      "http://docs.google.com/spreadsheets/d/" + ID,
      "https://evil.example.com/spreadsheets/d/" + ID,
      "https://docs.google.com.evil.example/spreadsheets/d/" + ID,
      "https://docs.google.com/document/d/" + ID,
      "https://docs.google.com/spreadsheets/d/short",
      "not a link",
      "http://localhost:3000/api/secret",
    ]) {
      expect(parseSheetLink(link), link).toBeNull();
    }
  });

  it("never fetches the link as given, only the export address it builds", () => {
    const parsed = parseSheetLink(`https://docs.google.com/spreadsheets/d/${ID}/edit?redirect=https://evil.example#gid=7`);
    expect(parsed?.exportUrl).toBe(`https://docs.google.com/spreadsheets/d/${ID}/export?format=csv&gid=7`);
  });
});

describe("tidyCsv", () => {
  it("drops blank rows and trailing empty cells", () => {
    expect(tidyCsv("Day 1,,,\n,,,\nSquat,3,8-10,,,\n\n")).toBe("Day 1\nSquat,3,8-10");
  });
});

describe("gym shorthand", async () => {
  const { expandShorthand } = await import("./resolve-exercise");
  it("spells out common abbreviations so they match the library", () => {
    expect(expandShorthand("DB Bench Press")).toBe("Dumbbell Bench Press");
    expect(expandShorthand("SA DB row")).toBe("Single-Arm Dumbbell row");
    expect(expandShorthand("BB RDL")).toBe("Barbell Romanian Deadlift");
    // Whole words only: "Dbl" or "Bobby" are left alone.
    expect(expandShorthand("Dbl unders")).toBe("Dbl unders");
  });
});
