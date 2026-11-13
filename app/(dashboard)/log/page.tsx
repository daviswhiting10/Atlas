import type { Metadata } from "next";
import { DONE } from "@/lib/sessions/status";
import { redirect } from "next/navigation";
import { format } from "date-fns";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db/client";
import { ROSTER } from "@/lib/db/roster";
import { weekOf } from "@/lib/athlete/sessions";
import { LogClientList, type LogRow } from "./LogClientList";

export const metadata: Metadata = { title: "Log a session" };

/**
 * The coach's home: who to log for, one tap each. Clients logged most
 * recently come first, since that's who's in front of you.
 */
export default async function LogSessionPage() {
  const session = await auth();
  const workspaceId = session?.user?.workspaceId;
  if (!workspaceId) redirect("/login");

  const clients = await prisma.clientProfile.findMany({
    where: { workspaceId, deletedAt: null, status: { not: "CHURNED" }, ...ROSTER },
    select: {
      id: true,
      fullName: true,
      workoutLogs: { orderBy: { date: "desc" }, take: 1, select: { date: true } },
      programAssignments: {
        where: { status: "ACTIVE" },
        orderBy: { createdAt: "desc" },
        take: 1,
        select: {
          startDate: true,
          assignedWorkouts: { where: { status: "PLANNED", NOT: DONE }, orderBy: { scheduledDate: "asc" }, take: 1, select: { name: true, scheduledDate: true } },
        },
      },
    },
  });

  const rows: LogRow[] = clients
    .map((c) => {
      const plan = c.programAssignments[0];
      const next = plan?.assignedWorkouts[0];
      const last = c.workoutLogs[0]?.date ?? null;
      return {
        id: c.id,
        name: c.fullName,
        hasPlan: plan != null,
        next: next && plan ? `${next.name} · week ${weekOf(next.scheduledDate.getTime(), plan.startDate.getTime())}` : null,
        lastLogged: last ? format(last, "MMM d") : null,
        lastTime: last?.getTime() ?? 0,
      };
    })
    .sort((a, b) => b.lastTime - a.lastTime || a.name.localeCompare(b.name));

  return (
    <div className="mx-auto max-w-2xl">
      <div className="rise mb-6">
        <p className="eyebrow">{format(new Date(), "EEEE, MMMM d")}</p>
        <h1 className="mt-1.5 text-4xl leading-none text-ink">Log a session</h1>
      </div>
      <LogClientList rows={rows} />
    </div>
  );
}
