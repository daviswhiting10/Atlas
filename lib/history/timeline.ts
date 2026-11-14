/**
 * The long-scroll timeline: the milestones of someone's history, newest first
 * (docs/archive-and-chapters.md, 1c).
 *
 * What appears, in priority order (the tier):
 *   1 chapters (a finished goal)
 *   2 records on key lifts (heaviest weight ever)
 *   3 session-count milestones: 10, 25, 50, 100, then every 100
 *   4 firsts: the first session; the first time of a lift later done ten times;
 *     the plate thresholds on a main lift (135, 185, 225 ...)
 *   5 comebacks: the first session after 21 or more quiet days (the plateau
 *     detector's threshold), with the quiet stretch attached for the dashed spine
 *   6 best week and best month, when one beats every earlier one
 *
 * **At most five events a month**, by that ranking. Within a tier the more recent
 * event wins, then the larger number. The rest are returned in `more`, one group
 * per month ("More from March"), so a view can collapse them. One exception: the
 * very first session is never collapsed (it still takes one of the five).
 *
 * Every event has a `title` and a one-line `line`, in the neutral wording of
 * copy.ts. Every event sits on the day it happened (the athlete's day, from the
 * session's `date`), so a session logged late appears where it belongs. The
 * numbered milestones are derived from the sessions each time, never stored.
 *
 * Pure: no I/O.
 */

import { mondayOf } from "@/lib/athlete/sessions";
import { addDays, daysBetween } from "@/lib/goals/days";
import { capitalize, lb, monthName, numberWord, ordinal, plural, shortDate } from "./copy";
import { datedFinished, isLoggedSet } from "./days";
import { prsOverTime } from "./records";
import type { HistorySession } from "./types";

export type PlateLift = "bench" | "squat" | "deadlift" | "ohp";

/** An exercise the timeline may talk about. */
export type TimelineExercise = {
  id: string;
  name: string;
  /** A lift that matters to this athlete: its records are on the timeline. */
  keyLift?: boolean;
  /** A main lift whose plate thresholds are marked. */
  plate?: PlateLift;
};

/** A finished goal, as the timeline needs it. A plain type for now. */
export type TimelineChapter = {
  id: string;
  name: string;
  outcome: "completed" | "ended";
  startDay: string;
  endDay: string;
  /** The chapter's one-line headline, e.g. "Completed. 75 days, third attempt." */
  line: string;
};

export type TimelineKind = "chapter" | "record" | "count" | "first_session" | "first_lift" | "plate" | "comeback" | "best_week" | "best_month";

export type TimelineEvent = {
  /** Stable for the same history. */
  id: string;
  /** The day it happened, yyyy-mm-dd. */
  day: string;
  kind: TimelineKind;
  /** 1 (most important) to 6. */
  tier: 1 | 2 | 3 | 4 | 5 | 6;
  title: string;
  line: string;
  /** A number to show: lb for records and plates, sessions for counts and bests. */
  value?: number;
  exerciseId?: string;
  chapterId?: string;
  /** A comeback: the quiet stretch before it, for the dashed spine. */
  gap?: { from: string; to: string; days: number; line: string };
};

export type Timeline = {
  /** The events to show, newest first. */
  events: TimelineEvent[];
  /** What the cap collapsed, one group per month, newest first. */
  more: Array<{ month: string; label: string; events: TimelineEvent[] }>;
};

export const EVENTS_PER_MONTH = 5;
/** Quiet days (days with no session) that make the next session a comeback. */
export const COMEBACK_QUIET_DAYS = 21;
/** A best week needs at least this many sessions, a best month at least this many. */
export const MIN_BEST_WEEK = 3;
export const MIN_BEST_MONTH = 8;
/** A lift done this many times earns a "first" entry for the first time. */
export const FIRST_LIFT_SESSIONS = 10;

// Keep in step with PLATE_THRESHOLDS in lib/progress/milestones.ts (that file
// reaches the database, so it can't be imported here).
const PLATES: Record<PlateLift, Array<{ weight: number; label: string }>> = {
  bench: [
    { weight: 135, label: "First plate on bench" },
    { weight: 185, label: "185 lb bench" },
    { weight: 225, label: "Two plates on bench" },
    { weight: 275, label: "275 lb bench" },
    { weight: 315, label: "Three plates on bench" },
  ],
  squat: [
    { weight: 135, label: "First plate on squat" },
    { weight: 225, label: "Two plates on squat" },
    { weight: 315, label: "Three plates on squat" },
    { weight: 405, label: "Four plates on squat" },
  ],
  deadlift: [
    { weight: 135, label: "First plate on deadlift" },
    { weight: 225, label: "Two plates on deadlift" },
    { weight: 315, label: "Three plates on deadlift" },
    { weight: 405, label: "Four plates on deadlift" },
    { weight: 495, label: "495 lb deadlift" },
  ],
  ohp: [
    { weight: 95, label: "95 lb overhead press" },
    { weight: 135, label: "135 lb overhead press" },
    { weight: 185, label: "185 lb overhead press" },
  ],
};

