/**
 * What kind of timed exercise this is, so the screen asks for the right thing:
 *   hold    a plank, a wall sit: "hold as long as you can"
 *   steady  a bike, a row, a walk at one pace for a set time: no "as long as you can"
 *   work    intervals, sprints, ropes: hard for the time shown
 * and whether it has a load at all (a bike or a plank doesn't, a farmer's carry does).
 */
export type TimedKind = "hold" | "steady" | "work";

const WORK = /\b(intervals?|sprints?|hiit|tabata|battle ropes?|on\/off|emom|amrap)\b|\d+\s*s\s*on\b/i;
const STEADY = /\b(bike|biking|cycle|cycling|run|running|jog|jogging|walk|walking|treadmill|elliptical|rower|rowing|row erg|ski ?erg|swim|swimming|stair|stairs|stepper|cardio|zone\s*[1-5]|steady|easy pace|conversational|nasal)\b/i;

/** Name first, then the coach's note. "Row or Bike Intervals" is work; "Bike — Zone 2" is steady; "Plank" is a hold. */
export function timedKind(name: string, note?: string | null): TimedKind {
  const nm = name ?? "";
  if (WORK.test(nm)) return "work";
  if (STEADY.test(nm)) return WORK.test(note ?? "") ? "work" : "steady";
  if (WORK.test(note ?? "")) return "work";
  if (STEADY.test(note ?? "") && !/\b(hold|plank|sit|iso|bridge|balance|carry)\b/i.test(nm)) return "steady";
  return "hold";
}

const LOADED = /dumbbell|barbell|kettlebell|cable|plate|sled|weighted|wtd|medicine|trap bar|landmine|goblet|farmer|carry|suitcase/i;

/**
 * A timed exercise shows a weight field only when there is a load to record: one is prescribed, one has been
 * logged before, or the exercise itself is a loaded one. A bike, a rower and a plank don't.
 */
export function timedHasLoad(opts: { name: string; equipment?: string | null; tool?: string | null; prescribedWeight: boolean; everLoaded: boolean }): boolean {
  if (opts.prescribedWeight || opts.everLoaded) return true;
  return LOADED.test(`${opts.name} ${opts.equipment ?? ""} ${opts.tool ?? ""}`);
}

/** The line shown the first time, when there is nothing to go on. */
export function timedFirstReason(kind: TimedKind): string {
  if (kind === "steady") return "Keep a steady pace for the time shown. Today sets your baseline.";
  if (kind === "work") return "Work hard for the time shown. Today sets your baseline.";
  return "Hold as long as you can with good form. Today sets your baseline.";
}
