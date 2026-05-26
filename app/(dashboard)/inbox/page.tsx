import { getClients, runRetentionHeuristic } from "@/lib/db/clients";
import { auth } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { StatusBadge } from "@/components/status-badge";
import { AlertTriangle, CalendarClock, ClipboardList, MessageSquare, Users } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { LogSessionCard } from "./_components/LogSessionCard";
import { ProspectFollowUpButton } from "./_components/ProspectFollowUpButton";

export default async function InboxPage() {
  const session = await auth();
  const workspaceId = session?.user?.workspaceId;
  // runRetentionHeuristic must finish before getClients so the read sees updated statuses.
  // These are intentionally sequential (write-then-read), not a parallelization target.
  let clients: Awaited<ReturnType<typeof getClients>> = [];
  if (workspaceId) {
    await runRetentionHeuristic(workspaceId);
    clients = await getClients(workspaceId);
  }

  const activeClients = clients.filter((c) => c.status === "ACTIVE");
  const atRiskClients  = clients.filter((c) => c.status === "AT_RISK");
  const prospects      = clients.filter((c) => c.status === "PROSPECT");

  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";

  return (
    <div className="px-5 pt-7 md:px-8 md:pt-8 md:max-w-5xl">
      {/* ── Page heading — Instrument Serif, italic name ─────────────── */}
      <div className="mb-6 md:mb-10">
        <h1
          className="font-display leading-[1.04] tracking-[-0.01em]"
          style={{ fontSize: "clamp(2.5rem, 5vw, 4rem)", color: "var(--ink)" }}
        >
          {greeting},&nbsp;<em>Davis.</em>
        </h1>
        <p className="font-body text-sm mt-1.5" style={{ color: "var(--ink-mute)" }}>
          {new Date().toLocaleDateString("en-US", {
            weekday: "long",
            month: "long",
            day: "numeric",
          })}
        </p>
      </div>

      {/* ── Stat strip — numbers in Instrument Serif italic ──────────── */}
      <div className="grid grid-cols-2 gap-3 mb-6 md:grid-cols-4 md:gap-4 md:mb-10">
        {[
          { value: clients.length,       label: "Total Clients", color: "var(--ink)" },
          { value: activeClients.length,  label: "Active",        color: "var(--success)" },
          { value: atRiskClients.length,  label: "At Risk",       color: "var(--warn)" },
          { value: prospects.length,      label: "Prospects",     color: "var(--blue)" },
        ].map(({ value, label, color }) => (
          <Card key={label} lift>
            <CardContent className="pt-4 pb-3">
              <div
                className="font-display italic leading-none"
                style={{ fontSize: "clamp(3.5rem, 6vw, 5rem)", color }}
              >
                {value}
              </div>
              <div className="font-body text-xs mt-1" style={{ color: "var(--ink-mute)" }}>
                {label}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* ── At-risk alerts ────────────────────────────────────────────── */}
      {atRiskClients.length > 0 && (
        <div
          className="mb-6 rounded-[18px] p-4"
          style={{
            border: "1px solid rgba(180,83,9,0.25)",
            background: "rgba(180,83,9,0.05)",
          }}
        >
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle className="w-4 h-4 shrink-0" style={{ color: "var(--warn)" }} />
            <p className="font-body text-sm font-medium" style={{ color: "var(--warn)" }}>
              {atRiskClients.length} client{atRiskClients.length > 1 ? "s" : ""} need attention
            </p>
          </div>
          <div className="space-y-2">
            {atRiskClients.map((client) => (
              <div
                key={client.id}
                className="flex items-center justify-between py-2 px-3 rounded-xl"
                style={{
                  background: "var(--paper)",
                  border: "1px solid var(--line)",
                }}
              >
                <div>
                  <Link
                    href={`/clients/${client.id}`}
                    className="font-body text-sm font-medium hover:underline"
                    style={{ color: "var(--ink)" }}
                  >
                    {client.fullName}
                  </Link>
                  {client.retentionFlag && (
                    <p className="font-body text-xs mt-0.5" style={{ color: "var(--ink-mute)" }}>
                      {client.retentionFlag}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {client.retentionScore != null && (
                    <span
                      className="hidden md:inline font-body text-xs"
                      style={{ color: "var(--ink-mute)" }}
                    >
                      Score: {client.retentionScore}
                    </span>
                  )}
                  <Link
                    href={`/outreach?clientId=${client.id}`}
                    className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
                  >
                    <MessageSquare className="w-3 h-3 md:mr-1" />
                    <span className="hidden md:inline">Reach out</span>
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Prospect follow-up reminders ─────────────────────────────── */}
      {(() => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const followUps = clients.filter((c) => c.status === "PROSPECT" && (c as any).reachOutDate != null);
        if (followUps.length === 0) return null;
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        return (
          <div
            className="mb-6 rounded-[18px] p-4"
            style={{
              border: "1px solid rgba(43,107,255,0.2)",
              background: "rgba(43,107,255,0.04)",
            }}
          >
            <div className="flex items-center gap-2 mb-3">
              <CalendarClock className="w-4 h-4 shrink-0" style={{ color: "var(--blue)" }} />
              <p className="font-body text-sm font-medium" style={{ color: "var(--blue)" }}>
                {followUps.length} prospect follow-up{followUps.length > 1 ? "s" : ""} scheduled
              </p>
            </div>
            <div className="space-y-2">
              {followUps.map((client) => {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const rod: Date = (client as any).reachOutDate as Date;
                const due = new Date(rod.toISOString().slice(0, 10) + "T12:00:00");
                const isPast = due < today;
                const label = isPast
                  ? "Overdue"
                  : due.toLocaleDateString("en-US", { month: "short", day: "numeric" });
                return (
                  <div
                    key={client.id}
                    className="flex items-center justify-between py-2 px-3 rounded-xl"
                    style={{ background: "var(--paper)", border: "1px solid var(--line)" }}
                  >
                    <div>
                      <Link
                        href={`/clients/${client.id}`}
                        className="font-body text-sm font-medium hover:underline"
                        style={{ color: "var(--ink)" }}
                      >
                        {client.fullName}
                      </Link>
                      <p className="font-body text-xs mt-0.5" style={{ color: isPast ? "var(--warn)" : "var(--ink-mute)" }}>
                        Follow up: {label}
                      </p>
                    </div>
                    <ProspectFollowUpButton clientId={client.id} />
                  </div>
                );
              })}
            </div>
          </div>
        );
      })()}

      {/* ── Quick actions ─────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 md:gap-4 mb-6 md:mb-8">
        {/* Add Client */}
        <Link href="/clients">
          <Card lift className="cursor-pointer">
            <CardContent className="py-4 px-4 flex items-center gap-3 sm:flex-col sm:items-start sm:pt-5 sm:gap-2 min-h-[72px] sm:min-h-[120px]">
              <div className="w-9 h-9 rounded-[10px] flex items-center justify-center shrink-0" style={{ background: "rgba(43,107,255,0.08)" }}>
                <Users className="w-[18px] h-[18px]" style={{ color: "var(--blue)" }} />
              </div>
              <div>
                <p className="font-body text-sm font-medium" style={{ color: "var(--ink)" }}>Add Client</p>
                <p className="font-body text-xs" style={{ color: "var(--ink-mute)" }}>New intake or import</p>
              </div>
            </CardContent>
          </Card>
        </Link>

        {/* Log Session — client picker dialog */}
        <LogSessionCard clients={clients.map((c) => ({ id: c.id, fullName: c.fullName, primaryGoal: c.primaryGoal ?? null, status: c.status }))} />

        {/* Outreach */}
        <Link href="/outreach">
          <Card lift className="cursor-pointer">
            <CardContent className="py-4 px-4 flex items-center gap-3 sm:flex-col sm:items-start sm:pt-5 sm:gap-2 min-h-[72px] sm:min-h-[120px]">
              <div className="w-9 h-9 rounded-[10px] flex items-center justify-center shrink-0" style={{ background: "rgba(43,107,255,0.08)" }}>
                <MessageSquare className="w-[18px] h-[18px]" style={{ color: "var(--blue)" }} />
              </div>
              <div>
                <p className="font-body text-sm font-medium" style={{ color: "var(--ink)" }}>Outreach</p>
                <p className="font-body text-xs" style={{ color: "var(--ink-mute)" }}>Generate messages</p>
              </div>
            </CardContent>
          </Card>
        </Link>
      </div>

      {/* ── Client list ───────────────────────────────────────────────── */}
      {clients.length > 0 ? (
        <Card>
          <CardHeader className="pb-3 flex flex-row items-center justify-between">
            <CardTitle className="font-display text-sm">
              <span className="md:hidden">Start Session</span>
              <span className="hidden md:inline">All Clients</span>
            </CardTitle>
            <Link
              href="/clients"
              className={cn(buttonVariants({ variant: "ghost", size: "sm" }))}
            >
              View all
            </Link>
          </CardHeader>
          <CardContent className="p-0 md:px-4 md:pb-4">
            <div className="divide-y divide-[var(--line)] md:divide-y-0 md:space-y-0.5">
              {clients.slice(0, 8).map((client) => (
                <div
                  key={client.id}
                  className="flex items-center gap-3 px-4 md:px-2 py-3 md:py-2 md:rounded-xl md:hover:bg-[rgba(11,15,26,0.03)] transition-colors"
                >
                  <Link
                    href={`/clients/${client.id}`}
                    className="flex items-center gap-3 flex-1 min-w-0"
                  >
                    <div
                      className="w-8 h-8 rounded-full flex items-center justify-center font-body text-xs font-medium shrink-0"
                      style={{
                        background: "rgba(43,107,255,0.08)",
                        color: "var(--blue)",
                      }}
                    >
                      {client.fullName.charAt(0)}
                    </div>
                    <div className="min-w-0">
                      <p className="font-body text-sm font-medium truncate" style={{ color: "var(--ink)" }}>
                        {client.fullName}
                      </p>
                      {client.primaryGoal && (
                        <p className="font-body text-xs truncate" style={{ color: "var(--ink-mute)" }}>
                          {client.primaryGoal.replace(/_/g, " ")}
                        </p>
                      )}
                    </div>
                  </Link>
                  <Link
                    href={`/clients/${client.id}/log`}
                    className={cn(
                      buttonVariants({ variant: "outline", size: "sm" }),
                      "md:hidden shrink-0 gap-1.5"
                    )}
                  >
                    <ClipboardList className="w-3.5 h-3.5" />
                    Log
                  </Link>
                  <div className="hidden md:block shrink-0">
                    <StatusBadge
                      status={client.status as "PROSPECT" | "ACTIVE" | "AT_RISK" | "CHURNED"}
                    />
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="py-16 flex flex-col items-center text-center">
            <div
              className="w-14 h-14 rounded-full flex items-center justify-center mb-5"
              style={{ background: "rgba(43,107,255,0.08)" }}
            >
              <Users className="w-7 h-7" style={{ color: "var(--blue)" }} />
            </div>
            <h3 className="font-display text-xl mb-1" style={{ color: "var(--ink)" }}>
              No clients yet
            </h3>
            <p className="font-body text-sm mb-5 max-w-xs" style={{ color: "var(--ink-mute)" }}>
              Add your first client to get started. Atlas will help you track, program, and retain them.
            </p>
            <Link href="/clients" className={buttonVariants()}>
              Add first client
            </Link>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
