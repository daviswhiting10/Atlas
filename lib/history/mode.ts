/**
 * How a session was done, for the heatmap's corner icon. Pure: no I/O.
 *
 * - **S** strength: a logged set on an exercise that is not cardio.
 * - **R** run (and other cardio, one shoe): a cardio-mode set or a quick log that is a run or other cardio.
 * - **W** walk.
 * - **M** mixed: strength and cardio in the same session (or the same day: see `dayMode`).
 * - null: nothing says (a session with only a name and a time, imported): no icon.
 */
import { isLoggedSet } from "./days";
import type { HistorySession } from "./types";

export type Mode = "S" | "R" | "W";
export type DayMode = Mode | "M";

const cardioMode = (a: "RUN" | "WALK" | "OTHER"): Mode => (a === "WALK" ? "W" : "R");

/** The kinds of work in one session. */
export function modesOf(session: HistorySession): Set<Mode> {
  const out = new Set<Mode>();
  for (const s of session.sets) {
    if (!isLoggedSet(s)) continue;
    out.add(s.cardio ? cardioMode(s.cardio) : "S");
  }
  // A cardio-mode set may carry seconds in `reps` but no weight: it is logged when completed with seconds, which isLoggedSet covers.
  if (session.activity) out.add(cardioMode(session.activity));
  return out;
}

/** One session's mode: its only kind, or mixed when strength and cardio meet. Two cardio kinds: the walk only if nothing else. */
export function sessionMode(session: HistorySession): DayMode | null {
  return combine(modesOf(session));
}

export function combine(modes: Iterable<Mode>): DayMode | null {
  const m = new Set(modes);
  if (m.size === 0) return null;
  if (m.has("S") && (m.has("R") || m.has("W"))) return "M";
  if (m.has("S")) return "S";
  return m.has("R") ? "R" : "W";
}

/**
 * A day's mode from its sessions' modes and minutes: mixed when strength and cardio both happened; else the kind with the
 * most minutes (a run beside a walk shows whichever took longer; a tie shows the run).
 */
export function dayMode(sessions: Array<{ mode: DayMode | null; minutes: number | null }>): DayMode | null {
  const kinds = new Set<Mode>();
  const minutes = { R: 0, W: 0 };
  for (const s of sessions) {
    if (s.mode == null) continue;
    if (s.mode === "M") {
      kinds.add("S");
      kinds.add("R");
    } else kinds.add(s.mode);
    if (s.mode === "R" || s.mode === "W") minutes[s.mode] += s.minutes ?? 0;
  }
  if (kinds.size === 0) return null;
  if (kinds.has("S") && (kinds.has("R") || kinds.has("W"))) return "M";
  if (kinds.has("S")) return "S";
  if (kinds.has("R") && kinds.has("W")) return minutes.W > minutes.R ? "W" : "R";
  return kinds.has("R") ? "R" : "W";
}
