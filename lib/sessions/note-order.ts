/** The order a session's two notes are shown in. Pure: no I/O (lib/sessions/notes.ts is the part that reads and writes). */

export type SessionNotes = { coach: string | null; athlete: string | null };

export type Viewer = "coach" | "athlete";

/**
 * The notes in the order they are shown to whoever is looking: the other side's note first (that is what the viewer wants to
 * read), their own under it. A coach sees the athlete's note, then their own; the athlete sees the coach's, then their own.
 */
export function labelledNotes(notes: SessionNotes, viewer: Viewer, names: { coach?: string | null; athlete?: string | null } = {}) {
  const coach = notes.coach ? [{ role: "COACH" as const, label: names.coach ? `Coach ${names.coach}` : "Coach", text: notes.coach }] : [];
  const athlete = notes.athlete ? [{ role: "ATHLETE" as const, label: names.athlete ?? "Athlete", text: notes.athlete }] : [];
  return viewer === "coach" ? [...athlete, ...coach] : [...coach, ...athlete];
}
