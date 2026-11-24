import { prisma } from "@/lib/db/client";
import { ROSTER } from "@/lib/db/roster";
import { weekCount } from "@/lib/coach/week";
import { localDay } from "@/lib/athlete/sessions";
import { glimpse, lastLabel, sortRows, standing, type DashRow } from "./dashboard";

/**
 * Every active client's card, in one read: their latest session, the last four weeks of sessions (for the glimpse), and the
 * live plan's workouts around now (for this week's count). Scoped to the coach's workspace.
 */
export async function loadDashboard(workspaceId: string, timeZone: string, now = new Date()): Promise<{ rows: DashRow[]; today: string }> {
  const today = localDay(now, timeZone);
  const clients = await prisma.clientProfile.findMany({
    where: { workspaceId, deletedAt: null, status: { not: "CHURNED" }, ...ROSTER },
    select: {
      id: true,
      fullName: true,
      workoutLogs: {
        where: { completedAt: { not: null }, date: { gte: new Date(now.getTime() - 29 * 86_400_000) } },
        orderBy: { date: "desc" },
        select: { date: true, title: true, assignedWorkout: { select: { name: true } }, _count: { select: { sets: { where: { completed: true } } } } },
      },
      programAssignments: {
        where: { status: "ACTIVE" },
        orderBy: { createdAt: "desc" },
        take: 1,
        select: {
          startDate: true,
          assignedWorkouts: {
            where: { scheduledDate: { gte: new Date(now.getTime() - 8 * 86_400_000), lte: new Date(now.getTime() + 8 * 86_400_000) } },
            select: { scheduledDate: true, status: true, workoutLog: { select: { completedAt: true } } },
          },
        },
      },
    },
  });
  // A client's very latest session may be older than the four weeks read above: one more read for those who have none in it.
  const quiet = clients.filter((c) => c.workoutLogs.length === 0).map((c) => c.id);
  const older = quiet.length
    ? await prisma.workoutLog.findMany({
        where: { clientId: { in: quiet }, completedAt: { not: null } },
        orderBy: { date: "desc" },
        distinct: ["clientId"],
        select: { clientId: true, date: true, title: true, assignedWorkout: { select: { name: true } } },
      })
    : [];
  const olderBy = new Map(older.map((o) => [o.clientId, o]));

  const rows = clients.map((c) => {
    const plan = c.programAssignments[0];
    const thisWeek = plan ? weekCount(plan.startDate, plan.assignedWorkouts.map((w) => ({ scheduledDate: w.scheduledDate, status: w.status, done: !!w.workoutLog?.completedAt })), now) : null;
    const latest = c.workoutLogs[0] ?? olderBy.get(c.id) ?? null;
    const lastDay = latest ? localDay(latest.date, timeZone) : null;
    const byDay: Record<string, number> = {};
    for (const l of c.workoutLogs) {
      const d = localDay(l.date, timeZone);
      byDay[d] = (byDay[d] ?? 0) + l._count.sets;
    }
    const st = standing({ today, lastDay, thisWeek, hasPlan: plan != null });
    return {
      id: c.id,
      name: c.fullName,
      lastDay,
      standing: st,
      lastLabel: lastLabel(lastDay, today),
      lastWorkout: latest ? (latest.assignedWorkout?.name ?? latest.title ?? null) : null,
      thisWeek: thisWeek ? { done: thisWeek.done, planned: thisWeek.planned } : null,
      glimpse: glimpse(byDay, today),
      trainedToday: lastDay === today,
    };
  });
  return { rows: sortRows(rows).map((r) => ({ id: r.id, name: r.name, standing: r.standing, lastLabel: r.lastLabel, lastWorkout: r.lastWorkout, thisWeek: r.thisWeek, glimpse: r.glimpse, trainedToday: r.trainedToday })), today };
}
