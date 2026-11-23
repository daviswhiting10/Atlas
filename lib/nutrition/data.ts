import { cookies } from "next/headers";
import { prisma } from "@/lib/db/client";
import { localDay } from "@/lib/athlete/sessions";
import { addDays } from "@/lib/goals/days";
import { TZ_COOKIE, safeTimeZone } from "@/lib/athlete/data";
import { dayDate, dayOf, dayTotals, lastDays, unpackMacros, type DayTotals, type WeekDay } from "./calc";

export type Targets = { calories: number | null; proteinG: number | null; carbsG: number | null; fatG: number | null };
export type FoodItem = { id: string; source: "TEXT" | "BARCODE" | "PHOTO"; name: string; note: string | null; photo: string | null; grams: number | null; calories: number | null; proteinG: number | null; carbsG: number | null; fatG: number | null; loggedAt: Date };

/** The athlete's today, in their own zone (the cookie the app already sets). */
export function athleteToday(now = new Date()): string {
  return localDay(now, safeTimeZone(cookies().get(TZ_COOKIE)?.value));
}

export async function getTargets(clientId: string): Promise<Targets> {
  const t = await prisma.nutritionTarget.findUnique({ where: { clientId }, select: { calories: true, proteinG: true, carbsG: true, fatG: true } });
  return t ?? { calories: null, proteinG: null, carbsG: null, fatG: null };
}

const select = { id: true, mealType: true, photoUrl: true, notes: true, manualMacros: true, date: true, createdAt: true } as const;
type Row = { id: string; mealType: string; photoUrl: string | null; notes: string | null; manualMacros: unknown; date: Date; createdAt: Date };

const toItem = (r: Row): FoodItem => {
  const m = unpackMacros(r.manualMacros);
  return { id: r.id, source: r.mealType === "PHOTO" || r.mealType === "BARCODE" ? r.mealType : "TEXT", name: m.name, note: r.notes, photo: r.photoUrl, grams: m.grams, calories: m.calories, proteinG: m.proteinG, carbsG: m.carbsG, fatG: m.fatG, loggedAt: r.createdAt };
};

/** Today for the Today row and the Nutrition tab. */
export async function nutritionToday(clientId: string): Promise<{ day: string; entries: FoodItem[]; totals: DayTotals; targets: Targets }> {
  const day = athleteToday();
  const [rows, targets] = await Promise.all([prisma.nutritionEntry.findMany({ where: { clientId, date: dayDate(day) }, orderBy: { createdAt: "desc" }, select }), getTargets(clientId)]);
  const entries = rows.map(toItem);
  return { day, entries, totals: dayTotals(entries), targets };
}

/** The last seven days' calories, for the history bars. */
export async function nutritionWeek(clientId: string, today: string): Promise<WeekDay[]> {
  const rows = await prisma.nutritionEntry.findMany({ where: { clientId, date: { gte: dayDate(addDays(today, -6)), lte: dayDate(today) } }, select: { date: true, manualMacros: true } });
  const grouped: Record<string, ReturnType<typeof unpackMacros>[]> = {};
  for (const r of rows) (grouped[dayOf(r.date)] ??= []).push(unpackMacros(r.manualMacros));
  const byDay: Record<string, { calories: number; uncounted: number }> = {};
  for (const day of Object.keys(grouped)) {
    const t = dayTotals(grouped[day]);
    byDay[day] = { calories: t.calories, uncounted: t.uncounted };
  }
  return lastDays(byDay, today, 7, addDays);
}
