/**
 * Reading a Google Sheet the coach shares by link.
 *
 * Only Google Sheets links are accepted, and the address fetched is built
 * from the sheet's id and tab, never taken from the link as given, so this
 * can't be pointed at anything else. The sheet has to be shared as
 * "Anyone with the link can view"; otherwise Google answers with a sign-in
 * page, which is reported as such.
 */

export const MAX_SHEET_CHARS = 60_000;

export type SheetLink = { id: string; gid: string | null; exportUrl: string };

export function parseSheetLink(raw: string): SheetLink | null {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return null;
  }
  if (url.protocol !== "https:" || url.hostname !== "docs.google.com") return null;
  const m = url.pathname.match(/^\/spreadsheets\/d\/([A-Za-z0-9_-]{20,100})(?:\/|$)/);
  if (!m) return null;
  const gid = (url.hash.match(/gid=(\d{1,12})/) ?? url.search.match(/[?&]gid=(\d{1,12})/))?.[1] ?? null;
  const exportUrl = `https://docs.google.com/spreadsheets/d/${m[1]}/export?format=csv${gid ? `&gid=${gid}` : ""}`;
  return { id: m[1], gid, exportUrl };
}

export class SheetError extends Error {}

/** The sheet's CSV, or a SheetError saying what the coach should do. */
export async function fetchSheetCsv(link: SheetLink): Promise<string> {
  let res: Response;
  try {
    res = await fetch(link.exportUrl, { redirect: "follow", signal: AbortSignal.timeout(15_000), headers: { Accept: "text/csv" } });
  } catch {
    throw new SheetError("Couldn't reach Google Sheets. Try again, or upload the sheet as a CSV file.");
  }
  const finalHost = new URL(res.url).hostname;
  const fromGoogle = finalHost === "docs.google.com" || finalHost.endsWith(".googleusercontent.com");
  const type = res.headers.get("content-type") ?? "";
  if (!fromGoogle || !res.ok || type.includes("text/html")) {
    throw new SheetError('That sheet isn\'t shared. In Google Sheets, click Share → General access → "Anyone with the link" (Viewer), then try again.');
  }
  const text = await res.text();
  if (!text.trim()) throw new SheetError("That sheet is empty.");
  return text;
}

/** Drop empty rows and trailing empty cells, and cap the size sent to the model. */
export function tidyCsv(csv: string): string {
  const rows = csv
    .split(/\r?\n/)
    .map((r) => r.replace(/(,\s*)+$/, ""))
    .filter((r) => r.replace(/[,\s"]/g, "").length > 0);
  return rows.join("\n").slice(0, MAX_SHEET_CHARS);
}
