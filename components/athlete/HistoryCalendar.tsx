"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ChevronRight, MoreHorizontal, X } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import type { SessionSummary } from "@/lib/actions/athlete";
import { shortDay, type CalendarSession } from "@/lib/history/calendar";
import type { HistoryView } from "@/lib/history/view";
import { useEscape } from "@/hooks/use-escape";
import { YearHeatmap } from "./YearHeatmap";

/** "18 sets · 55 min", leaving out what isn't there (never a zero). */
function detail(s: CalendarSession): string {
  return [s.sets > 0 ? `${s.sets} set${s.sets === 1 ? "" : "s"}` : null, s.minutes ? `${s.minutes} min` : null].filter(Boolean).join(" · ");
}

/** One session as a row: title, then sets and time; it opens the session when there is a page for it. */
function SessionRow({ s, sub, onOpen }: { s: CalendarSession; sub?: string; onOpen?: (s: CalendarSession) => void }) {
  const line = [sub, detail(s)].filter(Boolean).join(" · ");
  const body = (
    <>
      <span className="min-w-0">
        <span className="block truncate text-[17px] font-semibold text-ink">{s.title}</span>
        {(line || s.record) && (
          <span className="mt-0.5 block text-[15px] text-ink-mute">
            {line}
            {s.record && <span className="font-semibold text-gold">{line ? " · " : ""}Record</span>}
          </span>
        )}
      </span>
      {(s.href || onOpen) && <ChevronRight className="h-5 w-5 shrink-0 text-ink-mute" />}
    </>
  );
  const cls = "flex min-h-[64px] w-full items-center justify-between gap-3 border-t border-line py-3 text-left";
  // With a summary to show, a tap opens it (read-only) and editing is behind its menu; without one the row links to the session.
  if (onOpen) {
    return (
      <button type="button" onClick={() => onOpen(s)} className={`press ${cls}`}>
        {body}
      </button>
    );
  }
  return s.href ? (
    <Link href={s.href} className={`press ${cls}`}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}

/** What a finished session was: its sets by exercise. Read-only; Edit (behind the ⋯) opens the logger. */
function SummaryView({ s, load, onBack, onClose }: { s: CalendarSession; load: (id: string) => Promise<SessionSummary | null>; onBack: () => void; onClose: () => void }) {
  const [summary, setSummary] = useState<SessionSummary | null | "loading">("loading");
  useEffect(() => {
    let live = true;
    load(s.id)
      .then((r) => live && setSummary(r))
      .catch(() => live && setSummary(null));
    return () => {
      live = false;
    };
  }, [load, s.id]);
  return (
    <>
      <div className="flex min-h-12 items-center gap-1">
        <button type="button" onClick={onBack} aria-label="Back" className="press -ml-2 flex h-11 w-11 items-center justify-center rounded-full text-ink-soft">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <h3 className="min-w-0 flex-1 truncate text-[22px] font-semibold tracking-[-0.02em] text-ink">{s.title}</h3>
        {s.href && (
          <DropdownMenu>
            <DropdownMenuTrigger aria-label="More" className="press flex h-11 w-11 items-center justify-center rounded-full text-ink-soft">
              <MoreHorizontal className="h-5 w-5" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-[160px]">
              <DropdownMenuItem render={<Link href={s.href} />}>Edit</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
        <button type="button" onClick={onClose} aria-label="Close" className="press -mr-2 flex h-11 w-11 items-center justify-center rounded-full text-ink-soft">
          <X className="h-5 w-5" />
        </button>
      </div>
      {detail(s) && <p className="text-[15px] text-ink-mute">{detail(s)}</p>}
      <div className="mt-3 max-h-[55vh] overflow-y-auto">
        {summary === "loading" ? (
          <div className="h-24" aria-busy />
        ) : (
          summary?.lines.map((l) => (
            <div key={l.name} className="flex items-baseline justify-between gap-4 border-t border-line py-3">
              <span className="min-w-0 text-[16px] font-semibold text-ink">{l.name}</span>
              <span className="tnum shrink-0 text-right text-[15px] text-ink-soft">{l.sets}</span>
            </div>
          ))
        )}
      </div>
    </>
  );
}

/** A day's sessions in a bottom sheet: the day, then each session; with `summary`, tapping one shows what was done. */
function DaySheet({ day, sessions, summary, onClose }: { day: string; sessions: CalendarSession[]; summary?: (id: string) => Promise<SessionSummary | null>; onClose: () => void }) {
  const [view, setView] = useState<CalendarSession | null>(sessions.length === 1 && summary ? sessions[0] : null);
  useEscape(true, onClose);
  return (
    <div className="fade-in fixed inset-0 z-50 flex items-end bg-night/50 backdrop-blur-sm" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={shortDay(day)}
        onClick={(e) => e.stopPropagation()}
        className="sheet-up w-full rounded-t-[24px] border-t border-line bg-bone px-5 pt-3 sm:mx-auto sm:max-w-md sm:rounded-[24px]"
        style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 20px)" }}
      >
        {view && summary ? (
          <SummaryView s={view} load={summary} onBack={() => (sessions.length > 1 ? setView(null) : onClose())} onClose={onClose} />
        ) : (
          <>
            <div className="flex min-h-12 items-center justify-between gap-3">
              <h3 className="text-[22px] font-semibold tracking-[-0.02em] text-ink">{shortDay(day)}</h3>
              <button type="button" onClick={onClose} aria-label="Close" className="press -mr-2 flex h-11 w-11 items-center justify-center rounded-full text-ink-soft">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="mt-2">
              {sessions.map((s) => (
                <SessionRow key={s.id} s={s} onOpen={summary ? setView : undefined} />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/**
 * History: the session count and the year of training as a heatmap (YearHeatmap, from lib/history/calendar).
 * Under three sessions: "Day one" and the first session.
 */
export function HistoryCalendar({ calendar, summary }: { calendar: HistoryView; summary?: (id: string) => Promise<SessionSummary | null> }) {
  const [open, setOpen] = useState<string | null>(null);
  if (calendar.kind === "empty") return null;

  return (
    <section>
      <h2 className="mb-3 flex min-h-11 items-center text-[13px] font-semibold uppercase tracking-[0.1em] text-ink-mute">History</h2>
      {calendar.kind === "thin" ? (
        <>
          <p className="text-[44px] font-semibold leading-none tracking-[-0.04em] text-ink">Day one</p>
          <div className="mt-6">
            <SessionRow s={calendar.first} sub={shortDay(calendar.first.day)} onOpen={summary ? () => setOpen(calendar.first.day) : undefined} />
          </div>
          {open && summary && <DaySheet day={open} sessions={[calendar.first]} summary={summary} onClose={() => setOpen(null)} />}
        </>
      ) : (
        <>
          <p className="flex items-baseline gap-2">
            <span className="text-[56px] font-semibold leading-none tracking-[-0.04em] text-ink">{calendar.sessions}</span>
            <span className="text-[15px] font-medium text-ink-mute">{calendar.sessions === 1 ? "session" : "sessions"}</span>
          </p>
          <p className="sr-only">{calendar.summary}</p>
          <div className="mt-6">
            <YearHeatmap byDay={calendar.days} today={calendar.today} summary={calendar.summary} challenge={calendar.challenge} />
          </div>
        </>
      )}
    </section>
  );
}
