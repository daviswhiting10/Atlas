import Link from "next/link";
import { Check } from "lucide-react";
import type { UpNextView } from "@/lib/plan/up-next";
import { cn } from "@/lib/utils";

/** The Plan tab's first screen: up next with its exercises and Start, then the rest of this week as rows. */
export function PlanUpNext({ view, totalWeeks, canEdit }: { view: UpNextView; totalWeeks: number; canEdit: boolean }) {
  const { next } = view;
  return (
    <div className="max-w-xl">
      {next ? (
        <section aria-label="Up next" className="rise rounded-2xl border border-line bg-paper p-4">
          <p className="eyebrow">Up next</p>
          <p className="mt-1 text-[22px] font-semibold leading-tight text-ink">
            {next.name}
            {next.lighter && <span className="ml-2 inline-block rounded-full bg-ink px-2 py-0.5 align-middle text-[10px] font-bold uppercase tracking-[0.06em] text-paper">Lighter week</span>}
          </p>
          <p className="mt-0.5 text-[13px] text-ink-mute">{next.meta}</p>
          <ul className="mb-3.5 mt-3">
            {next.lines.map((l, i) => (
              <li key={`${l.name}-${i}`} className="flex justify-between gap-3 border-t border-line py-2 text-[14px] text-ink-soft first:border-t-0">
                <span className="min-w-0 truncate">{l.name}</span>
                <span className="tnum shrink-0">{l.rx}</span>
              </li>
            ))}
            {next.more > 0 && <li className="border-t border-line py-2 text-[14px] text-ink-soft">+ {next.more} more</li>}
          </ul>
          <Link href={`/workouts/${next.id}`} className="press flex h-[52px] w-full items-center justify-center rounded-2xl bg-dusk-button text-[17px] font-semibold text-dusk-button-text hover:bg-dusk-button/85">
            Start
          </Link>
        </section>
      ) : (
        <section className="rise rounded-2xl border border-line bg-paper p-4">
          <p className="text-[17px] font-semibold text-ink">Every workout in this plan is done.</p>
        </section>
      )}

      {view.rows.length > 0 && (
        <>
          <p className="eyebrow mb-2 mt-6">{view.weekLabel}</p>
          <ul className="overflow-hidden rounded-2xl border border-line bg-paper">
            {view.rows.map((r) => (
              <li key={r.id} className="border-t border-line first:border-t-0">
                <Link href={`/workouts/${r.id}`} className="press flex min-h-16 items-center gap-3 px-4 py-3.5">
                  <span className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[15px]", r.done ? "bg-signal text-dusk-button-text" : "bg-ink/10 text-ink")}>
                    {r.done ? <Check className="h-4 w-4" aria-label="Done" /> : r.dot}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[16px] font-semibold text-ink">{r.name}</span>
                    <span className="mt-0.5 block text-[13px] text-ink-mute">{r.meta}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}

      <div className="mt-1.5 flex items-center justify-between">
        <Link href="/plan?view=all" className="press inline-flex min-h-11 items-center text-[14px] font-medium text-ink-soft">
          All {totalWeeks} weeks
        </Link>
        {canEdit && (
          <Link href="/plan?view=edit" className="press inline-flex min-h-11 items-center text-[14px] font-medium text-ink-soft">
            Edit plan
          </Link>
        )}
      </div>
    </div>
  );
}
