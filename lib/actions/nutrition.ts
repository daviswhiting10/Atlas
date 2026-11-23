"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db/client";
import { athleteIdentity } from "@/lib/athlete/identity";
import { nutritionEnabled } from "@/lib/nutrition/flag";
import { lookupOff } from "@/lib/nutrition/off";
import { parseBarcode, scaleOff } from "@/lib/nutrition/calc";
import { athleteToday } from "@/lib/nutrition/data";
import { dayDate } from "@/lib/nutrition/calc";

/**
 * Nutrition saves (spike, behind the NUTRITION flag: every action refuses while it is off). Server actions are public
 * endpoints, so every input is parsed. Numbers are only what the athlete typed or what Open Food Facts returned for
 * the barcode, scaled to the grams eaten: nothing is estimated here.
 */
type Result<T extends object = object> = ({ ok: true } & T) | { ok: false; error: string };

async function athlete() {
  if (!nutritionEnabled()) throw new Error("Not found");
  const session = await auth();
  const identity = await athleteIdentity(session?.user);
  if (!identity) throw new Error("Unauthorized");
  return identity;
}

const refresh = () => {
  revalidatePath("/today");
  revalidatePath("/you/nutrition");
};

const Macro = z.number().finite().min(0).max(10000).nullish();

export type BarcodeProduct = { barcode: string; name: string; brand: string | null; servingG: number | null; per100: { calories: number | null; proteinG: number | null; carbsG: number | null; fatG: number | null } };

/** Look a barcode up (only the barcode is sent to Open Food Facts). */
export async function lookupBarcode(raw: unknown): Promise<Result<{ product: BarcodeProduct }>> {
  await athlete();
  const { barcode } = z.object({ barcode: z.string().max(40) }).parse(raw);
  const code = parseBarcode(barcode);
  if (!code) return { ok: false, error: "A barcode is 8 to 14 digits." };
  const r = await lookupOff(code);
  if (!r.ok) return { ok: false, error: r.reason === "not-found" ? "Open Food Facts doesn't know that barcode. You can describe it instead." : r.reason === "bad-barcode" ? "A barcode is 8 to 14 digits." : "Couldn't reach Open Food Facts. Try again, or describe it instead." };
  return { ok: true, product: { barcode: code, name: r.product.name, brand: r.product.brand, servingG: r.product.servingG, per100: r.product.per100 } };
}

const LogInput = z.discriminatedUnion("source", [
  z.object({ source: z.literal("TEXT"), name: z.string().trim().min(1).max(120), calories: Macro, proteinG: Macro, carbsG: Macro, fatG: Macro, note: z.string().trim().max(500).nullish() }),
  // The photo is a downsized JPEG the browser made; it is kept as a note on the entry. No calories are read from it.
  z.object({ source: z.literal("PHOTO"), photo: z.string().max(300_000).regex(/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/), name: z.string().trim().max(120).nullish(), note: z.string().trim().max(500).nullish() }),
  z.object({ source: z.literal("BARCODE"), barcode: z.string().max(40), grams: z.number().finite().min(1).max(5000) }),
]);

export async function logFood(raw: unknown): Promise<Result<{ id: string }>> {
  const { clientId } = await athlete();
  const parsed = LogInput.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "Something in that doesn't look right." };
  const date = dayDate(athleteToday());
  const i = parsed.data;
  const blank = { calories: null, proteinG: null, carbsG: null, fatG: null, grams: null, barcode: null };
  if (i.source === "TEXT") {
    const e = await prisma.nutritionEntry.create({ data: { clientId, date, mealType: "TEXT", notes: i.note || null, manualMacros: { ...blank, name: i.name, calories: i.calories ?? null, proteinG: i.proteinG ?? null, carbsG: i.carbsG ?? null, fatG: i.fatG ?? null } }, select: { id: true } });
    refresh();
    return { ok: true, id: e.id };
  }
  if (i.source === "PHOTO") {
    const e = await prisma.nutritionEntry.create({ data: { clientId, date, mealType: "PHOTO", photoUrl: i.photo, notes: i.note || null, manualMacros: { ...blank, name: i.name || "Photo" } }, select: { id: true } });
    refresh();
    return { ok: true, id: e.id };
  }
  // The server looks the barcode up again itself: the numbers saved are Open Food Facts' own, scaled, never the client's.
  const code = parseBarcode(i.barcode);
  if (!code) return { ok: false, error: "A barcode is 8 to 14 digits." };
  const r = await lookupOff(code);
  if (!r.ok) return { ok: false, error: "Couldn't read that product. Try again." };
  const m = scaleOff(r.product.per100, i.grams);
  const e = await prisma.nutritionEntry.create({ data: { clientId, date, mealType: "BARCODE", manualMacros: { ...m, name: r.product.brand ? `${r.product.name} (${r.product.brand})` : r.product.name, grams: i.grams, barcode: code } }, select: { id: true } });
  refresh();
  return { ok: true, id: e.id };
}

export async function deleteFood(raw: unknown): Promise<Result> {
  const { clientId } = await athlete();
  const { id } = z.object({ id: z.string().min(1).max(64) }).parse(raw);
  const r = await prisma.nutritionEntry.deleteMany({ where: { id, clientId } });
  if (r.count === 0) return { ok: false, error: "That entry is already gone." };
  refresh();
  return { ok: true };
}

const Target = (max: number) => z.number().int().min(1).max(max).nullable();
export async function saveTargets(raw: unknown): Promise<Result> {
  const { clientId } = await athlete();
  const p = z.object({ calories: Target(10000), proteinG: Target(1000), carbsG: Target(2000), fatG: Target(1000) }).safeParse(raw);
  if (!p.success) return { ok: false, error: "Targets are whole numbers." };
  await prisma.nutritionTarget.upsert({ where: { clientId }, create: { clientId, ...p.data }, update: p.data });
  refresh();
  return { ok: true };
}
