import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { dayDate, dayName, dayOf, dayTotals, lastDays, parseBarcode, parseOff, parseTarget, scaleOff, unpackMacros } from "./calc";
import { nutritionEnabled } from "./flag";
import { lookupOff } from "./off";

const read = (p: string) => readFileSync(new URL(`../../${p}`, import.meta.url), "utf8");
const m = (calories: number | null, proteinG: number | null = null) => ({ calories, proteinG, carbsG: null, fatG: null });

describe("the NUTRITION flag", () => {
  it("is off unless it is set to on", () => {
    expect(nutritionEnabled({})).toBe(false);
    expect(nutritionEnabled({ NUTRITION: "" })).toBe(false);
    expect(nutritionEnabled({ NUTRITION: "off" })).toBe(false);
    expect(nutritionEnabled({ NUTRITION: "true" })).toBe(false);
    expect(nutritionEnabled({ NUTRITION: "on" })).toBe(true);
    expect(nutritionEnabled({ NUTRITION: " ON " })).toBe(true);
  });
});

describe("dayTotals: only real numbers add up", () => {
  it("adds what has calories and says how many entries had none", () => {
    expect(dayTotals([m(420, 30), m(null), m(180.4, 5), m(null)])).toMatchObject({ calories: 600, proteinG: 35, counted: 2, uncounted: 2 });
  });
  it("an empty day is zero, not a guess", () => expect(dayTotals([])).toMatchObject({ calories: 0, counted: 0, uncounted: 0 }));
  it("a photo or a note (no calories) never changes the total", () => {
    expect(dayTotals([m(500), m(null)]).calories).toBe(500);
  });
});

describe("barcodes and Open Food Facts numbers", () => {
  it("accepts 8 to 14 digits, ignoring spaces", () => {
    expect(parseBarcode("3017 6204 22003")).toBe("30176204220003".slice(0, 0) + "3017620422003");
    expect(parseBarcode("12345678")).toBe("12345678");
    expect(parseBarcode("1234567")).toBeNull();
    expect(parseBarcode("abc12345678")).toBeNull();
    expect(parseBarcode("123456789012345")).toBeNull();
  });
  const product = { product_name: "Hazelnut spread", brands: "Brand A, Brand B", nutriments: { "energy-kcal_100g": 539, proteins_100g: 6.3, carbohydrates_100g: "57.5", fat_100g: 30.9 }, serving_quantity: "15" };
  it("reads per-100 g values, the brand and the serving", () => {
    expect(parseOff(product)).toEqual({ name: "Hazelnut spread", brand: "Brand A", per100: { calories: 539, proteinG: 6.3, carbsG: 57.5, fatG: 30.9 }, servingG: 15 });
  });
  it("scales per-100 g values to the grams eaten", () => {
    const p = parseOff(product)!;
    expect(scaleOff(p.per100, 30)).toEqual({ calories: 161.7, proteinG: 1.9, carbsG: 17.3, fatG: 9.3 });
  });
  it("a product with no energy value stays without calories (nothing is filled in)", () => {
    const p = parseOff({ product_name: "Mystery", nutriments: {} })!;
    expect(p.per100.calories).toBeNull();
    expect(scaleOff(p.per100, 100).calories).toBeNull();
  });
  it("no name and no energy is not a product", () => expect(parseOff({ nutriments: {} })).toBeNull());
  it("junk is not a product", () => {
    expect(parseOff(null)).toBeNull();
    expect(parseOff("x")).toBeNull();
  });
});

describe("lookupOff: what is sent and how failures read", () => {
  const ok = (body: unknown, status = 200) => vi.fn(async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;
  it("sends only the barcode and a generic User-Agent (no account detail)", async () => {
    const f = ok({ status: 1, product: { product_name: "X", nutriments: { "energy-kcal_100g": 100 } } });
    const r = await lookupOff("3017620422003", f);
    expect(r.ok).toBe(true);
    const [url, init] = (f as unknown as { mock: { calls: Array<[string, RequestInit]> } }).mock.calls[0];
    expect(url).toContain("/3017620422003.json");
    expect(url.split("?")[1]).toBe("fields=product_name,brands,nutriments,serving_quantity");
    expect(String((init.headers as Record<string, string>)["User-Agent"])).toBe("Atlas/0.1 (food log spike)");
    expect(JSON.stringify(init)).not.toMatch(/@|cookie|authorization/i);
  });
  it("a bad barcode never reaches the network", async () => {
    const f = ok({});
    expect(await lookupOff("12", f)).toEqual({ ok: false, reason: "bad-barcode" });
    expect(f).not.toHaveBeenCalled();
  });
  it("an unknown product, a 404 and a network error read differently", async () => {
    expect(await lookupOff("3017620422003", ok({ status: 0 }))).toEqual({ ok: false, reason: "not-found" });
    expect(await lookupOff("3017620422003", ok({}, 404))).toEqual({ ok: false, reason: "not-found" });
    expect(await lookupOff("3017620422003", vi.fn(async () => { throw new Error("offline"); }) as unknown as typeof fetch)).toEqual({ ok: false, reason: "unavailable" });
    expect(await lookupOff("3017620422003", ok({}, 500))).toEqual({ ok: false, reason: "unavailable" });
  });
});

describe("how an entry is stored in NutritionEntry", () => {
  it("a day is noon UTC of the athlete's local day, so it reads back as the same day", () => {
    expect(dayDate("2026-11-23").toISOString()).toBe("2026-11-23T12:00:00.000Z");
    expect(dayOf(dayDate("2026-11-23"))).toBe("2026-11-23");
  });
  it("reads the typed or Open Food Facts numbers back, and anything odd as an entry without numbers", () => {
    expect(unpackMacros({ name: "Eggs", calories: 320, proteinG: 18, carbsG: null, fatG: null, grams: null, barcode: null })).toMatchObject({ name: "Eggs", calories: 320, proteinG: 18, carbsG: null });
    for (const odd of [null, "x", 5, { calories: -3 }, { calories: "320" }, {}]) {
      const u = unpackMacros(odd);
      expect(u.calories).toBeNull();
      expect(u.name).toBe("Entry");
    }
  });
});

describe("the week and the targets", () => {
  const add = (d: string, k: number) => new Date(Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10) + k)).toISOString().slice(0, 10);
  it("seven days ending today, oldest first, zero where nothing was logged", () => {
    const w = lastDays({ "2026-11-20": { calories: 1800, uncounted: 1 } }, "2026-11-23", 7, add);
    expect(w.map((d) => d.day)[0]).toBe("2026-11-17");
    expect(w.at(-1)!.day).toBe("2026-11-23");
    expect(w.find((d) => d.day === "2026-11-20")).toMatchObject({ calories: 1800, uncounted: 1 });
    expect(w.find((d) => d.day === "2026-11-21")!.calories).toBe(0);
  });
  it("targets are whole numbers in range, or empty; anything else is refused", () => {
    expect(parseTarget("2100", 10000)).toEqual({ ok: true, value: 2100 });
    expect(parseTarget("  ", 10000)).toEqual({ ok: true, value: null });
    for (const bad of ["0", "-5", "21.5", "2,100", "abc", "99999"]) expect(parseTarget(bad, 10000).ok).toBe(false);
  });
  it("names a day", () => expect(dayName("2026-11-11")).toBe("Wed Nov 11"));
});

