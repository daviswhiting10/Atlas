import { format, parseISO } from "date-fns";
import type { Chapter } from "@/lib/goals/chapter";
import type { GoalSession } from "@/lib/goals/data";
import { StatRow } from "@/components/athlete/StatRow";
import { GoalStrip, StripLegend } from "./GoalStrip";
import { SealButton } from "./SealButton";

const d = (day: string, withYear = false) => format(parseISO(day), withYear ? "MMM d, yyyy" : "MMM d");

/** A finished goal: the cover, the numbers, what it took. Never uses the words missed or failed. */
export function ChapterView({ goalId, chapter, sealed, sealsAt, sessions }: { goalId: string; chapter: Chapter; sealed: boolean; sealsAt: Date | null; sessions: GoalSession[] }) {
  const longest = Math.max(1, ...chapter.attempts.map((a) => a.days));
  const inRange = sessions.filter((s) => s.day >= chapter.range.startDay && s.day <= chapter.range.endDay);
  const columns = chapter.strip.cells.length > 40 ? 25 : 15;

  return (
    <div className="space-y-10">
      <section className="surface-night rise p-6 sm:p-10">
        <p className="font-mono text-[12px] uppercase tracking-[0.09em] text-white/55">
          {d(chapter.range.startDay)} – {d(chapter.range.endDay, true)}
        </p>
        <h1 className="mt-3 text-5xl leading-none sm:text-6xl">{chapter.name}</h1>
        <p className="mt-3 text-xl text-white/75">{chapter.line}</p>
        <div className="mt-8">
          <GoalStrip cells={chapter.strip.cells} dark columns={columns} />
          <StripLegend cells={chapter.strip.cells} dark />
        </div>
      </section>

      <p className="-mt-6 text-[13px] text-ink-mute">
        {sealed ? "Sealed. This record won't change." : `Draft. It can still change until ${sealsAt ? format(sealsAt, "MMM d 'at' h:mm a") : "it seals"}, or `}
        {!sealed && <SealButton goalId={goalId} />}
      </p>

      <StatRow
        stats={[
          { label: "Workouts", value: String(chapter.numbers.sessions) },
          { label: "Active days", value: String(chapter.numbers.activeDays) },
          { label: "Time", value: chapter.numbers.minutes != null ? String(Math.round(chapter.numbers.minutes / 60)) : "—", unit: chapter.numbers.minutes != null ? "hours" : undefined },
          { label: "Best run", value: String(chapter.numbers.bestRun.days), unit: "days" },
        ]}
      />

      {chapter.carriedIn && (
        <p className="text-[14px] text-ink-soft">
          {chapter.carriedIn.days} days, {d(chapter.carriedIn.from)} through {d(chapter.carriedIn.to)}, happened before Atlas. They count as done; the workouts and ticks below are from {d(chapter.carriedIn.to === chapter.range.endDay ? chapter.carriedIn.to : addOne(chapter.carriedIn.to))} on.
        </p>
      )}

      <section>
        <h2 className="text-xl text-ink">What it took</h2>
        <ul className="mt-3 divide-y divide-line">
          {chapter.rules.map((r) => (
            <li key={r.key} className="py-3">
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-[15px] font-semibold text-ink">{r.label}</span>
                <span className="text-[13px] text-ink-mute">{r.of > 0 ? `${r.met} of ${r.of}` : "before Atlas only"}</span>
              </div>
              {r.of > 0 && (
                <div className="mt-2 h-1 rounded-full bg-ink/10">
                  <div className="h-1 rounded-full bg-signal" style={{ width: `${Math.round((r.met / r.of) * 100)}%` }} />
                </div>
              )}
            </li>
          ))}
        </ul>
      </section>

      {chapter.attempts.length > 1 && (
        <section>
          <h2 className="text-xl text-ink">Attempts</h2>
          <ul className="mt-3 space-y-2.5">
            {chapter.attempts.map((a, i) => (
              <li key={a.from} className="flex items-center gap-3">
                <span className="w-24 shrink-0 text-[13px] text-ink-mute">
                  {d(a.from)} · {a.days} days
                </span>
                <span className="h-2 rounded-full bg-signal" style={{ width: `${Math.max(4, Math.round((a.days / longest) * 100))}%`, opacity: i === chapter.attempts.length - 1 ? 1 : 0.45 }} />
              </li>
            ))}
          </ul>
        </section>
      )}

      <details className="text-[14px]">
        <summary className="cursor-pointer text-[15px] font-semibold text-ink">The {inRange.length} workouts</summary>
        <p className="mt-2 text-[13px] text-ink-mute">As they are now. If something was edited after this was sealed, it can differ from the numbers above.</p>
        <ul className="mt-2 divide-y divide-line">
          {inRange.map((s) => (
            <li key={s.id} className="flex items-center justify-between py-2.5">
              <span className="text-ink">{s.title?.trim() || "Workout"}</span>
              <span className="text-ink-mute">
                {d(s.day)}
                {s.durationMin ? ` · ${s.durationMin} min` : ""}
              </span>
            </li>
          ))}
        </ul>
      </details>
    </div>
  );
}

const addOne = (day: string) => new Date(Date.parse(`${day}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
