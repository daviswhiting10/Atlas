import { vi } from "vitest";
vi.hoisted(() => { process.env.DATABASE_URL ??= "postgresql://test:test@localhost:5432/test"; });
import { describe, expect, it } from "vitest";
import { NOT_SHARED, fetchSheetCsv, parseSheetLink, tidyCsv } from "./sheet";

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

describe("fetchSheetCsv", () => {
  const link = parseSheetLink(`https://docs.google.com/spreadsheets/d/${ID}/edit#gid=0`)!;
  /** A fake fetch that answers each address from a table and records what was asked for. */
  function fake(routes: Record<string, () => Response>) {
    const asked: string[] = [];
    const fn = (async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      asked.push(url);
      expect(init?.redirect).toBe("manual");
      const route = routes[url];
      if (!route) throw new Error(`unexpected fetch ${url}`);
      return route();
    }) as typeof fetch;
    return { fn, asked };
  }
  const redirect = (to: string) => () => new Response(null, { status: 307, headers: { location: to } });

  it("follows Google's redirect to googleusercontent and reads the CSV", async () => {
    const f = fake({
      [link.exportUrl]: redirect("https://doc-0s-sheets.googleusercontent.com/export/abc"),
      "https://doc-0s-sheets.googleusercontent.com/export/abc": () => new Response("Day 1,Squat", { headers: { "content-type": "text/csv" } }),
    });
    await expect(fetchSheetCsv(link, f.fn)).resolves.toBe("Day 1,Squat");
    expect(f.asked).toHaveLength(2);
  });

  it("treats a sign-in page or any other host as not shared, without fetching it", async () => {
    for (const to of ["https://accounts.google.com/ServiceLogin?continue=x", "https://evil.example/x", "http://doc.googleusercontent.com/x", "https://googleusercontent.com.evil.example/x"]) {
      const f = fake({ [link.exportUrl]: redirect(to) });
      await expect(fetchSheetCsv(link, f.fn), to).rejects.toThrow(NOT_SHARED);
      expect(f.asked).toEqual([link.exportUrl]);
    }
  });

  it("treats an HTML answer or an error as not shared", async () => {
    const html = fake({ [link.exportUrl]: () => new Response("<html>", { headers: { "content-type": "text/html; charset=utf-8" } }) });
    await expect(fetchSheetCsv(link, html.fn)).rejects.toThrow(NOT_SHARED);
    const gone = fake({ [link.exportUrl]: () => new Response("", { status: 404 }) });
    await expect(fetchSheetCsv(link, gone.fn)).rejects.toThrow(NOT_SHARED);
  });

  it("stops after a few redirects", async () => {
    const loop = fake({ [link.exportUrl]: redirect(link.exportUrl) });
    await expect(fetchSheetCsv(link, loop.fn)).rejects.toThrow(NOT_SHARED);
    expect(loop.asked).toHaveLength(4);
  });

  it("refuses a sheet too big to be a plan", async () => {
    const big = fake({ [link.exportUrl]: () => new Response("x".repeat(2_000_001), { headers: { "content-type": "text/csv" } }) });
    await expect(fetchSheetCsv(link, big.fn)).rejects.toThrow(/too big/);
  });
});
