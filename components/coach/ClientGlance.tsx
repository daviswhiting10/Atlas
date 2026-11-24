import type { DayBar, Stat } from "@/lib/coach/glance";

/**
 * The client page's first glance, quiet on purpose: the last 30 days as small bars (sets a day), then one row of numbers
 * (this week, sessions, strength). No cards; it is a few lines of text and a thin chart.
 */
export function ClientGlance({ days, stats }: { days: DayBar[]; stats: Stat[] }) {
  const max = Math.max(1, ...days.map((d) => d.sets));
  const total = days.reduce((n, d) => n + d.sets, 0);
  return (
    <section aria-label="Last 30 days" className="mb-5 sm:max-w-md">
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-[12px] font-semibold uppercase tracking-[0.1em] text-ink-mute">Last 30 days</p>
        <p className="text-[12px] text-ink-mute">{total} sets</p>
      </div>
      <svg role="img" aria-label={`Sets a day, last 30 days: ${total} in all`} viewBox="0 0 300 48" preserveAspectRatio="none" className="mt-2 h-12 w-full text-signal">
        {days.map((d, i) => {
          const h = d.sets === 0 ? 2 : Math.max(5, (d.sets / max) * 44);
          return <rect key={d.day} x={i * 10 + 1.5} y={46 - h} width={7} height={h} rx={2} fill="currentColor" opacity={d.sets === 0 ? 0.18 : 1} />;
        })}
      </svg>
      <p className="mt-3 flex flex-wrap items-baseline gap-x-5 gap-y-1">
        {stats.map((s) => (
          <span key={s.label} className="text-[14px] text-ink-soft">
            <span className="tnum mr-1 text-[17px] font-semibold text-ink">{s.value}</span>
            {s.label}
          </span>
        ))}
      </p>
    </section>
  );
}
