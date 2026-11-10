/**
 * Plateau detection — pure, no I/O, no DB.
 *
 * An exercise is plateaued when nothing has gone up across the last three
 * counted sessions — not the top-set weight, not the session's best estimated
 * 1-rep max, and not the reps done at the top weight — and the most recent
 * of them is within the last 21 days.
 *
 * Reps are checked as well as estimated max because the e1RM formula stops
 * counting reps past 12: without it, someone adding reps to a 12–15 rep
 * accessory would be flagged as stalled while clearly progressing.
 *
 * Lighter-week (deload) sessions are not counted: a planned back-off is not a
 * stall.
 */

export type PlateauSession = {
  /** yyyy-mm-dd */
  date: string;
  /** Heaviest completed set. null = bodyweight. */
  topWeight: number | null;
  /** Best estimated 1-rep max of the session. null = bodyweight. */
  bestE1RM: number | null;
  /** Most reps done in one set at the top weight. */
  repsAtTop?: number | null;
  /** True for a lighter-week session; excluded from the streak. */
  deload?: boolean;
};

export type PlateauResult = {
  /** null = not enough data to say either way. */
  plateaued: boolean | null;
  sessionsConsidered: number;
  daysCovered: number;
  lastImprovementDate: string | null;
  currentBestE1RM: number | null;
};

export const PLATEAU_SESSIONS = 3;
export const PLATEAU_WINDOW_DAYS = 21;

const DAY_MS = 86_400_000;
const daysBetween = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / DAY_MS);

/**
 * @param sessions every logged session for one exercise for one client
 * @param today    yyyy-mm-dd; passed in so the function stays deterministic
 */
export function detectPlateau(sessions: PlateauSession[], today: string): PlateauResult {
  const counted = sessions
    .filter((s) => !s.deload && s.topWeight != null && s.bestE1RM != null)
    .sort((a, b) => a.date.localeCompare(b.date));

  // The last date on which either number beat everything before it.
  let lastImprovementDate: string | null = null;
  let bestWeight = -Infinity;
  let best1rm = -Infinity;
  let bestRepsAtBest = 0;
  for (const s of counted) {
    const weight = s.topWeight as number;
    const est = s.bestE1RM as number;
    const reps = s.repsAtTop ?? 0;
    const moreReps = weight === bestWeight && reps > bestRepsAtBest;
    if (weight > bestWeight || est > best1rm || moreReps) {
      if (bestWeight !== -Infinity) lastImprovementDate = s.date;
      if (weight > bestWeight) bestRepsAtBest = reps;
      else if (moreReps) bestRepsAtBest = reps;
      bestWeight = Math.max(bestWeight, weight);
      best1rm = Math.max(best1rm, est);
    }
  }

  const recent = counted.slice(-PLATEAU_SESSIONS);
  const currentBestE1RM = recent.length > 0 ? (recent[recent.length - 1].bestE1RM as number) : null;
  const daysCovered = recent.length > 1 ? daysBetween(recent[0].date, recent[recent.length - 1].date) : 0;
  const base = { sessionsConsidered: recent.length, daysCovered, lastImprovementDate, currentBestE1RM };

  // Fewer than three counted sessions, or nothing recent: insufficient data, not a plateau.
  if (recent.length < PLATEAU_SESSIONS) return { plateaued: null, ...base };
  if (daysBetween(recent[recent.length - 1].date, today) > PLATEAU_WINDOW_DAYS) return { plateaued: null, ...base };

  const [first, ...rest] = recent;
  const improved = rest.some(
    (s) =>
      (s.topWeight as number) > (first.topWeight as number) ||
      (s.bestE1RM as number) > (first.bestE1RM as number) ||
      (s.topWeight === first.topWeight && (s.repsAtTop ?? 0) > (first.repsAtTop ?? 0))
  );
  return { plateaued: !improved, ...base };
}

/**
 * How many of the most recent verdicts were "hold" in a row. Corroboration
 * only: a hold streak alone is not a plateau (holding for a high RPE is
 * deliberate), but a plateau with one is higher confidence.
 */
export function holdStreak(verdicts: string[]): number {
  let n = 0;
  for (let i = verdicts.length - 1; i >= 0 && verdicts[i] === "hold"; i--) n += 1;
  return n;
}
