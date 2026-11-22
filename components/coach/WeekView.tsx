import { Check } from "lucide-react";
import type { WeekData } from "@/lib/coach/week-data";
import type { MainLift } from "@/lib/coach/week";

const label = "text-[13px] font-semibold uppercase tracking-[0.1em] text-ink-mute";

/** A thin line with a dot on its last value. */
function Line({ values }: { values: number[] }) {
  const w = 96;
  const h = 30;
  const lo = Math.min(...values);
  const span = Math.max(...values) - lo || 1;
  const xy = values.map((v, i) => [4 + (i / Math.max(values.length - 1, 1)) * (w - 8), h - 5 - ((v - lo) / span) * (h - 10)]);
  const last = xy[xy.length - 1];
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} fill="none" className="shrink-0 text-signal" aria-hidden>
      <polyline points={xy.map((p) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" ")} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={last[0]} cy={last[1]} r="3" fill="currentColor" />
    </svg>
  );
}

/**
 * The client page's first tab: sessions done of planned this week (a chip for each planned workout), then the main
 * lifts' lines. The full progress charts follow, below (children).
 */
export function WeekView({ week, lifts }: { week: WeekData | null; lifts: MainLift[] }) {
  return (
    <div className="space-y-8">
      {week && (
        <section aria-label="This week">
          <p className="tnum flex items-baseline gap-2">
            <span className="text-[56px] font-semibold leading-none tracking-[-0.04em] text-ink">{week.done}</span>
            <span className="text-[24px] font-medium text-ink-mute">/{week.planned}</span>
            <span className="ml-1 text-[15px] text-ink-mute">this week{week.lighter ? " · lighter" : ""}</span>
          </p>
          <ul className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {week.chips.map((c, i) => (
              <li
                key={`${c.date}-${i}`}
                className={`flex min-h-[52px] items-center justify-between gap-2 rounded-2xl border px-3 text-[14px] font-medium ${c.done ? "border-signal/50 text-signal" : "border-line text-ink-mute"}`}
              >
                <span className="min-w-0 truncate">{c.name}</span>
                {c.done ? <Check className="h-4 w-4 shrink-0" strokeWidth={3} aria-label="done" /> : <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-ink/25" aria-label="not yet" />}
              </li>
            ))}
          </ul>
        </section>
      )}

      {lifts.length > 0 && (
        <section aria-label="Main lifts">
          <p className={label}>Main lifts · {lifts.some((l) => l.loaded) ? "est. max" : "reps"}</p>
          <ul className="mt-3 divide-y divide-line overflow-hidden rounded-[22px] border border-line bg-paper">
            {lifts.map((l) => (
              <li key={l.name} className="flex min-h-[68px] items-center gap-3 px-4 py-2.5">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[16px] font-semibold text-ink">{l.name}</span>
                  <span className={`tnum block text-[13px] ${l.delta > 0 ? "text-signal" : "text-ink-mute"}`}>
                    {l.delta > 0 ? "+" : ""}
                    {l.delta}
                    {l.loaded ? " lb" : " reps"}
                  </span>
                </span>
                <Line values={l.values} />
                <span className="tnum w-12 text-right text-[17px] font-semibold text-ink">{l.latest}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
