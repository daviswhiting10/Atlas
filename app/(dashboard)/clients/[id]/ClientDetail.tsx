"use client";

import { useEffect, useState } from "react";
import { useContentFade } from "@/hooks/use-content-fade";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Button, buttonVariants } from "@/components/ui/button";
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
import { StatRow } from "@/components/athlete/StatRow";
import { InviteSheet, type InviteResult } from "@/components/coach/InviteSheet";
import { SheetPlanUpload } from "@/components/coach/SheetPlanUpload";
import { categoryLabel } from "@/lib/programs/categories";
import {
  ArrowLeft,
  Dumbbell,
  ClipboardList,
  FileText,
  AlertTriangle,
  Trash2,
  UserCheck,
  ChevronDown,
  CalendarDays,
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
  /** Set once the client has a login (they've been invited). */
  userId: string | null;
  phone: string | null;
  status: "PROSPECT" | "ACTIVE" | "AT_RISK" | "CHURNED";
  primaryGoal: string | null;
  retentionScore: number | null;
  retentionFlag: string | null;
  lastContactAt: string | null;
  reachOutDate: string | null;
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
    /** "csv-import" rows hold spreadsheet details from an import, not an intake. */
    sourceType: string;
    parsedData: unknown;
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

function getInitials(name: string) {
  return name
    .split(" ")
    .map((n) => n[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

// Parse a date string (YYYY-MM-DD or ISO) as local time to avoid UTC-offset day shift
function localDate(dateStr: string): Date {
  // Append T12:00:00 so bare date strings don't shift to the previous day in western timezones
  const s = dateStr.slice(0, 10);
  return new Date(`${s}T12:00:00`);
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
  const diff = Date.now() - localDate(date).getTime();
  const days = Math.floor(diff / 86400000);
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days}d ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

/**
 * The client page. `progress` is rendered on the server (the client's lift
 * charts, the same screen they see) and shown above the tabs.
 */
export function ClientDetail({ progress }: { progress: React.ReactNode }) {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [client, setClient] = useState<Client | null>(null);
  const [loading, setLoading] = useState(true);
  const [invite, setInvite] = useState<InviteResult | null>(null);
  // ?tab=plan opens the Plan tab (the log page links there when there's no plan).
  const [tab, setTab] = useState(() => (typeof window !== "undefined" && new URLSearchParams(window.location.search).get("tab") === "plan" ? "plan" : "overview"));
  const phase = useContentFade(loading);

  useEffect(() => {
    fetch(`/api/clients/${id}`)
      .then((r) => {
        if (!r.ok) throw new Error(String(r.status));
        return r.json();
      })
      .then(setClient)
      .catch(() => setClient(null))
      .finally(() => setLoading(false));
  }, [id]);

  async function inviteClient() {
    if (!client?.email) { toast.error("Add an email first"); return; }
    const res = await fetch(`/api/clients/${id}/invite`, { method: "POST" });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      toast.error(err?.error ?? "Invite failed");
      return;
    }
    setInvite((await res.json()) as InviteResult);
  }

  async function deleteClient() {
    if (!confirm(`Delete ${client?.fullName}? This cannot be undone.`)) return;
    await fetch(`/api/clients/${id}`, { method: "DELETE" });
    toast.success("Client deleted");
    router.push("/clients");
  }

  async function setReachOutDate(date: string | null) {
    const res = await fetch(`/api/clients/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reachOutDate: date ? new Date(date + "T12:00:00").toISOString() : null }),
    });
    if (res.ok) {
      setClient((prev) => (prev ? { ...prev, reachOutDate: date } : null));
      toast.success(date ? "Reach-out date set" : "Reach-out date cleared");
    }
  }

  async function deleteWorkoutLog(logId: string, e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (!confirm("Delete this session? This cannot be undone.")) return;
    const res = await fetch(`/api/sessions/${logId}`, { method: "DELETE" });
    if (!res.ok) { toast.error("Could not delete session"); return; }
    setClient((prev) =>
      prev ? { ...prev, workoutLogs: prev.workoutLogs.filter((s) => s.id !== logId) } : null
    );
    toast.success("Session deleted");
  }

  if (phase === "loading") {
    return (
      <div className="space-y-4">
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
      <div className="">
        <p className="text-muted-foreground">Client not found.</p>
        <Link href="/clients" className={cn(buttonVariants({ variant: "link" }), "p-0 mt-2 block")}>
          Back to clients
        </Link>
      </div>
    );
  }

  // ── Computed values ──────────────────────────────────────────────────────
  const goalLabel = client.primaryGoal ? (GOAL_LABELS[client.primaryGoal] ?? client.primaryGoal) : null;
  const activeProgram = client.programAssignments.find((a) => a.status === "ACTIVE");
  const draftProgram = client.programAssignments.find((a) => a.status === "PAUSED");
  const firstName = client.fullName.split(" ")[0];
  // Spreadsheet details from an import are shown on their own, never as an intake.
  const intakes = client.intakeForms.filter((f) => f.sourceType !== "csv-import");
  const imported = client.intakeForms.filter((f) => f.sourceType === "csv-import");
  const redFlags = intakes[0]?.redFlags ?? null;
  const { monday, sunday } = getWeekBounds();
  const sessionsThisWeek = client.workoutLogs.filter((s) => {
    const d = localDate(s.date);
    return d >= monday && d <= sunday;
  }).length;
  const lastSession = client.workoutLogs[0] ?? null;

  return (
    <div className={cn("pb-12", phase === "fading" && "animate-in fade-in-0 duration-200 ease-out")}>
      {/* Back */}
      <Link href="/clients" className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "mb-3 -ml-2")}>
        <ArrowLeft className="w-4 h-4 mr-1" />
        Clients
      </Link>

      {/* ── Header strip ──────────────────────────────────────────────────── */}
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-center gap-3 min-w-0">
          {/* Avatar */}
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-ink text-base font-semibold text-white md:h-14 md:w-14 md:text-lg">
            {getInitials(client.fullName)}
          </div>
          {/* Name + meta */}
          <div className="min-w-0">
            <h1 className="text-[30px] leading-[1.08] text-ink sm:truncate sm:text-[38px]">{client.fullName}</h1>
            {goalLabel && <p className="mt-0.5 text-sm text-muted-foreground">{goalLabel}</p>}
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1.5 shrink-0">
          {!client.userId && (
            <button
              type="button"
              onClick={inviteClient}
              className={cn(buttonVariants({ variant: "outline", size: "sm" }), "h-9 px-3")}
              title={client.email ? `Give ${client.fullName.split(" ")[0]} access to their plan and progress` : "Add an email to invite"}
            >
              <UserCheck className="w-4 h-4 shrink-0" />
              <span className="ml-1.5">Invite</span>
            </button>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger className="inline-flex items-center justify-center h-9 w-9 rounded-md border border-input bg-background hover:bg-accent hover:text-accent-foreground transition-colors">
              <MoreHorizontal className="w-4 h-4" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={inviteClient}>
                <UserCheck className="w-3.5 h-3.5 mr-2" />
                {client.userId ? "New sign-in link" : "Invite client"}
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
        <div className="mb-4 px-4 py-2.5 rounded-lg border border-warn/30 bg-warn/10 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 text-warn mt-0.5 shrink-0" />
          <p className="text-sm text-warn">{client.retentionFlag}</p>
        </div>
      )}

      {/* Reach-out date (prospects only) */}
      {client.status === "PROSPECT" && (
        <div className="mb-4 px-4 py-2.5 rounded-lg border border-[var(--line)] bg-[var(--paper)] flex items-center gap-3 flex-wrap">
          <CalendarDays className="w-4 h-4 text-muted-foreground shrink-0" />
          <span className="font-body text-sm" style={{ color: "var(--ink-mute)" }}>Reach-out date</span>
          {client.reachOutDate ? (
            <span className="font-body text-sm font-medium" style={{ color: "var(--ink)" }}>
              {new Date(client.reachOutDate.slice(0, 10) + "T12:00:00").toLocaleDateString("en-US", {
                weekday: "short", month: "short", day: "numeric",
              })}
            </span>
          ) : (
            <span className="font-body text-sm italic" style={{ color: "var(--ink-mute)" }}>Not set</span>
          )}
          <div className="ml-auto flex items-center gap-2">
            <input
              type="date"
              value={client.reachOutDate ? client.reachOutDate.slice(0, 10) : ""}
              onChange={(e) => setReachOutDate(e.target.value || null)}
              className="font-body text-xs rounded-md border border-[var(--line)] px-2 py-1 bg-background focus:outline-none focus:ring-1 focus:ring-[var(--blue)]"
            />
            {client.reachOutDate && (
              <button
                onClick={() => setReachOutDate(null)}
                className="font-body text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                Clear
              </button>
            )}
          </div>
        </div>
      )}

      {/* ── The main thing a coach comes here to do ─────────────────────── */}
      <Link
        href={`/clients/${client.id}/log`}
        className="press mb-6 flex h-14 w-full items-center justify-center gap-2.5 rounded-2xl bg-ink text-lg font-semibold text-white hover:bg-ink/85 sm:w-auto sm:min-w-[300px] sm:inline-flex"
      >
        <ClipboardList className="h-5 w-5" />
        Log session
      </Link>

      {/* ── Headline numbers: the athlete app's stat row ───────────────── */}
      <StatRow
        className="mb-6"
        stats={[
          { label: "Sessions", value: String(client.workoutLogs.length), hint: "logged in total" },
          { label: "This week", value: String(sessionsThisWeek), hint: sessionsThisWeek === 1 ? "session" : "sessions" },
          { label: "Last session", value: lastSession ? relativeTime(lastSession.date) : "—", hint: lastSession ? localDate(lastSession.date).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "None yet" },
        ]}
      />

      {invite && <InviteSheet name={client.fullName} invite={invite} onClose={() => setInvite(null)} />}

      {/* ── Progress: the reason the plan exists ──────────────────────────── */}
      <section className="mb-10 mt-8">{progress}</section>

      {/* ── Tabs ──────────────────────────────────────────────────────────── */}
      <Tabs value={tab} onValueChange={(v) => setTab(String(v))}>
        <TabsList className="w-full justify-start mb-5 h-auto p-0 bg-transparent border-b rounded-none gap-0 overflow-x-auto flex-nowrap">
          <TabsTrigger value="overview" className="rounded-none border-b-2 border-transparent data-active:border-primary data-active:bg-transparent px-4 py-2 text-sm">
            Overview
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
            {intakes.length > 0 && (
              <Badge variant="secondary" className="ml-1.5 text-xs h-4 px-1 py-0">
                {intakes.length}
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
          <TabsTrigger value="plan" className="rounded-none border-b-2 border-transparent data-active:border-primary data-active:bg-transparent px-4 py-2 text-sm">
            Plan
          </TabsTrigger>
        </TabsList>

        {/* ── Overview tab ──────────────────────────────────────────────── */}
        <TabsContent value="overview">
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">
            {/* Main column */}
            <div className="lg:col-span-3 space-y-4">
              {/* The plan, in a line. Uploading and switching plans live on the Plan tab. */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-semibold">Plan</CardTitle>
                </CardHeader>
                <CardContent className="pt-0">
                  {activeProgram ? (
                    <div>
                      <Link href={`/clients/${client.id}/programs/${activeProgram.id}`} className="text-sm font-medium hover:underline">
                        {activeProgram.name}
                      </Link>
                      <p className="text-xs text-muted-foreground mt-1">Started {new Date(activeProgram.startDate).toLocaleDateString()}</p>
                    </div>
                  ) : draftProgram ? (
                    <div>
                      <p className="text-sm font-medium">{draftProgram.name}</p>
                      <p className="text-xs text-muted-foreground mt-1">Not live yet</p>
                      <Link href={`/clients/${client.id}/programs/${draftProgram.id}`} className={cn(buttonVariants({ size: "sm" }), "mt-3")}>
                        Review &amp; assign
                      </Link>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm text-muted-foreground">No plan yet</p>
                      <Button size="sm" onClick={() => setTab("plan")}>
                        Add a plan
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Recent sessions */}
              <Card>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm font-semibold">Recent sessions</CardTitle>
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
                        <Link
                          key={s.id}
                          href={`/clients/${client.id}/sessions/${s.id}`}
                          className="flex items-center justify-between py-1.5 border-b last:border-0 hover:bg-muted/40 -mx-1 px-1 rounded transition-colors"
                        >
                          <div className="min-w-0">
                            <p className="text-xs font-medium">
                              {localDate(s.date).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {s._count.sets} sets
                            </p>
                          </div>
                          {s.durationMin != null && (
                            <span className="text-xs font-mono text-muted-foreground ml-3 shrink-0">
                              {s.durationMin}m
                            </span>
                          )}
                        </Link>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Side column */}
            <div className="lg:col-span-2 space-y-4">
              {/* Details carried over from a spreadsheet import */}
              {imported.map((f) => {
                const data = (f.parsedData ?? {}) as { fileName?: string; fields?: Record<string, string> };
                const fields = Object.entries(data.fields ?? {});
                if (fields.length === 0) return null;
                return (
                  <Card key={f.id}>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-semibold">Imported details</CardTitle>
                      <p className="text-xs text-muted-foreground">
                        From {data.fileName ?? "a spreadsheet"} · {new Date(f.createdAt).toLocaleDateString()}
                      </p>
                    </CardHeader>
                    <CardContent className="pt-0">
                      <dl className="space-y-2">
                        {fields.map(([k, v]) => (
                          <div key={k}>
                            <dt className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{k}</dt>
                            <dd className="whitespace-pre-wrap break-words text-sm text-ink">{v}</dd>
                          </div>
                        ))}
                      </dl>
                    </CardContent>
                  </Card>
                );
              })}

              {/* Red flags / intake CTA */}
              {redFlags && redFlags.length > 0 ? (
                <Card className="border-destructive/30">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-semibold text-destructive flex items-center gap-1.5">
                      <AlertTriangle className="w-3.5 h-3.5" />
                      Red Flags
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="pt-0 space-y-2">
                    {redFlags.map((flag, i) => (
                      <div key={i} className="p-2.5 bg-destructive/10 rounded border border-destructive/30">
                        <div className="flex items-center justify-between mb-0.5">
                          <span className="text-xs font-medium text-destructive">{flag.issue}</span>
                          <Badge
                            variant="outline"
                            className={cn(
                              "text-[10px] h-4 px-1",
                              flag.severity === "high" ? "border-destructive/30 text-destructive" :
                              flag.severity === "medium" ? "border-warn/30 text-warn" :
                              "border-[var(--line)] text-[var(--ink-soft)]"
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
              ) : intakes.length === 0 ? (
                <Card className="border-dashed">
                  <CardContent className="py-5 text-center">
                    <FileText className="w-6 h-6 text-muted-foreground mx-auto mb-2" />
                    <p className="text-sm font-medium mb-2.5">No intake yet</p>
                    <Link href={`/intake?clientId=${client.id}`} className={buttonVariants({ size: "sm", variant: "outline" })}>
                      Start intake
                    </Link>
                  </CardContent>
                </Card>
              ) : intakes[0]?.sourceType === "intake-note" ? (
                (() => {
                  const note = (intakes[0].parsedData ?? {}) as { tag?: string; notes?: string };
                  return (
                    <Card>
                      <CardHeader className="pb-2">
                        <div className="flex items-center justify-between gap-2">
                          <CardTitle className="text-sm font-semibold">Intake</CardTitle>
                          <Link href={`/intake?clientId=${client.id}`} className="text-xs font-medium text-muted-foreground hover:text-foreground">
                            Update
                          </Link>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {note.tag ? `${categoryLabel(note.tag)} · ` : ""}
                          {new Date(intakes[0].createdAt).toLocaleDateString()}
                        </p>
                      </CardHeader>
                      <CardContent className="pt-0">
                        {note.notes ? (
                          <p className="whitespace-pre-wrap text-sm leading-relaxed text-ink">{note.notes}</p>
                        ) : (
                          <p className="text-xs text-muted-foreground">No notes written.</p>
                        )}
                      </CardContent>
                    </Card>
                  );
                })()
              ) : intakes[0]?.aiSummary ? (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-semibold">AI Intake Summary</CardTitle>
                  </CardHeader>
                  <CardContent className="pt-0">
                    <p className="text-xs text-muted-foreground leading-relaxed line-clamp-6">
                      {intakes[0].aiSummary}
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
                      <span
                        className="text-sm font-semibold"
                        style={{
                          color: client.retentionScore >= 70
                            ? "var(--success)"
                            : client.retentionScore >= 40
                            ? "var(--warn)"
                            : "var(--destructive)",
                        }}
                      >
                        {client.retentionScore}/100
                      </span>
                    </div>
                    <div className="mt-2 h-1.5 bg-muted rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${client.retentionScore}%`,
                          background: client.retentionScore >= 70
                            ? "var(--success)"
                            : client.retentionScore >= 40
                            ? "var(--warn)"
                            : "var(--destructive)",
                        }}
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

        {/* ── Plan tab: upload a plan, switch plans, see past ones ─────────── */}
        <TabsContent value="plan">
          {client.programAssignments.length === 0 ? (
            <Card className="mb-4">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold">Upload plan</CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                <SheetPlanUpload clientId={client.id} firstName={firstName} />
              </CardContent>
            </Card>
          ) : (
            <details className="group mb-4 rounded-xl border bg-card">
              <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-3 text-sm font-medium">
                Upload a new plan
                <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform group-open:rotate-180" />
              </summary>
              <div className="border-t px-4 pb-4 pt-3">
                <SheetPlanUpload clientId={client.id} firstName={firstName} />
              </div>
            </details>
          )}

          <div className="mb-3 flex justify-end">
            <Link href={`/programs/new?client=${client.id}`} className={cn(buttonVariants({ size: "sm", variant: "outline" }))}>
              <Dumbbell className="w-3 h-3 mr-1.5" />
              Build with Atlas
            </Link>
          </div>
          {client.programAssignments.length > 0 && (
            <div className="space-y-2">
              {client.programAssignments.map((a) => (
                <Link key={a.id} href={`/clients/${client.id}/programs/${a.id}`}>
                  <Card className="hover:border-primary/40 transition-colors cursor-pointer">
                    <CardContent className="py-3 px-4 flex items-center justify-between">
                      <div>
                        <p className="text-sm font-semibold">{a.name}</p>
                        <p className="text-xs text-muted-foreground">Started {new Date(a.startDate).toLocaleDateString()}</p>
                      </div>
                      <Badge
                        variant="outline"
                        className={cn(
                          "text-xs capitalize",
                          a.status === "ACTIVE" && "border-signal/30 text-signal",
                          a.status === "PAUSED" && "border-line text-ink-soft"
                        )}
                      >
                        {a.status === "PAUSED" ? "draft" : a.status === "ACTIVE" ? "live" : a.status.toLowerCase()}
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
            <p className="text-sm text-muted-foreground">{client.workoutLogs.length} sessions</p>
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
                <Link key={s.id} href={`/clients/${client.id}/sessions/${s.id}`} className="block">
                  <Card className="hover:bg-muted/40 transition-colors cursor-pointer">
                    <CardContent className="py-3 px-4">
                      <div className="flex items-center justify-between mb-1">
                        <p className="text-sm font-semibold">
                          {localDate(s.date).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" })}
                        </p>
                        <div className="flex items-center gap-2">
                          {s.durationMin != null && (
                            <span className="text-xs font-mono text-muted-foreground">{s.durationMin} min</span>
                          )}
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-muted-foreground hover:text-destructive"
                            onClick={(e) => deleteWorkoutLog(s.id, e)}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {s._count.sets} sets
                      </p>
                      {s.clientNotes && (
                        <p className="text-xs text-muted-foreground mt-1 line-clamp-2 italic">{s.clientNotes}</p>
                      )}
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          )}
        </TabsContent>

        {/* ── Files tab ─────────────────────────────────────────────────── */}
        <TabsContent value="files">
          <div className="flex justify-between items-center mb-3">
            <p className="text-sm text-muted-foreground">{intakes.length} files</p>
            <Link href={`/intake?clientId=${client.id}`} className={cn(buttonVariants({ size: "sm" }))}>
              <FileText className="w-3 h-3 mr-1.5" />
              New Intake
            </Link>
          </div>
          {intakes.length === 0 ? (
            <Card className="border-dashed">
              <CardContent className="py-10 text-center">
                <FileText className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
                <p className="text-sm font-medium">No files yet</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2">
              {intakes.map((f) => (
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

