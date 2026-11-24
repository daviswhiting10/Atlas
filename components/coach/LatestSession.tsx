import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { FINISHED_BY_CLIENT } from "@/lib/coach/finished-by";
import { lastLogged } from "@/lib/coach/last-logged";
import type { LatestSession as Latest } from "@/lib/coach/latest-session";
import { exceptionGroups, setRange, type ExceptionGroup } from "@/lib/coach/review";

const num = (n: number) => (Number.isInteger(n) ? String(n) : (Math.round(n * 10) / 10).toString());
const range = (min?: number, max?: number) => (min == null ? "" : min === max || max == null ? `${min}` : `${min}–${max}`);
const at = (w: number | null | undefined) => (w ? `${num(w)} × ` : "");

const MARK = { beat: "▲", short: "▼", skipped: "–" } as const;
const TONE = { beat: "text-signal", short: "text-warn", skipped: "text-warn" } as const;
const TITLE = { beat: "Beat", short: "Short", skipped: "Skipped" } as const;

/** What a group of sets looked like: "all 3 sets: 75 × 7 (plan 70 × 6–10)". Sets with the same result share a line. */
function detail(g: ExceptionGroup): string {
  if (g.kind === "skipped") return setRange(g.sets.map((s) => s.n), g.total);
  const by = new Map<string, typeof g.sets>();
  for (const s of g.sets) {
    const k = `${s.actual?.weight ?? ""}|${s.actual?.reps ?? ""}`;
    by.set(k, [...(by.get(k) ?? []), s]);
  }
  return Array.from(by.values())
    .map((sets) => {
      const a = sets[0].actual;
      const ws = sets.map((s) => s.plan.weight).filter((w): w is number => typeof w === "number" && w > 0);
      const planW = ws.length ? `${Math.min(...ws) === Math.max(...ws) ? num(ws[0]) : `${num(Math.min(...ws))}–${num(Math.max(...ws))}`} × ` : "";
      return `${setRange(sets.map((s) => s.n), g.total)}: ${at(a?.weight)}${a?.reps} (plan ${planW}${range(sets[0].plan.repMin, sets[0].plan.repMax)})`;
    })
    .join(" · ");
}

/**
 * The latest finished plan session, judged against what was prescribed: the totals, any records, and only the sets
 * that beat the plan, fell short or were skipped. Sets done as planned are one closed line. One tap from the roster.
 */
export function LatestSession({ clientId, session: s, prs }: { clientId: string; session: Latest; /** Lifts with a record or new best in this session. */ prs: Array<{ name: string; value: number }> }) {
  const { counts, planned, onPlan } = s.review;
  const groups = exceptionGroups(s.review);
  const when = lastLogged(s.date);
  return (
    <section className="mb-8 rounded-[22px] border border-line bg-paper p-4 sm:max-w-md" aria-label="Latest session">
      <Link href={`/clients/${clientId}/sessions/${s.logId}`} className="press -mx-1 -mt-1 flex min-h-11 items-center justify-between gap-3 px-1">
        <span className="min-w-0 truncate text-[22px] font-semibold leading-tight text-ink">{s.workout}</span>
        <span className="shrink-0 text-[13px] text-ink-mute">
          {[when?.today ? "Today" : when?.label, s.minutes ? `${s.minutes} min` : null].filter(Boolean).join(" · ")}
        </span>
      </Link>
      {s.finishedByClient && <p className="text-[13px] text-ink-mute">{FINISHED_BY_CLIENT}</p>}

      <div className="mt-3 grid grid-cols-[1.4fr_1fr_1fr_1fr] gap-2">
        {[
          { n: onPlan, label: `/${planned} on plan`, tone: "text-ink" },
          { n: counts.beat, label: "beat", tone: counts.beat ? "text-signal" : "text-ink-mute" },
          { n: counts.short, label: "short", tone: counts.short ? "text-warn" : "text-ink-mute" },
          { n: counts.skipped, label: "skipped", tone: counts.skipped ? "text-warn" : "text-ink-mute" },
        ].map((x) => (
          <p key={x.label} className="flex flex-col">
            <span className={`tnum text-[28px] font-semibold leading-none ${x.tone}`}>{x.n}</span>
            <span className="mt-1.5 text-[11px] uppercase tracking-wide text-ink-mute">{x.label}</span>
          </p>
        ))}
      </div>

      {prs.length > 0 && (
        <p className="mt-3 flex flex-wrap gap-2">
          {prs.map((p) => (
            <span key={p.name} className="rounded-full border border-signal/40 px-3 py-1 text-[13px] font-semibold text-signal">
              PR · {p.name} {p.value}
            </span>
          ))}
        </p>
      )}

      {(s.note || s.athleteNote) && (
        <div className="mt-3 space-y-1.5 rounded-xl border border-line px-3 py-2 text-[14px] leading-snug text-ink-soft">
          {s.athleteNote && (
            <p>
              <span className="mr-1.5 text-[11px] font-semibold uppercase tracking-wider text-ink">Client</span>
              {s.athleteNote}
            </p>
          )}
          {s.note && (
            <p>
              <span className="mr-1.5 text-[11px] font-semibold uppercase tracking-wider text-ink">Coach</span>
              {s.note}
            </p>
          )}
        </div>
      )}

      {groups.length > 0 && (
        <ul className="mt-3 divide-y divide-line border-t border-line">
          {groups.map((g) => (
            <li key={`${g.kind}-${g.exercise}`} className="flex items-start gap-3 py-2.5">
              <span className={`mt-0.5 w-3 shrink-0 text-center text-[12px] ${TONE[g.kind]}`} title={TITLE[g.kind]} aria-label={TITLE[g.kind]}>
                {MARK[g.kind]}
              </span>
              <span className="min-w-0">
                <span className="block text-[15px] font-semibold text-ink">{g.exercise}</span>
                <span className="block text-[13px] leading-snug text-ink-mute">{detail(g)}</span>
              </span>
            </li>
          ))}
        </ul>
      )}

      {counts.met > 0 && (
        <p className="mt-2 flex items-center justify-between border-t border-line text-[13px] text-ink-mute">
          <span>
            <span className="tnum font-semibold text-ink-soft">{counts.met}</span> {counts.met === 1 ? "set" : "sets"}, as written
          </span>
          <Link href={`/clients/${clientId}/sessions/${s.logId}`} className="-mr-2 inline-flex min-h-11 items-center gap-0.5 px-2 font-medium text-ink-soft">
            All sets <ChevronRight className="h-3.5 w-3.5" />
          </Link>
        </p>
      )}
    </section>
  );
}
