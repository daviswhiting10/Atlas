"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  ArrowLeft,
  Dumbbell,
  ClipboardList,
  FileText,
  MessageSquare,
  AlertTriangle,
  Trash2,
  UserCheck,
  ChevronDown,
  CalendarDays,
  TrendingDown,
  Activity,
  Clock,
  MoreHorizontal,
  BarChart2,
} from "lucide-react";

type ProgramAssignment = {
  id: string;
  name: string;
  status: string;
  startDate: string;
  createdAt: string;
  sourceProgram: { id: string; name: string };
  _count: { assignedWorkouts: number };
};

type Client = {
  id: string;
  fullName: string;
  email: string | null;
  phone: string | null;
  status: "PROSPECT" | "ACTIVE" | "AT_RISK" | "CHURNED";
  primaryGoal: string | null;
  retentionScore: number | null;
  retentionFlag: string | null;
  lastContactAt: string | null;
  createdAt: string;
  programAssignments: ProgramAssignment[];
  sessionNotes: Array<{ id: string; date: string; rawInput: string; rpeAvg: number | null }>;
  workoutLogs: Array<{
    id: string;
    date: string;
    durationMin: number | null;
    clientNotes: string | null;
    _count: { sets: number };
    assignedWorkout: {
      scheduledDate: string;
      programAssignment: { name: string };
    } | null;
  }>;
  intakeForms: Array<{
    id: string;
    aiSummary: string | null;
    createdAt: string;
    redFlags: Array<{ issue: string; severity: string; recommendedAction: string }> | null;
  }>;
  outreachLog: Array<{ id: string; purpose: string; channel: string; createdAt: string; sentAt: string | null }>;
};

const GOAL_LABELS: Record<string, string> = {
  weight_loss: "Weight Loss",
  hypertrophy: "Hypertrophy",
  pain_mgmt: "Pain Management",
  performance: "Athletic Performance",
  general: "General Fitness",
};

const GOAL_AVATAR_BG: Record<string, string> = {
  weight_loss: "bg-emerald-100 text-emerald-700",
  hypertrophy: "bg-blue-100 text-blue-700",
  pain_mgmt: "bg-amber-100 text-amber-700",
  performance: "bg-violet-100 text-violet-700",
  general: "bg-zinc-100 text-zinc-600",
};

