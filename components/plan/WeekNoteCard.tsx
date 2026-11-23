import { Pin } from "lucide-react";
import type { WeekNote } from "@/lib/plan/week-notes";

/** A note pinned to a week of the plan: "WEEK 20 NOTE · COACH JESS", its title, its text. */
export function WeekNoteCard({ note, className = "" }: { note: WeekNote; className?: string }) {
  return (
    <div className={`flex gap-3 rounded-2xl border border-line bg-paper p-4 ${className}`}>
      <Pin className="mt-0.5 h-4 w-4 shrink-0 text-signal" aria-hidden />
      <div className="min-w-0">
        <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-signal">
          Week {note.week} note{note.by ? ` · ${note.by}` : ""}
        </p>
        {note.title && <p className="mt-1 text-[15px] font-semibold text-ink">{note.title}</p>}
        <p className="mt-0.5 text-[15px] leading-relaxed text-ink-soft">{note.text}</p>
      </div>
    </div>
  );
}

/** On Plan: the current week's note, then the weeks to come (nothing at all when there are no notes). */
export function WeekNotesList({ notes, currentWeek }: { notes: WeekNote[]; currentWeek: number }) {
  const now = notes.find((n) => n.week === currentWeek);
  const coming = notes.filter((n) => n.week > currentWeek);
  if (!now && coming.length === 0) return null;
  return (
    <div className="space-y-3">
      {now && <WeekNoteCard note={now} />}
      {coming.length > 0 && (
        <section aria-label="Coming weeks">
          <p className="mb-2 text-[13px] font-semibold uppercase tracking-[0.1em] text-ink-mute">Coming weeks</p>
          <ul className="divide-y divide-line border-y border-line">
            {coming.map((n) => (
              <li key={n.week} className="py-3 text-[15px]">
                <span className="font-semibold text-ink">Week {n.week}</span>
                {n.title ? <span className="text-ink"> · {n.title}</span> : null}
                <p className="mt-0.5 text-ink-soft">{n.text}</p>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
