/**
 * What the History section is sent in the browser: the calendar cut down to what is drawn. The full calendar (its week
 * rows, record flags, chapter bands, session ids and links for every day) stays on the server; for a year of training it
 * is tens of KB the heatmap never reads. Pure: no I/O.
 */
import type { CalendarSession, HistoryCalendar } from "./calendar";
import { heatDays, type HeatDays } from "./year-grid";

export type HistoryView =
  | { kind: "empty" }
  | { kind: "thin"; sessions: number; first: CalendarSession & { day: string } }
  | { kind: "grid"; sessions: number; today: string; summary: string; days: HeatDays };

export function historyView(c: HistoryCalendar): HistoryView {
  if (c.kind === "empty") return c;
  if (c.kind === "thin") return { kind: "thin", sessions: c.sessions, first: c.first };
  return { kind: "grid", sessions: c.sessions, today: c.today, summary: c.summary, days: heatDays(c.byDay) };
}
