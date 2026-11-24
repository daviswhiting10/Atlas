/**
 * A session's notes: the coach's and the athlete's, one each, stored as SessionNote rows on the session
 * (workoutLogId + authorRole). For one release WorkoutLog.clientNotes is still written alongside the coach's note and
 * read as the fallback when a session has no coach note row (a note saved by older code); then it is dropped.
 */

import { prisma } from "@/lib/db/client";
import type { NoteAuthor } from "@/app/generated/prisma/client";

import type { SessionNotes } from "./note-order";
export { labelledNotes, type SessionNotes, type Viewer } from "./note-order";

export const MAX_SESSION_NOTE = 2000;

/** The notes for these sessions, by session id. */
export async function loadSessionNotes(
  sessions: Array<{ id: string; clientNotes?: string | null }>
): Promise<Map<string, SessionNotes>> {
  const out = new Map<string, SessionNotes>();
  if (sessions.length === 0) return out;
  const rows = await prisma.sessionNote.findMany({
    where: { workoutLogId: { in: sessions.map((s) => s.id) } },
    select: { workoutLogId: true, authorRole: true, rawInput: true },
  });
  for (const s of sessions) out.set(s.id, { coach: null, athlete: null });
  for (const r of rows) {
    const n = out.get(r.workoutLogId!)!;
    if (r.authorRole === "COACH") n.coach = r.rawInput;
    else n.athlete = r.rawInput;
  }
  for (const s of sessions) {
    const n = out.get(s.id)!;
    if (!n.coach && s.clientNotes?.trim()) n.coach = s.clientNotes.trim();
  }
  return out;
}

type Db = Pick<typeof prisma, "sessionNote" | "workoutLog">;

/**
 * Write (or, with empty text, remove) one author's note on a session. The coach's note also goes to clientNotes for
 * this one release, so rolling back to code that only reads clientNotes loses nothing.
 */
export async function saveSessionNote(
  input: { workoutLogId: string; clientId: string; date: Date; role: NoteAuthor; text: string },
  db: Db = prisma
): Promise<void> {
  const text = input.text.replace(/\r\n/g, "\n").trim().slice(0, MAX_SESSION_NOTE);
  if (!text) {
    await db.sessionNote.deleteMany({ where: { workoutLogId: input.workoutLogId, authorRole: input.role } });
  } else {
    await db.sessionNote.upsert({
      where: { workoutLogId_authorRole: { workoutLogId: input.workoutLogId, authorRole: input.role } },
      create: { workoutLogId: input.workoutLogId, authorRole: input.role, clientId: input.clientId, date: input.date, rawInput: text, structuredNote: {} },
      update: { rawInput: text },
    });
  }
  if (input.role === "COACH") await db.workoutLog.update({ where: { id: input.workoutLogId }, data: { clientNotes: text || null } });
}
