import { cn } from "@/lib/utils";

export type Stat = { label: string; value: string; unit?: string; hint?: string };

/** Headline numbers in one row, separated by hairlines. Deliberately not cards. */
export function StatRow({ stats, className, size = "lg" }: { stats: Stat[]; className?: string; size?: "lg" | "sm" }) {
  return (
    <dl className={cn("rule grid grid-cols-2 border-b border-line sm:flex", className)}>
      {stats.map((s, i) => (
        <div
          key={s.label}
          className={cn(
            "py-4 sm:flex-1 sm:px-6 sm:first:pl-0 sm:last:pr-0",
            i > 0 && "sm:border-l sm:border-line",
            i % 2 === 1 && "border-l border-line pl-5 sm:pl-6",
            i >= 2 && "border-t border-line sm:border-t-0"
          )}
        >
          <dt className="eyebrow">{s.label}</dt>
          <dd className={cn("mt-1.5 font-semibold tracking-tight text-ink", size === "lg" ? "text-[28px] leading-none" : "text-[17px] leading-snug")}>
            {s.value}
            {s.unit && <span className="ml-1 text-sm font-normal text-ink-mute">{s.unit}</span>}
          </dd>
          {s.hint && <p className="mt-1.5 text-[13px] text-ink-mute">{s.hint}</p>}
        </div>
      ))}
    </dl>
  );
}
