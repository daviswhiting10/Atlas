import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { format } from "date-fns";
import { ArrowRight, Check, MessageSquare, Plus, TrendingDown, UserPlus } from "lucide-react";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db/client";
import { ROSTER } from "@/lib/db/roster";
import { rosterStalls } from "@/lib/coach/stalls";
import { TZ_COOKIE, safeTimeZone } from "@/lib/athlete/data";
import { cookies } from "next/headers";
import { getClients, runRetentionHeuristic } from "@/lib/db/clients";
import { Greeting } from "@/components/athlete/Greeting";
import { StatRow } from "@/components/athlete/StatRow";
import { StatusBadge } from "@/components/status-badge";
import { LogSessionCard } from "./_components/LogSessionCard";
import { ProspectFollowUpButton } from "./_components/ProspectFollowUpButton";

export const metadata: Metadata = { title: "Inbox" };

type Status = "PROSPECT" | "ACTIVE" | "AT_RISK" | "CHURNED";

function Skeleton() {
  return (
    <div className="fade-in space-y-8" aria-busy="true" aria-label="Loading">
      <div className="skeleton h-24 w-full" />
      <div className="grid gap-10 lg:grid-cols-2">
        <div className="skeleton h-72" />
        <div className="skeleton h-72" />
      </div>
    </div>
  );
}

