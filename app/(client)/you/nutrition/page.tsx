import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getAthlete } from "@/lib/athlete/data";
import { nutritionEnabled } from "@/lib/nutrition/flag";
import { NutritionTab } from "@/components/nutrition/NutritionTab";
import { YouTabs } from "@/components/nutrition/YouTabs";

export const metadata: Metadata = { title: "Nutrition" };

export default async function NutritionPage() {
  // Behind the NUTRITION flag: with it off this page does not exist.
  if (!nutritionEnabled()) notFound();
  const athlete = await getAthlete();
  return (
    <div className="rise">
      <h1 className="truncate text-3xl leading-none text-ink sm:text-4xl">{athlete.name}</h1>
      <div className="mt-6">
        <YouTabs active="nutrition" />
        <NutritionTab clientId={athlete.clientId} />
      </div>
    </div>
  );
}
