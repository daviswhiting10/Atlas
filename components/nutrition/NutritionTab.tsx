import { nutritionToday, nutritionWeek } from "@/lib/nutrition/data";
import { dayName } from "@/lib/nutrition/calc";
import { DeleteEntry, LogFoodButton, TargetsEditor } from "./NutritionParts";

const card = "rounded-[22px] border border-line bg-paper p-4";
const label = "text-[13px] font-semibold uppercase tracking-[0.1em] text-ink-mute";

/** You > Nutrition: today's entries, the seven-day bars against the calorie target, and the targets. */
export async function NutritionTab({ clientId }: { clientId: string }) {
  const today = await nutritionToday(clientId);
  const week = await nutritionWeek(clientId, today.day);
  const target = today.targets.calories;
  const top = Math.max(target ?? 0, ...week.map((d) => d.calories), 1);
  // Average over the days that have calories logged (a day with nothing logged is not a day of zero).
  const logged = week.filter((d) => d.calories > 0);
  const avg = logged.length ? Math.round(logged.reduce((n, d) => n + d.calories, 0) / logged.length) : 0;
  const onTarget = target ? week.filter((d) => d.calories > 0 && d.calories <= target).length : null;

  return (
    <div className="space-y-4">
      <TargetsEditor initial={today.targets} />

      <section className={card}>
        <div className="flex items-baseline justify-between gap-3">
          <p className={label}>Last 7 days</p>
          <p className="text-[13px] text-ink-mute">{logged.length === 0 ? "nothing logged yet" : target ? `avg ${avg.toLocaleString()} · on target ${onTarget} of ${logged.length} logged days` : `avg ${avg.toLocaleString()} kcal on logged days`}</p>
        </div>
        <div className="relative mt-4 flex h-28 items-end gap-2" role="img" aria-label={week.map((d) => `${dayName(d.day)}: ${d.calories} kcal`).join(". ")}>
          {target ? <div className="absolute inset-x-0 border-t border-dashed border-line-strong" style={{ bottom: `${(target / top) * 100}%` }} /> : null}
          {week.map((d) => (
            <div key={d.day} className={"flex-1 rounded-t-md " + (target && d.calories > target ? "bg-gold/70" : "bg-signal/70")} style={{ height: `${Math.max(d.calories > 0 ? 4 : 0, (d.calories / top) * 100)}%` }} />
          ))}
        </div>
        <div className="mt-1.5 flex gap-2 text-[11px] text-ink-mute">
          {week.map((d) => (
            <span key={d.day} className="flex-1 text-center">
              {dayName(d.day).slice(0, 1)}
            </span>
          ))}
        </div>
      </section>

      <section className={card}>
        <p className={label}>Today</p>
        {today.entries.length === 0 ? (
          <p className="mt-3 text-[15px] text-ink-mute">Nothing logged yet.</p>
        ) : (
          <ul className="mt-1">
            {today.entries.map((e) => (
              <li key={e.id} className="flex items-center gap-3 border-t border-line py-2 first:border-t-0">
                {e.photo ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={e.photo} alt="" className="h-12 w-12 shrink-0 rounded-lg object-cover" />
                ) : null}
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[16px] font-semibold text-ink">{e.name}</span>
                  <span className="block truncate text-[13px] text-ink-mute">
                    {e.calories != null ? `${Math.round(e.calories)} kcal${e.proteinG != null ? ` · ${Math.round(e.proteinG)} g protein` : ""}${e.grams ? ` · ${Math.round(e.grams)} g` : ""}` : e.source === "PHOTO" ? "Photo note · no calories" : "No calories"}
                    {e.note ? ` · ${e.note}` : ""}
                  </span>
                </span>
                <DeleteEntry id={e.id} name={e.name} />
              </li>
            ))}
          </ul>
        )}
      </section>

      <LogFoodButton />
    </div>
  );
}
