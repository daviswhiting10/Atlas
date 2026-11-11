/**
 * Stalled lifts across a coach's whole roster, for the Inbox.
 *
 * Same rule as each client's Progress screen (lib/progress/plateau.ts): a
 * lift has stalled when its last three counted sessions show no gain in
 * weight, estimated 1RM or reps, and the latest is within three weeks.
 * The verdict only needs those recent sessions, so one query over the last
 * ten weeks covers everyone.
 */

import { prisma } from "@/lib/db/client";
import { ROSTER } from "@/lib/db/roster";
import { displayName } from "@/lib/plan/catalog";
import { LIGHTER_SELECT, isLighterWeek } from "@/lib/plan/lighter";
import { buildSeries, sessionPoint, type LoggedSet } from "@/lib/plan/overload";
import { detectPlateau } from "@/lib/progress/plateau";
import { localDay } from "@/lib/athlete/sessions";

const LOOKBACK_DAYS = 70;

export type ClientStalls = { clientId: string; name: string; lifts: string[] };

export async function rosterStalls(workspaceId: string, timeZone: string): Promise<ClientStalls[]> {
  const since = new Date(Date.now() - LOOKBACK_DAYS * 86_400_000);
  const sets = await prisma.setLog.findMany({
    where: {
      exerciseId: { not: null },
      workoutLog: {
        date: { gte: since },
        client: { workspaceId, deletedAt: null, status: { in: ["ACTIVE", "AT_RISK"] }, ...ROSTER },
      },
    },
    select: {
      exerciseId: true,
      weight: true,
      reps: true,
      completed: true,
      workoutLogId: true,
      exercise: { select: { name: true, slug: true } },
      workoutLog: {
        select: {
          date: true,
          client: { select: { id: true, fullName: true } },
          assignedWorkout: { select: { scheduledDate: true, programAssignment: { select: LIGHTER_SELECT } } },
        },
      },
    },
  });

  // client → exercise → session → sets
  type Session = { date: Date; deload: boolean; sets: LoggedSet[] };
  const clients = new Map<string, { name: string; lifts: Map<string, { name: string; sessions: Map<string, Session> }> }>();
  for (const s of sets) {
    if (!s.exerciseId || !s.exercise) continue;
    const log = s.workoutLog;
    let client = clients.get(log.client.id);
    if (!client) {
      client = { name: log.client.fullName, lifts: new Map() };
      clients.set(log.client.id, client);
    }
    let lift = client.lifts.get(s.exerciseId);
    if (!lift) {
      lift = { name: displayName(s.exercise.slug, s.exercise.name), sessions: new Map() };
      client.lifts.set(s.exerciseId, lift);
    }
    let session = lift.sessions.get(s.workoutLogId);
    if (!session) {
      const aw = log.assignedWorkout;
      session = { date: log.date, deload: aw != null && isLighterWeek(aw.scheduledDate, aw.programAssignment), sets: [] };
      lift.sessions.set(s.workoutLogId, session);
    }
    session.sets.push({ weight: s.weight, reps: s.reps, completed: s.completed });
  }

  const today = localDay(new Date(), timeZone);
  const out: ClientStalls[] = [];
  clients.forEach((client, clientId) => {
    const lifts: string[] = [];
    client.lifts.forEach((lift) => {
      const series = buildSeries(
        Array.from(lift.sessions.values())
          .map((x) => sessionPoint(localDay(x.date, timeZone), x.sets, x.deload))
          .filter((p): p is NonNullable<typeof p> => p != null)
      );
      const verdict = detectPlateau(
        series.map((p) => ({ date: p.date, topWeight: p.weight, bestE1RM: p.e1rm, repsAtTop: p.reps, deload: p.deload })),
        today
      );
      if (verdict.plateaued === true) lifts.push(lift.name);
    });
    if (lifts.length > 0) out.push({ clientId, name: client.name, lifts: lifts.sort() });
  });
  return out.sort((a, b) => b.lifts.length - a.lifts.length || a.name.localeCompare(b.name));
}
