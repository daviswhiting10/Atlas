"use client";

import { useEffect, useState } from "react";
import { useContentFade } from "@/hooks/use-content-fade";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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
import { deletePlan } from "@/lib/actions/coach-plan";
import { categoryLabel } from "@/lib/programs/categories";
import {
  ArrowLeft,
  Dumbbell,
  ClipboardList,
  AlertTriangle,
  Trash2,
  UserCheck,
  ChevronDown,
  CalendarDays,
  MoreHorizontal,
  Plus,
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
    source: "PLAN" | "GENERATED" | "MANUAL" | "SCREENSHOT" | "OFF_PLAN";
    title: string | null;
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
type View = "progress" | "records" | "sessions" | "plan" | "notes";

export function ClientDetail({ progress, records }: { progress: React.ReactNode; records: React.ReactNode }) {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [client, setClient] = useState<Client | null>(null);
  const [loading, setLoading] = useState(true);
  const [invite, setInvite] = useState<InviteResult | null>(null);
  // ?tab=plan opens the Plan view (the log page links there when there's no plan);
  // ?tab=sessions opens Sessions (after logging a workout).
  const [view, setView] = useState<View>(() => {
    const tab = typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("tab") : null;
    return tab === "plan" || tab === "sessions" ? tab : "progress";
  });
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

  async function removePlan(a: ProgramAssignment, e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    const first = client?.fullName.split(" ")[0] ?? "Their";
    const ask =
      a.status === "PAUSED"
        ? `Delete the draft "${a.name}"?`
        : `Delete "${a.name}"? Sessions already logged stay in ${first}'s history. This can't be undone.`;
    if (!confirm(ask)) return;
    const res = await deletePlan({ clientId: id, assignmentId: a.id });
    if (!res.ok) return void toast.error(res.error);
    setClient((prev) => (prev ? { ...prev, programAssignments: prev.programAssignments.filter((p) => p.id !== a.id) } : null));
    toast.success("Plan deleted");
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
  const views: Array<{ id: View; label: string }> = [
    { id: "progress", label: "Progress" },
    { id: "records", label: "Records" },
    { id: "sessions", label: "Sessions" },
    { id: "plan", label: "Plan" },
    // Intake and imported details, only when there are some.
    ...(intakes.length > 0 || imported.length > 0 ? [{ id: "notes" as const, label: "Notes" }] : []),
  ];

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

      {invite && <InviteSheet name={client.fullName} invite={invite} onClose={() => setInvite(null)} />}

      {/* ── Log first; everything else one tap away ─────────────────────── */}
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center">
        <Link
          href={`/clients/${client.id}/log`}
          className="press flex h-14 items-center justify-center gap-2.5 rounded-2xl bg-ink px-8 text-lg font-semibold text-white hover:bg-ink/85 sm:min-w-[260px]"
        >
          <ClipboardList className="h-5 w-5" />
          Log session
        </Link>
        <Link
          href={`/clients/${client.id}/log-workout`}
          className="press flex h-14 items-center justify-center gap-2 rounded-2xl border border-line bg-white px-6 text-[15px] font-semibold text-ink hover:border-ink/25"
        >
          <Plus className="h-4 w-4" />
          Log a workout
        </Link>
        <div role="tablist" className="flex gap-1 overflow-x-auto rounded-2xl bg-ink/5 p-1">
          {views.map((v) => (
            <button
              key={v.id}
              type="button"
              role="tab"
              aria-selected={view === v.id}
              onClick={() => setView(v.id)}
              className={cn(
                "press h-12 shrink-0 rounded-xl px-4 text-sm font-medium transition-colors",
                view === v.id ? "bg-white text-ink shadow-sm" : "text-ink-soft hover:text-ink"
              )}
            >
              {v.label}
            </button>
          ))}
        </div>
      </div>

      {view === "progress" && (
        <div className="fade-in">
          <StatRow
            className="mb-8"
            stats={[
              { label: "Sessions", value: String(client.workoutLogs.length), hint: "logged in total" },
              { label: "This week", value: String(sessionsThisWeek), hint: sessionsThisWeek === 1 ? "session" : "sessions" },
              { label: "Last session", value: lastSession ? relativeTime(lastSession.date) : "—", hint: lastSession ? localDate(lastSession.date).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "None yet" },
            ]}
          />
          <section>{progress}</section>
        </div>
      )}

      {view === "records" && <div className="fade-in">{records}</div>}

      {view === "sessions" && (
        <div className="fade-in">
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
                        {s.source === "OFF_PLAN" && (
                          <span className="mr-1.5 rounded-full bg-ink/5 px-2 py-0.5 text-[11px] font-semibold text-ink-soft">Off-plan</span>
                        )}
                        {s.title ? `${s.title} · ` : ""}
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
        </div>
      )}

      {view === "plan" && (
        <div className="fade-in">
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
                      <div className="min-w-0 flex-1">
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
                      <button
                        type="button"
                        onClick={(e) => removePlan(a, e)}
                        aria-label={`Delete ${a.name}`}
                        title="Delete plan"
                        className="press ml-2 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-ink-mute hover:bg-destructive/10 hover:text-destructive"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          )}
        </div>
      )}

      {view === "notes" && (
        <div className="fade-in max-w-2xl space-y-4">
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
        </div>
      )}
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

