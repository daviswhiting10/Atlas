"use server";

import { DEMO_CALENDAR } from "@/lib/demo/sample";
import type { CalendarSession } from "@/lib/history/calendar";

/** The demo's heatmap day: its sessions from the sample calendar (read-only; nothing is read from the database). */
export async function demoHistoryDay(day: string): Promise<CalendarSession[]> {
  return DEMO_CALENDAR.kind === "grid" ? (DEMO_CALENDAR.byDay[day] ?? []) : [];
}
