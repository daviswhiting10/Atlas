import { Medal as MedalIcon } from "lucide-react";
import type { Compare, Medal, Next } from "@/lib/coach/wrap-up";

const num = (n: number) => n.toLocaleString("en-US");
const weekday = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "short", timeZone: "UTC" });

/** New bests: a medal, the lift, its weight and how much it went up. Nothing at all (no heading) when there are none. */
export function Medals({ medals }: { medals: Medal[] }) {
  if (medals.length === 0) return null;
  return (
    <section aria-label="New bests" className="mt-6 text-left">
      <h2 className="text-[12px] font-semibold uppercase tracking-[0.1em] text-ink-mute">New bests</h2>
      <ul className="mt-1 divide-y divide-line border-y border-line">
        {medals.map((m) => (
          <li key={m.name} className="flex min-h-12 items-center justify-between gap-3 py-2 text-[16px]">
            <span className="flex min-w-0 items-center gap-2.5 text-ink">
              <MedalIcon className="h-5 w-5 shrink-0 text-[#d8b19d]" aria-hidden />
              <span className="truncate">{m.name}</span>
            </span>
            <span className="shrink-0 text-ink-soft">
              {num(m.weight)} lb <span className="ml-1 text-[13px] font-bold uppercase tracking-wide text-[#d8b19d]">+{num(m.delta)}</span>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Against last time. Without an earlier session there is nothing to compare, so no card; the parts that can't be said are left out. */
export function CompareCard({ compare }: { compare: Compare | null }) {
  if (!compare) return null;
  if (compare.kind === "partial") {
    return (
      <section aria-label="Partial session" className="mt-4 rounded-[20px] border border-line bg-paper px-4 py-3.5 text-left">
        <p className="text-[15px] font-semibold text-ink">
          Partial session <span className="font-normal text-ink-mute">· {compare.done} of {compare.planned} sets</span>
        </p>
      </section>
    );
  }
  const { volumePct, done, lastDone, skipped } = compare;
  return (
    <section aria-label="Against last time" className="mt-4 rounded-[20px] border border-line bg-paper px-4 py-3.5 text-left">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-[12px] font-semibold uppercase tracking-[0.1em] text-ink-mute">Against last time</h2>
        {volumePct != null && <span className={volumePct > 0 ? "text-[13px] font-semibold text-signal" : "text-[13px] font-medium text-ink-mute"}>{volumePct > 0 ? "+" : ""}{volumePct}% volume</span>}
      </div>
      <p className="mt-2 flex justify-between gap-3 text-[15px] text-ink">
        <span>Sets completed</span>
        <span className="tnum text-ink-soft">{done}{skipped != null ? ` of ${done + skipped}` : ""} (last {lastDone})</span>
      </p>
      {skipped != null && (
        <p className="mt-1.5 flex justify-between gap-3 text-[15px] text-ink">
          <span>Skipped</span>
          <span className="tnum text-ink-soft">{skipped === 0 ? "none" : skipped}</span>
        </p>
      )}
    </section>
  );
}

/** The athlete's note on the session, read-only, above the coach's own. Nothing when they wrote none. */
export function AthleteNote({ name, text }: { name: string; text: string | null }) {
  if (!text?.trim()) return null;
  return (
    <section aria-label={`${name}'s note`} className="mt-4 rounded-2xl border border-signal/30 bg-signal/10 px-4 py-3 text-left">
      <h2 className="text-[11px] font-bold uppercase tracking-[0.08em] text-signal">{name}&apos;s note</h2>
      <p className="mt-1 whitespace-pre-line text-[15px] leading-relaxed text-ink">{text}</p>
    </section>
  );
}

/** "Next for Alex: Lower A · Thu". Nothing when there is no plan or nothing left in it. */
export function NextFor({ name, next }: { name: string; next: Next }) {
  if (!next) return null;
  return (
    <p className="mt-3 text-center text-[14px] text-ink-mute">
      Next for {name}: <span className="text-ink-soft">{next.name} · {weekday(next.day)}</span>
    </p>
  );
}
