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

/** What a coach is told when Google won't hand the sheet over. */
export const NOT_SHARED =
  'That sheet isn\'t shared by link. Share it as "Anyone with the link", or download it (File → Download → .xlsx) and drop the file here.';

/** Hosts the export may come from (Google redirects the export to googleusercontent.com). */
function isGoogleHost(host: string): boolean {
  return host === "docs.google.com" || host.endsWith(".googleusercontent.com");
}

/** Biggest export read. A plan is a few KB; this stops a huge sheet from filling memory. */
const MAX_EXPORT_BYTES = 2_000_000;

/**
 * The sheet's CSV, or a SheetError saying what the coach should do.
 * Redirects are followed by hand, at most 3, and only to Google's own hosts.
 * A redirect anywhere else (a sign-in page included) means the sheet isn't shared by link.
 */
export async function fetchSheetCsv(link: SheetLink, fetcher: typeof fetch = fetch): Promise<string> {
  const bytes = await fetchExport(link.exportUrl, "text/csv", fetcher);
  const text = Buffer.from(bytes).toString("utf8");
  if (!text.trim()) throw new SheetError("That sheet is empty.");
  return text;
}

/**
 * The plan from a shared sheet. A link to one tab (gid) reads that tab. A link to the whole sheet reads every tab
 * (the .xlsx export) and keeps the one that holds the plan (lib/programs/plan-sheet), with the sentences on the other
 * tabs as the plan's note: Google's CSV export of a whole sheet is only its first tab, often "How to use".
 */
export async function fetchSheetPlan(link: SheetLink, fetcher: typeof fetch = fetch): Promise<{ csv: string; tab: string | null; note: string | null }> {
  if (link.gid) return { csv: await fetchSheetCsv(link, fetcher), tab: null, note: null };
  const bytes = await fetchExport(`https://docs.google.com/spreadsheets/d/${link.id}/export?format=xlsx`, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", fetcher);
  const { xlsxPlan, WorkbookError } = await import("./xlsx");
  try {
    const { csv, tab, note } = xlsxPlan(bytes);
    return { csv, tab, note };
  } catch (err) {
    if (err instanceof WorkbookError) throw new SheetError(err.message);
    throw err;
  }
}

async function fetchExport(start: string, accept: string, fetcher: typeof fetch): Promise<Uint8Array> {
  let url = start;
  let res: Response | null = null;
  for (let hop = 0; hop <= 3; hop++) {
    try {
      res = await fetcher(url, { redirect: "manual", signal: AbortSignal.timeout(15_000), headers: { Accept: accept } });
    } catch {
      throw new SheetError("Couldn't reach Google Sheets. Try again, or download the sheet as .xlsx and drop the file here.");
    }
    if (res.status < 300 || res.status >= 400) break;
    const next = res.headers.get("location");
    let nextUrl: URL;
    try {
      nextUrl = new URL(next ?? "", url);
    } catch {
      throw new SheetError(NOT_SHARED);
    }
    if (nextUrl.protocol !== "https:" || !isGoogleHost(nextUrl.hostname)) throw new SheetError(NOT_SHARED);
    url = nextUrl.toString();
    res = null;
  }
  if (!res) throw new SheetError(NOT_SHARED);
  const type = res.headers.get("content-type") ?? "";
  if (!res.ok || type.includes("text/html")) throw new SheetError(NOT_SHARED);
  if (Number(res.headers.get("content-length") ?? 0) > MAX_EXPORT_BYTES) throw new SheetError("That sheet is too big for a plan. Download just the plan's tab as .xlsx and drop it here.");
  const bytes = await readCapped(res, MAX_EXPORT_BYTES);
  if (bytes == null) throw new SheetError("That sheet is too big for a plan. Download just the plan's tab as .xlsx and drop it here.");
  return bytes;
}

async function readCapped(res: Response, max: number): Promise<Uint8Array | null> {
  if (!res.body) return new Uint8Array();
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > max) {
      await reader.cancel().catch(() => {});
      return null;
    }
    chunks.push(value);
  }
  return new Uint8Array(Buffer.concat(chunks));
}

/** Drop empty rows and trailing empty cells, and cap the size sent to the model. */
export function tidyCsv(csv: string): string {
  const rows = csv
    .split(/\r?\n/)
    .map((r) => r.replace(/(,\s*)+$/, ""))
    .filter((r) => r.replace(/[,\s"]/g, "").length > 0);
  return rows.join("\n").slice(0, MAX_SHEET_CHARS);
}