describe("behind the flag, and nothing is faked", () => {
  const actions = read("lib/actions/nutrition.ts");
  it("every action refuses while the flag is off", () => {
    expect(actions).toContain("if (!nutritionEnabled()) throw");
    for (const fn of ["lookupBarcode", "logFood", "deleteFood", "saveTargets"]) {
      const body = actions.slice(actions.indexOf(`export async function ${fn}`));
      expect(body.slice(0, 260)).toContain("await athlete()");
    }
  });
  it("Today, You and the Nutrition page draw nothing new with the flag off", () => {
    expect(read("app/(client)/today/page.tsx")).toContain("nutritionEnabled() ?");
    expect(read("app/(client)/you/page.tsx")).toContain("nutrition={nutritionEnabled()}");
    expect(read("components/athlete/YouScreen.tsx")).toContain("{nutrition && (");
    expect(read("app/(client)/you/nutrition/page.tsx")).toContain("if (!nutritionEnabled()) notFound();");
  });
  it("a photo is saved as a note: the save sets no calories", () => {
    const photo = actions.slice(actions.indexOf('if (i.source === "PHOTO")'), actions.indexOf("// The server looks the barcode up again"));
    expect(photo).toContain('mealType: "PHOTO"');
    expect(photo).toContain("...blank, name:"); // every number stays null
    expect(photo).not.toMatch(/calories|proteinG|carbsG|fatG|aiAnalysis/);
  });
  it("a barcode entry takes Open Food Facts' numbers from the server's own lookup, never the client's", () => {
    const b = actions.slice(actions.indexOf("// The server looks the barcode up again"), actions.indexOf("export async function deleteFood"));
    expect(b).toContain("lookupOff(code)");
    expect(b).toContain("scaleOff(r.product.per100, i.grams)");
  });
  it("nothing in the nutrition code estimates calories", () => {
    for (const f of ["lib/nutrition/calc.ts", "lib/actions/nutrition.ts", "components/nutrition/LogFoodSheet.tsx", "components/nutrition/NutritionParts.tsx"]) {
      const code = read(f).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
      expect(code).not.toMatch(/anthropic|openai|estimateCal|guessCal|recogni[sz]e/i);
    }
  });
  it("the sheet lists camera, then text, then barcode", () => {
    const s = read("components/nutrition/LogFoodSheet.tsx");
    const at = (t: string) => s.indexOf(t, s.indexOf('mode === "menu" && ('));
    expect(at("Take a photo")).toBeLessThan(at('aria-label="Describe it"'));
    expect(at('aria-label="Describe it"')).toBeLessThan(at("Scan a barcode"));
  });
  it("meals go in the existing NutritionEntry table; the one new table is the targets", () => {
    expect(read("lib/actions/nutrition.ts")).toContain("prisma.nutritionEntry.create");
    expect(read("lib/actions/nutrition.ts")).not.toContain("aiAnalysis");
    expect(read("prisma/schema.prisma")).not.toContain("model FoodEntry");
  });
  it("the migration only adds the targets table", () => {
    const sql = read("prisma/migrations/20261123150000_nutrition_targets/migration.sql");
    const body = sql.replace(/ON (DELETE|UPDATE) CASCADE/g, "");
    expect(body).not.toMatch(/DROP|DELETE|UPDATE|TRUNCATE/);
    expect(body.match(/ALTER TABLE "(\w+)"/g)?.every((x) => /NutritionTarget/.test(x))).toBe(true);
    expect(body.match(/CREATE TABLE "(\w+)"/g)).toEqual(['CREATE TABLE "NutritionTarget"']);
  });
});