const STATUS_CONFIG = {
  PROSPECT: { label: "Prospect", className: "bg-zinc-100 text-zinc-600 border-zinc-200" },
  ACTIVE: { label: "Active", className: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  AT_RISK: { label: "At Risk", className: "bg-amber-50 text-amber-700 border-amber-200" },
  CHURNED: { label: "Churned", className: "bg-red-50 text-red-700 border-red-200" },
};

function getInitials(name: string) {
  return name
    .split(" ")
    .map((n) => n[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

function getWeekBounds() {
  const now = new Date();
  const day = now.getDay(); // 0=Sun
  const monday = new Date(now);
  monday.setDate(now.getDate() - ((day + 6) % 7));
  monday.setHours(0, 0, 0, 0);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  sunday.setHours(23, 59, 59, 999);
  return { monday, sunday };
}

function relativeTime(date: string) {
  const diff = Date.now() - new Date(date).getTime();
  const days = Math.floor(diff / 86400000);
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days}d ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

export default function ClientDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [client, setClient] = useState<Client | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/clients/${id}`)
      .then((r) => r.json())
      .then(setClient)
      .finally(() => setLoading(false));
  }, [id]);

  async function updateStatus(status: string) {
    const res = await fetch(`/api/clients/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    if (res.ok) {
      const updated = await res.json();
      setClient((prev) => (prev ? { ...prev, status: updated.status } : null));
      toast.success("Status updated");
    }
  }

  async function inviteClient() {
    if (!client?.email) { toast.error("Add an email first"); return; }
    const res = await fetch(`/api/clients/${id}/invite`, { method: "POST" });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      toast.error(err?.error ?? "Invite failed");
      return;
    }
    const data = await res.json();
    toast.success(`Invite sent to ${data.email}`);
  }

  async function deleteClient() {
    if (!confirm(`Delete ${client?.fullName}? This cannot be undone.`)) return;
    await fetch(`/api/clients/${id}`, { method: "DELETE" });
    toast.success("Client deleted");
    router.push("/clients");
  }

  if (loading) {
    return (
      <div className="p-8 max-w-5xl space-y-4">
        <div className="h-8 w-32 bg-muted rounded animate-pulse" />
        <div className="h-24 bg-muted rounded-xl animate-pulse" />
        <div className="h-16 bg-muted rounded-lg animate-pulse" />
        <div className="h-8 bg-muted rounded animate-pulse" />
        <div className="h-64 bg-muted rounded-lg animate-pulse" />
      </div>
    );
  }

  if (!client) {
    return (
      <div className="p-8">
        <p className="text-muted-foreground">Client not found.</p>
        <Link href="/clients" className={cn(buttonVariants({ variant: "link" }), "p-0 mt-2 block")}>
          Back to clients
        </Link>
      </div>
    );
  }

  // ── Computed values ──────────────────────────────────────────────────────
  const statusCfg = STATUS_CONFIG[client.status] ?? STATUS_CONFIG.PROSPECT;
  const goalLabel = client.primaryGoal ? (GOAL_LABELS[client.primaryGoal] ?? client.primaryGoal) : null;
  const avatarBg = client.primaryGoal ? (GOAL_AVATAR_BG[client.primaryGoal] ?? "bg-zinc-100 text-zinc-600") : "bg-zinc-100 text-zinc-600";
  const activeProgram = client.programAssignments.find((a) => a.status === "ACTIVE");
  const redFlags = client.intakeForms[0]?.redFlags ?? null;
  const { monday, sunday } = getWeekBounds();
  const sessionsThisWeek = client.workoutLogs.filter((s) => {
    const d = new Date(s.date);
    return d >= monday && d <= sunday;
  }).length;
  const lastSession = client.workoutLogs[0] ?? null;
  const lastContact = client.lastContactAt
    ? new Date(client.lastContactAt)
    : lastSession
    ? new Date(lastSession.date)
    : null;

  return (
    <div className="p-4 md:p-8 max-w-5xl pb-12">
      {/* Back */}
      <Link href="/clients" className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "mb-3 -ml-2")}>
        <ArrowLeft className="w-4 h-4 mr-1" />
        Clients
      </Link>

      {/* ── Header strip ──────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between mb-4 gap-3">
        <div className="flex items-center gap-3 min-w-0">
          {/* Avatar */}
          <div className={cn("w-12 h-12 md:w-14 md:h-14 rounded-full flex items-center justify-center text-base md:text-lg font-bold shrink-0", avatarBg)}>
            {getInitials(client.fullName)}
          </div>
          {/* Name + meta */}
          <div className="min-w-0">
            <h1 className="text-xl md:text-2xl font-bold tracking-tight leading-tight truncate">{client.fullName}</h1>
            <div className="flex items-center gap-2 mt-0.5 flex-wrap">
              <DropdownMenu>
                <DropdownMenuTrigger
                  className={cn(
                    "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border transition-colors cursor-pointer hover:opacity-80",
                    statusCfg.className
                  )}
                >
                  {statusCfg.label}
                  <ChevronDown className="w-3 h-3 opacity-60" />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" sideOffset={4}>
                  {Object.entries(STATUS_CONFIG).map(([val, cfg]) => (
                    <DropdownMenuItem key={val} onClick={() => updateStatus(val)}>
                      <span className={cn("w-2 h-2 rounded-full mr-2 border", cfg.className)} />
                      {cfg.label}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
              {goalLabel && (
                <span className="text-xs text-muted-foreground hidden sm:inline">{goalLabel}</span>
              )}
            </div>
          </div>
        </div>

        {/* Actions — icon-only on mobile, labeled on desktop */}
        <div className="flex items-center gap-1.5 shrink-0">
          <Link
            href={`/outreach?clientId=${client.id}`}
            className={cn(buttonVariants({ variant: "outline", size: "sm" }), "h-9 w-9 p-0 md:w-auto md:px-3")}
            title="Message"
          >
            <MessageSquare className="w-4 h-4 shrink-0" />
            <span className="hidden md:inline ml-1.5">Message</span>
          </Link>
          <Link
            href={`/clients/${client.id}/log`}
            className={cn(buttonVariants({ size: "sm" }), "h-9 w-9 p-0 md:w-auto md:px-3")}
            title="Log Session"
          >
            <ClipboardList className="w-4 h-4 shrink-0" />
            <span className="hidden md:inline ml-1.5">Log</span>
          </Link>
          <DropdownMenu>
            <DropdownMenuTrigger className="inline-flex items-center justify-center h-9 w-9 rounded-md border border-input bg-background hover:bg-accent hover:text-accent-foreground transition-colors">
              <MoreHorizontal className="w-4 h-4" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={inviteClient}>
                <UserCheck className="w-3.5 h-3.5 mr-2" />
                Invite client
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={deleteClient}
                className="text-destructive focus:text-destructive"
              >
                <Trash2 className="w-3.5 h-3.5 mr-2" />
                Delete client
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Retention flag banner */}
      {client.retentionFlag && (
        <div className="mb-4 px-4 py-2.5 rounded-lg border border-amber-200 bg-amber-50/60 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
          <p className="text-sm text-amber-800">{client.retentionFlag}</p>
        </div>
      )}

      {/* ── KPI strip — scrollable on mobile, grid on desktop ────────────── */}
      <div className="flex gap-3 overflow-x-auto pb-1 mb-5 snap-x snap-mandatory md:grid md:grid-cols-3 md:overflow-visible md:pb-0 lg:grid-cols-5">
        <KpiTile
          icon={<TrendingDown className="w-4 h-4" />}
          label="Current weight"
          value="—"
          sub="No measurements"
        />
        <KpiTile
          icon={<Activity className="w-4 h-4" />}
          label="Adherence"
          value="—"
          sub="No workout logs"
        />
        <KpiTile
          icon={<CalendarDays className="w-4 h-4" />}
          label="Sessions this week"
          value={sessionsThisWeek > 0 ? String(sessionsThisWeek) : "0"}
          sub={sessionsThisWeek === 1 ? "session logged" : "sessions logged"}
        />
        <KpiTile
          icon={<CalendarDays className="w-4 h-4" />}
          label="Last session"
          value={lastSession ? relativeTime(lastSession.date) : "—"}
          sub={lastSession ? new Date(lastSession.date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "None yet"}
        />
        <KpiTile
          icon={<Clock className="w-4 h-4" />}
          label="Last contact"
          value={lastContact ? relativeTime(lastContact.toISOString()) : "—"}
          sub={lastContact ? lastContact.toLocaleDateString() : "None recorded"}
        />
      </div>

      {/* ── Tabs ──────────────────────────────────────────────────────────── */}
      <Tabs defaultValue="overview">
        <TabsList className="w-full justify-start mb-5 h-auto p-0 bg-transparent border-b rounded-none gap-0 overflow-x-auto flex-nowrap">
          <TabsTrigger value="overview" className="rounded-none border-b-2 border-transparent data-active:border-primary data-active:bg-transparent px-4 py-2 text-sm">
            Overview
          </TabsTrigger>
          <TabsTrigger value="programs" className="rounded-none border-b-2 border-transparent data-active:border-primary data-active:bg-transparent px-4 py-2 text-sm">
            Programs
            {client.programAssignments.length > 0 && (
              <Badge variant="secondary" className="ml-1.5 text-xs h-4 px-1 py-0">
                {client.programAssignments.length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="sessions" className="rounded-none border-b-2 border-transparent data-active:border-primary data-active:bg-transparent px-4 py-2 text-sm">
            Sessions
            {client.workoutLogs.length > 0 && (
              <Badge variant="secondary" className="ml-1.5 text-xs h-4 px-1 py-0">
                {client.workoutLogs.length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="files" className="rounded-none border-b-2 border-transparent data-active:border-primary data-active:bg-transparent px-4 py-2 text-sm">
            Files
            {client.intakeForms.length > 0 && (
              <Badge variant="secondary" className="ml-1.5 text-xs h-4 px-1 py-0">
                {client.intakeForms.length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="notes" className="rounded-none border-b-2 border-transparent data-active:border-primary data-active:bg-transparent px-4 py-2 text-sm">
            Notes
          </TabsTrigger>
          <Link
            href={`/clients/${client.id}/progress`}
            className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground flex items-center gap-1.5 border-b-2 border-transparent whitespace-nowrap"
          >
            <BarChart2 className="w-3.5 h-3.5" />
            Progress
          </Link>
        </TabsList>

        {/* ── Overview tab ──────────────────────────────────────────────── */}
        <TabsContent value="overview">
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">
            {/* Main column */}
            <div className="lg:col-span-3 space-y-4">
              {/* Current Program card */}
              <Card>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm font-semibold">Current Program</CardTitle>
                    <Link href="/programs" className="text-xs text-muted-foreground hover:text-foreground">
                      Browse library →
                    </Link>
                  </div>
                </CardHeader>
                <CardContent className="pt-0">
                  {activeProgram ? (
                    <div>
                      <Link
                        href={`/clients/${client.id}/programs/${activeProgram.id}`}
                        className="text-sm font-medium hover:underline"
                      >
                        {activeProgram.name}
                      </Link>
                      <p className="text-xs text-muted-foreground mt-1">
                        Started {new Date(activeProgram.startDate).toLocaleDateString()} ·{" "}
                        {activeProgram._count.assignedWorkouts} total sessions
                      </p>
                    </div>
                  ) : (
                    <div className="py-4 text-center">
                      <Dumbbell className="w-7 h-7 text-muted-foreground mx-auto mb-2" />
                      <p className="text-sm font-medium">No program assigned</p>
                      <p className="text-xs text-muted-foreground mt-1 mb-3">
                        Pick a template from the library to get started.
                      </p>
                      <Link href="/programs" className={buttonVariants({ size: "sm" })}>
                        Assign Program
                      </Link>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Recent sessions */}
              <Card>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm font-semibold">Recent Sessions</CardTitle>
                    <Link
                      href={`/clients/${client.id}/log`}
                      className={cn(buttonVariants({ size: "sm", variant: "ghost" }), "h-7 text-xs")}
                    >
                      <ClipboardList className="w-3 h-3 mr-1" />
                      Log Session
                    </Link>
                  </div>
                </CardHeader>
                <CardContent className="pt-0">
                  {client.workoutLogs.length === 0 ? (
                    <div className="py-3 text-center">
                      <p className="text-sm text-muted-foreground">No sessions yet.</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {client.workoutLogs.slice(0, 5).map((s) => (
                        <div key={s.id} className="flex items-center justify-between py-1.5 border-b last:border-0">
                          <div className="min-w-0">
                            <p className="text-xs font-medium">
                              {new Date(s.date).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {s.assignedWorkout?.programAssignment.name ?? "Ad-hoc session"} · {s._count.sets} sets logged
                            </p>
                          </div>
                          {s.durationMin != null && (
                            <span className="text-xs font-mono text-muted-foreground ml-3 shrink-0">
                              {s.durationMin}m
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Side column */}
            <div className="lg:col-span-2 space-y-4">
              {/* Goals widget */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-semibold">Goals</CardTitle>
                </CardHeader>
                <CardContent className="pt-0">
                  {goalLabel ? (
                    <div className="flex items-center gap-2">
                      <div className={cn("w-2.5 h-2.5 rounded-full", avatarBg.split(" ")[0])} />
                      <span className="text-sm">{goalLabel}</span>
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground">No goal set. Edit the client to add one.</p>
                  )}
                </CardContent>
              </Card>

              {/* Red flags / intake CTA */}
              {redFlags && redFlags.length > 0 ? (
                <Card className="border-red-200">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-semibold text-red-700 flex items-center gap-1.5">
                      <AlertTriangle className="w-3.5 h-3.5" />
                      Red Flags
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="pt-0 space-y-2">
                    {redFlags.map((flag, i) => (
                      <div key={i} className="p-2.5 bg-red-50 rounded border border-red-100">
                        <div className="flex items-center justify-between mb-0.5">
                          <span className="text-xs font-medium text-red-800">{flag.issue}</span>
                          <Badge
                            variant="outline"
                            className={cn(
                              "text-[10px] h-4 px-1",
                              flag.severity === "high" ? "border-red-300 text-red-700" :
                              flag.severity === "medium" ? "border-amber-300 text-amber-700" :
                              "border-zinc-300 text-zinc-600"
                            )}
                          >
                            {flag.severity}
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground">{flag.recommendedAction}</p>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              ) : client.intakeForms.length === 0 ? (
                <Card className="border-dashed">
                  <CardContent className="py-5 text-center">
                    <FileText className="w-6 h-6 text-muted-foreground mx-auto mb-2" />
                    <p className="text-sm font-medium">No intake form</p>
                    <p className="text-xs text-muted-foreground mt-1 mb-2.5">
                      Complete an intake to enable AI summaries and red-flag detection.
                    </p>
                    <Link href={`/intake?clientId=${client.id}`} className={buttonVariants({ size: "sm" })}>
                      Start Intake
                    </Link>
                  </CardContent>
                </Card>
              ) : client.intakeForms[0]?.aiSummary ? (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-semibold">AI Intake Summary</CardTitle>
                  </CardHeader>
                  <CardContent className="pt-0">
                    <p className="text-xs text-muted-foreground leading-relaxed line-clamp-6">
                      {client.intakeForms[0].aiSummary}
                    </p>
                  </CardContent>
                </Card>
              ) : null}

              {/* Retention */}
              {client.retentionScore != null && (
                <Card>
                  <CardContent className="py-3 px-4">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-muted-foreground">Retention score</span>
                      <span className={cn(
                        "text-sm font-semibold",
                        client.retentionScore >= 70 ? "text-emerald-600" :
                        client.retentionScore >= 40 ? "text-amber-600" : "text-red-600"
                      )}>
                        {client.retentionScore}/100
                      </span>
                    </div>
                    <div className="mt-2 h-1.5 bg-muted rounded-full overflow-hidden">
                      <div
                        className={cn(
                          "h-full rounded-full",
                          client.retentionScore >= 70 ? "bg-emerald-500" :
                          client.retentionScore >= 40 ? "bg-amber-500" : "bg-red-500"
                        )}
                        style={{ width: `${client.retentionScore}%` }}
                      />
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Client meta */}
              <p className="text-xs text-muted-foreground px-1">
                Added {new Date(client.createdAt).toLocaleDateString()}
              </p>
            </div>
          </div>
        </TabsContent>

        {/* ── Programs tab ──────────────────────────────────────────────── */}
        <TabsContent value="programs">
          <div className="flex justify-between items-center mb-3">
            <p className="text-sm text-muted-foreground">
              {client.programAssignments.length} assignment{client.programAssignments.length !== 1 ? "s" : ""}
            </p>
            <Link href="/programs" className={cn(buttonVariants({ size: "sm" }))}>
              <Dumbbell className="w-3 h-3 mr-1.5" />
              Assign Program
            </Link>
          </div>
          {client.programAssignments.length === 0 ? (
            <Card className="border-dashed">
              <CardContent className="py-10 text-center">
                <Dumbbell className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
                <p className="text-sm font-medium">No programs assigned</p>
                <p className="text-xs text-muted-foreground mt-1 mb-3">
                  Build a program in the library, then assign it here.
                </p>
                <Link href="/programs" className={cn(buttonVariants({ size: "sm" }))}>
                  Go to Program Library
                </Link>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2">
              {client.programAssignments.map((a) => (
                <Link key={a.id} href={`/clients/${client.id}/programs/${a.id}`}>
                  <Card className="hover:border-primary/40 transition-colors cursor-pointer">
                    <CardContent className="py-3 px-4 flex items-center justify-between">
                      <div>
                        <p className="text-sm font-semibold">{a.name}</p>
                        <p className="text-xs text-muted-foreground">
                          Started {new Date(a.startDate).toLocaleDateString()} · {a._count.assignedWorkouts} sessions
                        </p>
                      </div>
                      <Badge
                        variant="outline"
                        className={cn(
                          "text-xs capitalize",
                          a.status === "ACTIVE" && "border-emerald-200 text-emerald-700"
                        )}
                      >
                        {a.status.toLowerCase()}
                      </Badge>
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          )}
        </TabsContent>

        {/* ── Sessions tab ──────────────────────────────────────────────── */}
        <TabsContent value="sessions">
          <div className="flex justify-between items-center mb-3">
            <p className="text-sm text-muted-foreground">{client.workoutLogs.length} sessions logged</p>
            <Link href={`/clients/${client.id}/log`} className={cn(buttonVariants({ size: "sm" }))}>
              <ClipboardList className="w-3 h-3 mr-1.5" />
              Log Session
            </Link>
          </div>
          {client.workoutLogs.length === 0 ? (
            <Card className="border-dashed">
              <CardContent className="py-10 text-center">
                <ClipboardList className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
                <p className="text-sm font-medium">No sessions logged</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2">
              {client.workoutLogs.map((s) => (
                <Card key={s.id}>
                  <CardContent className="py-3 px-4">
                    <div className="flex items-center justify-between mb-1">
                      <p className="text-sm font-semibold">
                        {new Date(s.date).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" })}
                      </p>
                      {s.durationMin != null && (
                        <span className="text-xs font-mono text-muted-foreground">{s.durationMin} min</span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {s.assignedWorkout?.programAssignment.name ?? "Ad-hoc session"} · {s._count.sets} sets logged
                    </p>
                    {s.clientNotes && (
                      <p className="text-xs text-muted-foreground mt-1 line-clamp-2 italic">{s.clientNotes}</p>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* ── Files tab ─────────────────────────────────────────────────── */}
        <TabsContent value="files">
          <div className="flex justify-between items-center mb-3">
            <p className="text-sm text-muted-foreground">{client.intakeForms.length} files</p>
            <Link href={`/intake?clientId=${client.id}`} className={cn(buttonVariants({ size: "sm" }))}>
              <FileText className="w-3 h-3 mr-1.5" />
              New Intake
            </Link>
          </div>
          {client.intakeForms.length === 0 ? (
            <Card className="border-dashed">
              <CardContent className="py-10 text-center">
                <FileText className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
                <p className="text-sm font-medium">No files yet</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2">
              {client.intakeForms.map((f) => (
                <Card key={f.id}>
                  <CardContent className="py-3 px-4 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <FileText className="w-4 h-4 text-muted-foreground" />
                      <div>
                        <p className="text-sm font-medium">Intake Form</p>
                        <p className="text-xs text-muted-foreground">{new Date(f.createdAt).toLocaleDateString()}</p>
                      </div>
                    </div>
                    {f.aiSummary && <Badge variant="outline" className="text-xs">AI processed</Badge>}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* ── Notes tab ─────────────────────────────────────────────────── */}
        <TabsContent value="notes">
          <Card className="border-dashed">
            <CardContent className="py-10 text-center">
              <p className="text-sm text-muted-foreground">Coach notes coming soon.</p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function KpiTile({
  icon,
  label,
  value,
  sub,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub: string;
}) {
  return (
    <div className="rounded-lg border bg-card px-4 py-3 space-y-1 snap-start shrink-0 min-w-[140px] md:min-w-0">
      <div className="flex items-center gap-1.5 text-muted-foreground">
        <span className="w-4 h-4">{icon}</span>
        <span className="text-xs">{label}</span>
      </div>
      <p className="text-xl font-semibold tracking-tight">{value}</p>
      <p className="text-xs text-muted-foreground">{sub}</p>
    </div>
  );
}
