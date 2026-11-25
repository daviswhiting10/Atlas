/**
 * The client page's first glance: the last 30 days as one bar per day (sets done), and the few numbers that matter, in one
 * compact row. Pure: no I/O.
 */
import type { CalendarSession } from "@/lib/history/calendar";

export type DayBar = { day: string; sets: number; /** The sessions that day, for the tooltip and the tap. */ sessions: Array<{ id: string; title: string; sets: number; href: string | null }> };

const addDays = (iso: string, k: number) => new Date(Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10) + k)).toISOString().slice(0, 10);

/** The `days` days ending today (oldest first), each with the sets logged that day. A day with a session but no sets counts 1, so it still shows. */
export function lastDays(byDay: Record<string, CalendarSession[]>, today: string, days = 30): DayBar[] {
  return Array.from({ length: days }, (_, i) => {
    const day = addDays(today, i - (days - 1));
    const list = byDay[day] ?? [];
    const sets = list.reduce((n, s) => n + s.sets, 0);
    return { day, sets: sets > 0 ? sets : list.length > 0 ? 1 : 0, sessions: list.map((x) => ({ id: x.id, title: x.title, sets: x.sets, href: x.href })) };
  });
}

export type Stat = { value: string; label: string };

/** The stats row: this week (done of planned), sessions in all, and the overall strength change when there is one. */
export function glanceStats(a: { week: { done: number; planned: number } | null; sessions: number; change: number | null }): Stat[] {
  return [
    ...(a.week ? [{ value: `${a.week.done}/${a.week.planned}`, label: "this week" }] : []),
    { value: String(a.sessions), label: a.sessions === 1 ? "session" : "sessions" },
    ...(a.change != null ? [{ value: `${a.change > 0 ? "+" : ""}${a.change}%`, label: "strength" }] : []),
  ];
}

/** The tooltip's line for a day: "Nov 21 · Upper A · 14 sets" (several sessions: their names joined, the sets added). */
export function barTip(d: DayBar): string {
  const date = new Date(`${d.day}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
  if (d.sessions.length === 0) return `${date} · no session`;
  const names = Array.from(new Set(d.sessions.map((x) => x.title))).join(", ");
  const sets = d.sessions.reduce((n, x) => n + x.sets, 0);
  return [date, names, sets > 0 ? `${sets} ${sets === 1 ? "set" : "sets"}` : ""].filter(Boolean).join(" · ");
}
