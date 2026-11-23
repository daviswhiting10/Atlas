import { parseBarcode, parseOff, type OffProduct } from "./calc";

/**
 * Open Food Facts, by barcode (https://world.openfoodfacts.org, free and open). Only the barcode leaves the server:
 * no account, athlete or workspace detail goes in the request. Their rules ask for an identifying User-Agent; this one
 * names the app and nothing about anyone.
 */
const ENDPOINT = "https://world.openfoodfacts.org/api/v2/product";
const FIELDS = "product_name,brands,nutriments,serving_quantity";

export type OffResult = { ok: true; product: OffProduct } | { ok: false; reason: "bad-barcode" | "not-found" | "unavailable" };

export async function lookupOff(rawBarcode: string, fetchFn: typeof fetch = fetch): Promise<OffResult> {
  const barcode = parseBarcode(rawBarcode);
  if (!barcode) return { ok: false, reason: "bad-barcode" };
  try {
    const res = await fetchFn(`${ENDPOINT}/${barcode}.json?fields=${FIELDS}`, {
      headers: { "User-Agent": "Atlas/0.1 (food log spike)", Accept: "application/json" },
      signal: AbortSignal.timeout(6000),
      cache: "no-store",
    });
    if (res.status === 404) return { ok: false, reason: "not-found" };
    if (!res.ok) return { ok: false, reason: "unavailable" };
    const json = (await res.json()) as { status?: number; product?: unknown };
    const product = json.status === 1 ? parseOff(json.product) : null;
    return product ? { ok: true, product } : { ok: false, reason: "not-found" };
  } catch {
    return { ok: false, reason: "unavailable" };
  }
}
