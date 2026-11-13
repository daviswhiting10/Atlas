import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db/client";
import { loadQuickSession } from "@/lib/actions/quick-log";
import { QuickLog } from "@/components/sessions/QuickLog";

export const metadata: Metadata = { title: "Log a workout" };

/** A coach logs a workout a client did outside the plan (or edits one). */
export default async function LogWorkoutPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ session?: string }>;
}) {
  const [session, { id: clientId }, { session: sessionId }] = await Promise.all([auth(), params, searchParams]);
  const workspaceId = session?.user?.workspaceId;
  if (!workspaceId) redirect("/login");

  const client = await prisma.clientProfile.findFirst({ where: { id: clientId, workspaceId, deletedAt: null }, select: { id: true, fullName: true } });
  if (!client) notFound();
  const initial = sessionId ? await loadQuickSession({ clientId: client.id, sessionId }) : null;
  if (sessionId && !initial) notFound();

  const first = client.fullName.split(" ")[0];
  return (
    <QuickLog
      clientId={client.id}
      heading={initial ? "Edit workout" : `Log a workout for ${first}`}
      backHref={initial ? `/clients/${client.id}/sessions/${initial.id}` : `/clients/${client.id}`}
      backLabel={initial ? "Session" : first}
      doneHref={`/clients/${client.id}?tab=sessions`}
      initial={initial}
    />
  );
}
