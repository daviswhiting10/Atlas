/**
 * The coach's Dashboard: one card per active client, at a glance. Pure: no I/O (lib/coach/dashboard-data does the reading).
 *
 * Overdue is a starting rule, kept in one place so it is easy to tune: nothing logged for 5 or more days, or behind on the
 * week once it is past midweek (Thursday on). A client with no plan and nothing logged is "No plan", not overdue.
 */

export const OVERDUE_DAYS = 5;

export type Standing = "overdue" | "on-track" | "no-plan";

const DAY = 86_400_000;
const dayNum = (iso: string) => Math.floor(Date.parse(`${iso}T00:00:00Z`) / DAY);
/** Days from `from` to `to` (both "yyyy-mm-dd"). */
export const daysBetween = (from: string, to: string) => dayNum(to) - dayNum(from);
/** 1 = Monday ... 7 = Sunday. */
export const isoWeekday = (iso: string) => ((new Date(`${iso}T12:00:00Z`).getUTCDay() + 6) % 7) + 1;

export function standing(a: { today: string; lastDay: string | null; thisWeek: { done: number; planned: number } | null; hasPlan: boolean }): Standing {
  const since = a.lastDay ? daysBetween(a.lastDay, a.today) : null;
  if (!a.hasPlan && since == null) return "no-plan";
  if (since == null || since >= OVERDUE_DAYS) return a.hasPlan || since != null ? "overdue" : "no-plan";
  if (a.thisWeek && a.thisWeek.planned > 0) {
    const dow = isoWeekday(a.today);
    // Past midweek: by now the share of the week gone should be done.
    if (dow >= 4 && a.thisWeek.done < Math.floor((a.thisWeek.planned * dow) / 7)) return "overdue";
  }
  return "on-track";
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** "Today", "Yesterday", a weekday within the last week ("Mon"), else "9 days ago"; "No sessions yet" for none. */
export function lastLabel(lastDay: string | null, today: string): string {
  if (!lastDay) return "No sessions yet";
  const n = daysBetween(lastDay, today);
  if (n <= 0) return "Today";
  if (n === 1) return "Yesterday";
  if (n < 7) return WEEKDAYS[new Date(`${lastDay}T12:00:00Z`).getUTCDay()];
  return `${n} days ago`;
}

/** A day's colour step from its sets: 0 none, then 1-9, 10-19, 20-29, 30+ (the heatmap's four steps). */
export const stepOf = (sets: number, trained: boolean): 0 | 1 | 2 | 3 | 4 => (!trained ? 0 : sets >= 30 ? 4 : sets >= 20 ? 3 : sets >= 10 ? 2 : 1);

/**
 * The last four weeks as 28 days, Monday first: 4 rows (oldest on top), the last row being this week. -1 marks a day that
 * has not come yet. `byDay`: sets logged on each day with a session.
 */
export function glimpse(byDay: Record<string, number>, today: string): number[] {
  const out: number[] = [];
  const monday = new Date(Date.parse(`${today}T00:00:00Z`) - (isoWeekday(today) - 1) * DAY);
  for (let w = 3; w >= 0; w--) {
    for (let k = 0; k < 7; k++) {
      const day = new Date(monday.getTime() - w * 7 * DAY + k * DAY).toISOString().slice(0, 10);
      out.push(day > today ? -1 : stepOf(byDay[day] ?? 0, day in byDay));
    }
  }
  return out;
}

export type DashRow = {
  id: string;
  name: string;
  standing: Standing;
  lastLabel: string;
  lastWorkout: string | null;
  thisWeek: { done: number; planned: number } | null;
  glimpse: number[];
  trainedToday: boolean;
};

const rank: Record<Standing, number> = { overdue: 0, "on-track": 1, "no-plan": 2 };

/** Overdue first, then by who trained most recently, then by name. */
export function sortRows<T extends { standing: Standing; lastDay: string | null; name: string }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => rank[a.standing] - rank[b.standing] || (b.lastDay ?? "").localeCompare(a.lastDay ?? "") || a.name.localeCompare(b.name));
}

export type DashFilter = "all" | "overdue" | "today";
export function applyFilter(rows: DashRow[], f: DashFilter): DashRow[] {
  return f === "overdue" ? rows.filter((r) => r.standing === "overdue") : f === "today" ? rows.filter((r) => r.trainedToday) : rows;
}
