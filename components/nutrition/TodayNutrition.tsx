import { nutritionToday } from "@/lib/nutrition/data";
import { TodayNutritionRow } from "./NutritionParts";

/** The Nutrition row under Today's workout card. The page only renders this while the NUTRITION flag is on. */
export async function TodayNutrition({ clientId }: { clientId: string }) {
  const { totals, targets } = await nutritionToday(clientId);
  return <TodayNutritionRow calories={totals.calories} target={targets.calories} proteinG={totals.proteinG} proteinTarget={targets.proteinG} uncounted={totals.uncounted} />;
}