async function InboxContent({ workspaceId }: { workspaceId: string }) {
  // Write-then-read: the heuristic must finish before getClients sees updated statuses.
  await runRetentionHeuristic(workspaceId);
  const weekStart = new Date();
  weekStart.setHours(0, 0, 0, 0);
  weekStart.setDate(weekStart.getDate() - ((weekStart.getDay() + 6) % 7));

  const [clients, logged, livePlans, drafts, stalls] = await Promise.all([
    getClients(workspaceId),
    prisma.workoutLog.findMany({
      where: { client: { workspaceId, deletedAt: null, ...ROSTER }, date: { gte: weekStart } },
      orderBy: { date: "desc" },
      take: 12,
      select: {
        id: true,
        date: true,
        client: { select: { id: true, fullName: true } },
        assignedWorkout: { select: { name: true } },
        _count: { select: { sets: { where: { completed: true } } } },
      },
    }),
    prisma.programAssignment.count({ where: { workspaceId, status: "ACTIVE", client: { deletedAt: null, ...ROSTER } } }),
    prisma.programAssignment.count({ where: { workspaceId, status: "PAUSED", client: { deletedAt: null, ...ROSTER } } }),
    rosterStalls(workspaceId, safeTimeZone(cookies().get(TZ_COOKIE)?.value)),
  ]);

  const active = clients.filter((c) => c.status === "ACTIVE");
  const atRisk = clients.filter((c) => c.status === "AT_RISK");
  const prospects = clients.filter((c) => c.status === "PROSPECT");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const followUps = prospects.filter((c) => (c as any).reachOutDate != null);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const attention = atRisk.length + followUps.length + stalls.length;

  return (
    <div className="space-y-10">
      <StatRow
        className="rise rise-1"
        stats={[
          { label: "Clients", value: String(clients.length), hint: `${active.length} active` },
          { label: "Live plans", value: String(livePlans), hint: drafts > 0 ? `${drafts} draft${drafts === 1 ? "" : "s"} to assign` : "all assigned" },
          { label: "Logged this week", value: String(logged.length), hint: logged.length > 0 ? `last on ${format(logged[0].date, "EEE")}` : "no sessions yet" },
          { label: "Need attention", value: String(attention), hint: attention > 0 ? [stalls.length > 0 && `${stalls.length} stalled`, atRisk.length > 0 && `${atRisk.length} at risk`, followUps.length > 0 && `${followUps.length} follow-up${followUps.length === 1 ? "" : "s"}`].filter(Boolean).join(" · ") : "nothing waiting" },
        ]}
      />

      {attention > 0 && (
        <section className="rise rise-2">
          <h2 className="text-xl text-ink">Needs attention</h2>
          <ul className="rule mt-3 divide-y divide-line">
            {stalls.map((c) => (
              <li key={`stall-${c.clientId}`} className="flex items-center gap-3 py-3">
                <TrendingDown className="h-4 w-4 shrink-0 text-warn" />
                <Link href={`/clients/${c.clientId}`} className="min-w-0 flex-1">
                  <span className="block truncate text-[15px] font-semibold text-ink">{c.name}</span>
                  <span className="block truncate text-[13px] text-ink-mute">
                    Stalled: {c.lifts.join(", ")} · no gain in the last 3 sessions
                  </span>
                </Link>
                <Link href={`/clients/${c.clientId}`} className="press flex h-9 shrink-0 items-center gap-1.5 rounded-lg border border-line bg-white px-3 text-sm font-medium text-ink hover:border-ink/25">
                  See charts
                </Link>
              </li>
            ))}
            {atRisk.map((c) => (
              <li key={c.id} className="flex items-center gap-3 py-3">
                <span className="h-2 w-2 shrink-0 rounded-full bg-warn" />
                <Link href={`/clients/${c.id}`} className="min-w-0 flex-1">
                  <span className="block truncate text-[15px] font-semibold text-ink">{c.fullName}</span>
                  <span className="block truncate text-[13px] text-ink-mute">{c.retentionFlag ?? "At risk of dropping off"}</span>
                </Link>
                <Link href={`/outreach?clientId=${c.id}`} className="press flex h-9 shrink-0 items-center gap-1.5 rounded-lg border border-line bg-white px-3 text-sm font-medium text-ink hover:border-ink/25">
                  <MessageSquare className="h-3.5 w-3.5" /> Reach out
                </Link>
              </li>
            ))}
            {followUps.map((c) => {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const due = new Date(((c as any).reachOutDate as Date).toISOString().slice(0, 10) + "T12:00:00");
              const overdue = due < today;
              return (
                <li key={c.id} className="flex items-center gap-3 py-3">
                  <span className="h-2 w-2 shrink-0 rounded-full bg-ink/30" />
                  <Link href={`/clients/${c.id}`} className="min-w-0 flex-1">
                    <span className="block truncate text-[15px] font-semibold text-ink">{c.fullName}</span>
                    <span className={overdue ? "block text-[13px] text-warn" : "block text-[13px] text-ink-mute"}>Prospect · follow up {overdue ? "overdue" : `on ${format(due, "MMM d")}`}</span>
                  </Link>
                  <ProspectFollowUpButton clientId={c.id} />
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <div className="grid gap-x-12 gap-y-10 lg:grid-cols-2">
        <section className="rise rise-3 min-w-0">
          <div className="flex items-baseline justify-between">
            <h2 className="text-xl text-ink">Clients</h2>
            <Link href="/clients" className="press text-sm font-semibold text-ink hover:text-ink-soft">
              Roster <ArrowRight className="inline h-3.5 w-3.5" />
            </Link>
          </div>
          {clients.length === 0 ? (
            <p className="rule mt-3 pt-4 text-[15px] text-ink-soft">No clients yet. Add one from the roster or start with an intake.</p>
          ) : (
            <ul className="rule mt-3 divide-y divide-line">
              {clients.slice(0, 8).map((c) => (
                <li key={c.id}>
                  <Link href={`/clients/${c.id}`} className="press group flex items-center gap-3 py-3">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-ink text-xs font-semibold text-white">{c.fullName.charAt(0)}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[15px] font-semibold text-ink">{c.fullName}</span>
                      {c.primaryGoal && <span className="block truncate text-[13px] text-ink-mute">{c.primaryGoal.replace(/_/g, " ")}</span>}
                    </span>
                    <StatusBadge status={c.status as Status} />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="rise rise-4 min-w-0">
          <h2 className="text-xl text-ink">Logged this week</h2>
          {logged.length === 0 ? (
            <p className="rule mt-3 pt-4 text-[15px] text-ink-soft">Nothing logged since Monday. Sessions your clients log, and ones you log for them, show up here.</p>
          ) : (
            <ul className="rule mt-3 divide-y divide-line">
              {logged.map((l) => (
                <li key={l.id}>
                  <Link href={`/clients/${l.client.id}/sessions/${l.id}`} className="press group flex items-center gap-3 py-3">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-signal text-white">
                      <Check className="h-4 w-4" strokeWidth={3} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[15px] font-semibold text-ink">{l.client.fullName}</span>
                      <span className="block truncate text-[13px] text-ink-mute">
                        {l.assignedWorkout?.name ?? "Ad-hoc session"} · {l._count.sets} sets
                      </span>
                    </span>
                    <span className="shrink-0 text-[13px] text-ink-mute">{format(l.date, "EEE")}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}

export default async function InboxPage() {
  const session = await auth();
  const workspaceId = session?.user?.workspaceId;
  if (!workspaceId) redirect("/login");
  const firstName = (session.user.name || "Coach").split(" ")[0];

  const clients = await prisma.clientProfile.findMany({ where: { workspaceId, deletedAt: null, ...ROSTER }, select: { id: true, fullName: true, primaryGoal: true, status: true } });

  return (
    <div className="space-y-8">
      <div className="rise flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
        <Greeting name={firstName} />
        <div className="flex flex-wrap gap-2">
          <LogSessionCard clients={clients} />
          <Link href="/programs/new" className="press flex h-10 items-center gap-2 rounded-xl border border-line bg-white px-4 text-sm font-semibold text-ink hover:border-ink/25">
            <Plus className="h-4 w-4" /> New plan
          </Link>
          <Link href="/clients" className="press flex h-10 items-center gap-2 rounded-xl bg-ink px-4 text-sm font-semibold text-white hover:bg-ink/85">
            <UserPlus className="h-4 w-4" /> Add client
          </Link>
        </div>
      </div>

      <Suspense fallback={<Skeleton />}>
        <InboxContent workspaceId={workspaceId} />
      </Suspense>
    </div>
  );
}
