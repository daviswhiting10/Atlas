/**
 * Nutrition numbers. Pure: no I/O.
 *
 * A calorie number is only ever (a) typed by the athlete, or (b) read from Open Food Facts for a barcode and scaled to
 * the grams eaten. A photo, or an entry with just a name and a note, has none, and the totals say how many entries
 * they left out rather than guessing.
 */

export type Macros = { calories: number | null; proteinG: number | null; carbsG: number | null; fatG: number | null };
export type FoodRow = Macros & { id: string; name: string; source: "TEXT" | "BARCODE" | "PHOTO" };

export type DayTotals = { calories: number; proteinG: number; carbsG: number; fatG: number; counted: number; uncounted: number };

const round = (n: number) => Math.round(n);

/** What a day's entries add up to, and how many had no calories to add. */
export function dayTotals(rows: Macros[]): DayTotals {
  const t: DayTotals = { calories: 0, proteinG: 0, carbsG: 0, fatG: 0, counted: 0, uncounted: 0 };
  for (const r of rows) {
    if (r.calories == null) {
      t.uncounted += 1;
      continue;
    }
    t.counted += 1;
    t.calories += r.calories;
    t.proteinG += r.proteinG ?? 0;
    t.carbsG += r.carbsG ?? 0;
    t.fatG += r.fatG ?? 0;
  }
  return { ...t, calories: round(t.calories), proteinG: round(t.proteinG), carbsG: round(t.carbsG), fatG: round(t.fatG) };
}

/** Digits only, 8 to 14 of them (EAN-8, UPC-A, EAN-13, GTIN-14); otherwise null. */
export function parseBarcode(raw: string): string | null {
  const d = raw.replace(/\s+/g, "");
  return /^\d{8,14}$/.test(d) ? d : null;
}

/** The part of an Open Food Facts product we use. */
export type OffProduct = {
  name: string;
  brand: string | null;
  /** Per 100 g. calories null when the product has no energy value. */
  per100: Macros;
  /** The product's own serving, in grams, when it states one. */
  servingG: number | null;
};

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v)) && Number(v) >= 0 ? Number(v) : null);

/** From the API's JSON (`product` object). Null when it has no name and no energy to show. */
export function parseOff(product: unknown): OffProduct | null {
  const p = product as { product_name?: unknown; brands?: unknown; nutriments?: Record<string, unknown>; serving_quantity?: unknown } | null;
  if (!p || typeof p !== "object") return null;
  const n = p.nutriments ?? {};
  const name = typeof p.product_name === "string" ? p.product_name.trim() : "";
  const kcal = num(n["energy-kcal_100g"]);
  if (!name && kcal == null) return null;
  const brand = typeof p.brands === "string" && p.brands.trim() ? p.brands.split(",")[0].trim() : null;
  const serving = num(p.serving_quantity);
  return {
    name: name || "Unnamed product",
    brand,
    per100: { calories: kcal, proteinG: num(n["proteins_100g"]), carbsG: num(n["carbohydrates_100g"]), fatG: num(n["fat_100g"]) },
    servingG: serving != null && serving > 0 ? serving : null,
  };
}

/** The numbers for `grams` of a product (per-100 g values scaled). Calories stay null if the product had none. */
export function scaleOff(per100: Macros, grams: number): Macros {
  const k = grams / 100;
  const s = (v: number | null) => (v == null ? null : Math.round(v * k * 10) / 10);
  return { calories: s(per100.calories), proteinG: s(per100.proteinG), carbsG: s(per100.carbsG), fatG: s(per100.fatG) };
}

export type WeekDay = { day: string; calories: number; /** Entries that day that had no calories. */ uncounted: number };

/** Seven days ending today, oldest first, from per-day totals (days without entries are zero). */
export function lastDays(totals: Record<string, { calories: number; uncounted: number }>, today: string, n = 7, addDays: (d: string, k: number) => string): WeekDay[] {
  return Array.from({ length: n }, (_, i) => {
    const day = addDays(today, i - (n - 1));
    const t = totals[day];
    return { day, calories: t?.calories ?? 0, uncounted: t?.uncounted ?? 0 };
  });
}

/** Targets as typed: a whole number in a sane range, or empty (no target). Anything else is rejected, not rounded. */
export function parseTarget(raw: string, max: number): { ok: true; value: number | null } | { ok: false } {
  const t = raw.trim();
  if (t === "") return { ok: true, value: null };
  if (!/^\d{1,5}$/.test(t)) return { ok: false };
  const n = Number(t);
  return n >= 1 && n <= max ? { ok: true, value: n } : { ok: false };
}

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
/** "Tue Nov 11"-style names for a "yyyy-mm-dd" day (no time zone maths: the string is already the athlete's day). */
export function dayName(day: string): string {
  const [y, m, d] = day.split("-").map(Number);
  return `${DAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]} ${["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][m - 1]} ${d}`;
}

/**
 * How an entry sits in the existing NutritionEntry table (no new meals table): `date` is noon UTC of the athlete's
 * local day, `mealType` is how it was logged, `photoUrl` holds a small photo, `notes` the note, and `manualMacros` what
 * was typed or read from Open Food Facts. `aiAnalysis` is left empty: that is where real photo recognition would go.
 */
export type Stored = { name: string; calories: number | null; proteinG: number | null; carbsG: number | null; fatG: number | null; grams: number | null; barcode: string | null };

export const dayDate = (day: string): Date => new Date(`${day}T12:00:00.000Z`);
export const dayOf = (d: Date): string => d.toISOString().slice(0, 10);

/** Read manualMacros back. Anything unexpected becomes an entry without numbers, never a made-up one. */
export function unpackMacros(json: unknown): Stored {
  const j = (json && typeof json === "object" ? json : {}) as Record<string, unknown>;
  const n = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : null);
  return {
    name: typeof j.name === "string" && j.name.trim() ? j.name : "Entry",
    calories: n(j.calories),
    proteinG: n(j.proteinG),
    carbsG: n(j.carbsG),
    fatG: n(j.fatG),
    grams: n(j.grams),
    barcode: typeof j.barcode === "string" ? j.barcode : null,
  };
}