const TIER: Record<TimelineKind, TimelineEvent["tier"]> = {
  chapter: 1,
  record: 2,
  count: 3,
  first_session: 4,
  first_lift: 4,
  plate: 4,
  comeback: 5,
  best_week: 6,
  best_month: 6,
};

/** 10, 25, 50, 100, 200, 300 ... up to `total`. (The first session has its own entry.) */
function milestoneCounts(total: number): number[] {
  const out = [10, 25, 50].filter((n) => n <= total);
  for (let n = 100; n <= total; n += 100) out.push(n);
  return out;
}

export function timelineEvents(
  sessions: HistorySession[],
  opts: { timeZone: string; today: string; exercises?: TimelineExercise[]; chapters?: TimelineChapter[]; perMonth?: number }
): Timeline {
  const perMonth = Math.max(1, Math.floor(opts.perMonth ?? EVENTS_PER_MONTH));
  const exercises = new Map((opts.exercises ?? []).map((e) => [e.id, e] as const));
  const dated = datedFinished(sessions, opts.timeZone, opts.today);
  const events: TimelineEvent[] = [];
  const push = (e: Omit<TimelineEvent, "tier">) => events.push({ ...e, tier: TIER[e.kind] });

  // Chapters
  for (const c of opts.chapters ?? []) {
    push({ id: `chapter:${c.id}`, day: c.endDay, kind: "chapter", title: c.name, line: c.line, chapterId: c.id });
  }

  if (dated.length > 0) {
    // First session, and session counts
    push({ id: "first_session", day: dated[0].day, kind: "first_session", title: "First session", line: "Your history starts here." });
    for (const n of milestoneCounts(dated.length)) {
      push({
        id: `count:${n}`,
        day: dated[n - 1].day,
        kind: "count",
        title: `${n} sessions`,
        line: `Your ${ordinal(n)} session.`,
        value: n,
      });
    }

    // Records on key lifts
    const keyIds = new Set((opts.exercises ?? []).filter((e) => e.keyLift).map((e) => e.id));
    const weight = prsOverTime(sessions, { metric: "weight", timeZone: opts.timeZone });
    for (const id of Object.keys(weight)) {
      if (!keyIds.has(id)) continue;
      const name = (exercises.get(id) as TimelineExercise).name;
      for (const p of weight[id].records) {
        if (p.day > opts.today) continue;
        push({ id: `record:${id}:${p.sessionId}`, day: p.day, kind: "record", title: `${name} ${lb(p.value)} lb`, line: "Heaviest set so far.", value: p.value, exerciseId: id });
      }
    }

    // Firsts: a lift later done many times, and plate thresholds
    const seen = new Map<string, { sessions: number; firstDay: string }>();
    const plateReached = new Map<string, Set<number>>();
    for (const { session, day } of dated) {
      const inSession = new Set<string>();
      for (const s of session.sets) {
        if (!isLoggedSet(s) || s.exerciseId == null) continue;
        inSession.add(s.exerciseId);
        const ex = exercises.get(s.exerciseId);
        if (ex?.plate && s.weight != null) {
          const reached = plateReached.get(s.exerciseId) ?? new Set<number>();
          plateReached.set(s.exerciseId, reached);
          for (const t of PLATES[ex.plate]) {
            if (s.weight >= t.weight && !reached.has(t.weight)) {
              reached.add(t.weight);
              push({ id: `plate:${s.exerciseId}:${t.weight}`, day, kind: "plate", title: t.label, line: `First set at ${t.weight} lb.`, value: t.weight, exerciseId: s.exerciseId });
            }
          }
        }
      }
      inSession.forEach((id) => {
        const cur = seen.get(id);
        if (cur) cur.sessions += 1;
        else seen.set(id, { sessions: 1, firstDay: day });
      });
    }
    seen.forEach((info, id) => {
      const ex = exercises.get(id);
      if (!ex || info.sessions < FIRST_LIFT_SESSIONS) return;
      push({ id: `first_lift:${id}`, day: info.firstDay, kind: "first_lift", title: `First ${ex.name}`, line: `You went on to do it ${info.sessions} times.`, exerciseId: id });
    });

    // Comebacks
    for (let i = 1; i < dated.length; i++) {
      const prev = dated[i - 1].day;
      const day = dated[i].day;
      const gapDays = daysBetween(prev, day);
      const quiet = gapDays - 1;
      if (quiet < COMEBACK_QUIET_DAYS) continue;
      push({
        id: `comeback:${day}`,
        day,
        kind: "comeback",
        title: `Back on ${shortDate(day)}`,
        line: `First session in ${numberWord(Math.round(gapDays / 7))} weeks.`,
        gap: { from: addDays(prev, 1), to: addDays(day, -1), days: quiet, line: `${capitalize(numberWord(Math.floor(quiet / 7)))} quiet weeks.` },
      });
    }

    // Best week and best month: complete ones only, and only when they beat every earlier one
    const weekCounts = new Map<string, number>();
    const monthCounts = new Map<string, number>();
    for (const { day } of dated) {
      weekCounts.set(mondayOf(day), (weekCounts.get(mondayOf(day)) ?? 0) + 1);
      monthCounts.set(day.slice(0, 7), (monthCounts.get(day.slice(0, 7)) ?? 0) + 1);
    }
    let bestWeek = 0;
    for (let w = mondayOf(dated[0].day); addDays(w, 6) < opts.today; w = addDays(w, 7)) {
      const n = weekCounts.get(w) ?? 0;
      if (bestWeek > 0 && n > bestWeek && n >= MIN_BEST_WEEK) {
        push({ id: `best_week:${w}`, day: addDays(w, 6), kind: "best_week", title: "Best week", line: `${plural(n, "session")}, the most in a week so far.`, value: n });
      }
      bestWeek = Math.max(bestWeek, n);
    }
    let bestMonth = 0;
    for (let m = dated[0].day.slice(0, 7); ; m = nextMonth(m)) {
      const last = lastDayOfMonth(m);
      if (last >= opts.today) break;
      const n = monthCounts.get(m) ?? 0;
      if (bestMonth > 0 && n > bestMonth && n >= MIN_BEST_MONTH) {
        push({ id: `best_month:${m}`, day: last, kind: "best_month", title: "Best month", line: `${plural(n, "session")} in ${monthName(m)}, the most in a month so far.`, value: n });
      }
      bestMonth = Math.max(bestMonth, n);
    }
  }

  // Cap: five a month by tier, the first session always kept.
  const byMonth = new Map<string, TimelineEvent[]>();
  for (const e of events) {
    const m = e.day.slice(0, 7);
    byMonth.set(m, [...(byMonth.get(m) ?? []), e]);
  }
  const shown: TimelineEvent[] = [];
  const hiddenByMonth: Array<{ month: string; label: string; events: TimelineEvent[] }> = [];
  byMonth.forEach((list, month) => {
    const pinned = list.filter((e) => e.kind === "first_session");
    const rest = list.filter((e) => e.kind !== "first_session").sort(byRank);
    const room = Math.max(0, perMonth - pinned.length);
    shown.push(...pinned, ...rest.slice(0, room));
    const hidden = rest.slice(room);
    if (hidden.length > 0) hiddenByMonth.push({ month, label: `More from ${monthName(month)}`, events: hidden.sort(byDisplay) });
  });

  return {
    events: shown.sort(byDisplay),
    more: hiddenByMonth.sort((a, b) => (a.month < b.month ? 1 : -1)),
  };
}

/** Which events survive the cap: tier, then the more recent, then the larger number. */
function byRank(a: TimelineEvent, b: TimelineEvent): number {
  return a.tier - b.tier || (a.day < b.day ? 1 : a.day > b.day ? -1 : 0) || (b.value ?? 0) - (a.value ?? 0) || (a.id < b.id ? -1 : 1);
}

/** The order on the page: newest day first, the more important first within a day. */
function byDisplay(a: TimelineEvent, b: TimelineEvent): number {
  return (a.day < b.day ? 1 : a.day > b.day ? -1 : 0) || a.tier - b.tier || (b.value ?? 0) - (a.value ?? 0) || (a.id < b.id ? -1 : 1);
}

function nextMonth(m: string): string {
  const y = Number(m.slice(0, 4));
  const mo = Number(m.slice(5, 7));
  return mo === 12 ? `${y + 1}-01` : `${y}-${String(mo + 1).padStart(2, "0")}`;
}

function lastDayOfMonth(m: string): string {
  return addDays(`${nextMonth(m)}-01`, -1);
}
