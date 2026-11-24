/**
 * What the finish screen says about the session. Three bare numbers ("20 SETS · 8,810 LB · 1 MIN") mean little on their
 * own, so a session of any real length gets one sentence: "You did 20 sets and lifted 8,810 lb in 42 min."
 *
 * A session under two minutes was tapped through (a demo, or sets ticked afterwards): its length says nothing about the work,
 * so the minutes are left out altogether and the two numbers that are real are shown labelled: "Sets" and "Weight lifted".
 * No weight (bodyweight work) means no weight lifted: never a zero. Pure: no I/O.
 */

/** Under this many minutes the duration is not shown. */
export const SHORT_SESSION_MIN = 2;

export type Part = { text: string; strong?: boolean };
export type SummaryView =
  | { kind: "sentence"; parts: Part[]; text: string }
  | { kind: "tiles"; tiles: Array<{ value: string; unit?: string; label: string }> };

const n = (v: number) => v.toLocaleString("en-US");
const long = (minutes: number) => (minutes >= 60 ? `${Math.floor(minutes / 60)} h${minutes % 60 ? ` ${minutes % 60} min` : ""}` : `${minutes} min`);

export function summaryView({ sets, volume, minutes, who = "You" }: { sets: number; volume: number; minutes: number; /** Who did it: "You" on the athlete's screen, the athlete's first name on the coach's. */ who?: string }): SummaryView {
  const lifted = volume > 0;
  if (minutes < SHORT_SESSION_MIN) {
    return { kind: "tiles", tiles: [{ value: n(sets), label: sets === 1 ? "Set" : "Sets" }, ...(lifted ? [{ value: n(Math.round(volume)), unit: "lb", label: "Weight lifted" }] : [])] };
  }
  const parts: Part[] = [
    { text: `${who} did ` },
    { text: `${n(sets)} ${sets === 1 ? "set" : "sets"}`, strong: true },
    ...(lifted ? [{ text: " and lifted " }, { text: `${n(Math.round(volume))} lb`, strong: true }] : []),
    { text: " in " },
    { text: long(minutes), strong: true },
    { text: "." },
  ];
  return { kind: "sentence", parts, text: parts.map((p) => p.text).join("") };
}
