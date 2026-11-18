/**
 * Which session milestones someone has earned, and on which day (docs/archive-and-chapters.md,
 * gaps 5, 6 and 7). Pure: `milestones.ts` reads the rows and writes the awards.
 *
 * - **Finished sessions only** (gap 6). The caller passes the dates of sessions with `completedAt` set.
 * - **The day it happened** (gap 5): a milestone sits on the date of the session that reached it, not
 *   on the day it was noticed, so a session logged late or typed in later lands in the right place.
 * - **Derived, not counted:** every milestone up to the current total is returned each time (the
 *   caller skips ones already stored), so one missed call never loses a milestone for good.
 * - **One record rule** (gap 7): a record is a heaviest weight ever, as in `lib/history/records.ts`.
 *
 * Words follow the copy rules in lib/history/copy.ts: plain, no exclamation marks.
 */

import { ordinal } from "@/lib/history/copy";

export type SessionAward = {
  type: string;
  title: string;
  description: string;
  metricValue: number;
  metricUnit: "sessions";
  achievedAt: Date;
};

const DAY_MS = 86_400_000;
/** The same window the "7 sessions in 2 weeks" milestone has always used. */
const BURST_SESSIONS = 7;
const BURST_DAYS = 14;

/** Session-count milestones, oldest first. `dates` are the dates of finished sessions, in any order. */
export function sessionMilestones(dates: Date[]): SessionAward[] {
  const times = dates.map((d) => d.getTime()).sort((a, b) => a - b);
  const at = (n: number) => new Date(times[n - 1]);
  const out: SessionAward[] = [];

  if (times.length >= 1) {
    out.push({ type: "first_session", title: "First session", description: "Your history starts here.", metricValue: 1, metricUnit: "sessions", achievedAt: at(1) });
  }
  for (const n of [25, 50, 100]) {
    if (times.length < n) continue;
    out.push({ type: `session_${n}`, title: `${n} sessions`, description: `Your ${ordinal(n)} session.`, metricValue: n, metricUnit: "sessions", achievedAt: at(n) });
  }
  // 7 sessions inside 14 days: the first time it happened, on the day its 7th session was done.
  for (let i = BURST_SESSIONS - 1; i < times.length; i++) {
    if (times[i] - times[i - (BURST_SESSIONS - 1)] <= BURST_DAYS * DAY_MS) {
      out.push({
        type: "session_7_streak",
        title: "7 sessions in 2 weeks",
        description: "Seven sessions inside two weeks.",
        metricValue: BURST_SESSIONS,
        metricUnit: "sessions",
        achievedAt: new Date(times[i]),
      });
      break;
    }
  }
  return out;
}

/**
 * Is this set a record: heavier than every earlier set of the exercise? The first loaded set is a
 * baseline, not a record. `earlierWeights` are the weights of the completed sets done before it.
 */
export function isRecordWeight(earlierWeights: Array<number | null>, weight: number | null): boolean {
  if (weight == null || weight <= 0) return false;
  const loaded = earlierWeights.filter((w): w is number => w != null && w > 0);
  return loaded.length > 0 && weight > Math.max(...loaded);
}
