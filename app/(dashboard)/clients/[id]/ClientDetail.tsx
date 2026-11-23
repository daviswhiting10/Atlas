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
import { InviteSheet, type InviteResult } from "@/components/coach/InviteSheet";
import { InviteConfirm } from "@/components/coach/InviteConfirm";
import { DeleteClientSheet, type DeletePreview } from "@/components/coach/DeleteClientSheet";
import { shareInvite } from "@/lib/coach/invite-share";
import type { LoginStatus } from "@/lib/coach/login-status";
import { PlanStart } from "@/components/coach/PlanStart";
import { SheetPlanUpload } from "@/components/coach/SheetPlanUpload";
import { initialDoor } from "@/lib/plan-start";
import { deletePlan } from "@/lib/actions/coach-plan";
import { categoryLabel } from "@/lib/programs/categories";
import { FINISHED_BY_CLIENT, finishedByClient } from "@/lib/coach/finished-by";
import {
  ClipboardList,
  AlertTriangle,
  Trash2,
  UserCheck,
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
    completedAt?: string | null;
    assignedWorkout: {
      name?: string;
      loggedBy?: "TRAINER" | "CLIENT";
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



// Parse a date string (YYYY-MM-DD or ISO) as local time to avoid UTC-offset day shift
function localDate(dateStr: string): Date {
  // Append T12:00:00 so bare date strings don't shift to the previous day in western timezones
  const s = dateStr.slice(0, 10);
  return new Date(`${s}T12:00:00`);
}



/**
 * The client page. `progress` is rendered on the server (the client's lift
 * charts, the same screen they see) and shown above the tabs.
 */
type View = "progress" | "sessions" | "plan" | "notes";

export function ClientDetail({ week, progress, history, report, latest, access, initial }: { /** Invited, opened, password set: where the client is with the app. */ access?: LoginStatus | null; /** A row that opens the latest progress report (nothing until a block has finished). */ report?: React.ReactNode; /** The latest finished session, judged against the plan (nothing until she has finished one). */ latest?: React.ReactNode; /** The week so far and the main lifts, shown above the progress charts on the first tab (null: nothing to show yet). */ week?: React.ReactNode; /** null: nothing to chart yet. */ progress: React.ReactNode; /** The History calendar, on top of Sessions. */ history?: React.ReactNode; /** The client, loaded with the page. */ initial?: unknown }) {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [client, setClient] = useState<Client | null>(() => (initial as Client | undefined) ?? null);
  const [loading, setLoading] = useState(initial == null);
  const [invite, setInvite] = useState<InviteResult | null>(null);
  /** The "Sending to … — is that right?" step, before any link is made. */
  const [confirmInvite, setConfirmInvite] = useState(false);
  /** ⋯ Delete client: what would go, shown before anything is deleted. */
  const [toDelete, setToDelete] = useState<DeletePreview | null>(null);
  // ?tab=plan opens the Plan view (the log page links there when there's no plan);
  // ?tab=sessions opens Sessions (after logging a workout); ?tab=import opens Plan with the importer open.
  const [view, setView] = useState<View>(() => {
    const tab = typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("tab") : null;
    if (tab === "import" || tab === "build") return "plan";
    return tab === "plan" || tab === "sessions" ? tab : progress || week ? "progress" : "sessions";
  });
  // ?tab=import and ?tab=build open their row on the Plan tab (components/coach/PlanStart).
  const startDoor = initialDoor(typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("tab") : null);
  const phase = useContentFade(loading);

  useEffect(() => {
    // Loaded with the page: no second round trip.
    if (initial != null) return;
    fetch(`/api/clients/${id}`)
      .then((r) => {
        if (!r.ok) throw new Error(String(r.status));
        return r.json();
      })
      .then(setClient)
      .catch(() => setClient(null))
      .finally(() => setLoading(false));
  }, [id, initial]);

  /** A corrected email: her record, and her login if she has one, change together (or it's refused). */
  async function saveEmail(email: string): Promise<string | null> {
    const res = await fetch(`/api/clients/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email }) });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) return typeof body?.error === "string" ? body.error : "Couldn't save that email.";
    setClient((prev) => (prev ? { ...prev, email: body.email ?? email } : prev));
    return null;
  }

  async function inviteClient() {
    if (!client?.email) { toast.error("Add an email first"); return; }
    const res = await fetch(`/api/clients/${id}/invite`, { method: "POST" });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      toast.error(err?.error ?? "Invite failed");
      return;
    }
    // One tap: the link goes straight to the phone's share sheet. Without one (or if the browser
    // won't open it), the sheet with the link and Copy opens instead.
    const result = (await res.json()) as InviteResult;
    const outcome = await shareInvite(result, client.fullName.split(" ")[0]);
    if (outcome === "unavailable") setInvite(result);
  }

  /** ⋯ Delete client: the same sheet as the roster's swipe (exactly what goes, then a red Delete). */
  async function askDelete() {
    const res = await fetch(`/api/clients/${id}/erase`);
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast.error(body?.error ?? "Can't delete this client");
      return;
    }
    setToDelete(body as DeletePreview);
  }

  async function confirmDelete() {
    const res = await fetch(`/api/clients/${id}/erase`, { method: "POST" });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast.error(body?.error ?? "Couldn't delete");
      return;
    }
    toast.success(`${client?.fullName ?? "Client"} deleted`);
    router.push("/clients");
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
  // Spreadsheet details from an import are shown on their own, never as an intake.
  const intakes = client.intakeForms.filter((f) => f.sourceType !== "csv-import");
  const imported = client.intakeForms.filter((f) => f.sourceType === "csv-import");
  const redFlags = intakes[0]?.redFlags ?? null;
  // Progress open but nothing to chart any more (sessions deleted): show Sessions, not a blank tab.
  const shown: View = view === "progress" && !progress && !week ? "sessions" : view;
  // No plan yet and nothing logged: the page leads with Create a plan.
  const noPlanNoSessions = client.programAssignments.length === 0 && client.workoutLogs.length === 0;
  const views: Array<{ id: View; label: string }> = [
    ...(progress || week ? [{ id: "progress" as const, label: "Week" }] : []),
    { id: "sessions", label: "Sessions" },
    { id: "plan", label: "Plan" },
    // Intake and imported details, only when there are some.
    ...(intakes.length > 0 || imported.length > 0 ? [{ id: "notes" as const, label: "Notes" }] : []),
  ];

  return (
    <div className={cn("pb-12", phase === "fading" && "animate-in fade-in-0 duration-200 ease-out")}>
      {/* ── Header: the name, and ⋯ for everything that isn't logging ──────── */}
      <div className="mb-6 flex items-center justify-between gap-3">
        <h1 className="min-w-0 text-[34px] font-semibold leading-[1.05] tracking-[-0.03em] text-ink [overflow-wrap:anywhere]">{client.fullName}</h1>
        <DropdownMenu>
          <DropdownMenuTrigger aria-label={`More for ${client.fullName}`} className="press inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-line-strong text-ink-soft hover:text-ink">
            <MoreHorizontal className="h-5 w-5" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-[200px]">
            <DropdownMenuItem onClick={() => router.push(`/clients/${client.id}/log-workout`)}>
              <Plus className="mr-2 h-3.5 w-3.5" />
              Log a workout
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setConfirmInvite(true)}>
              <UserCheck className="mr-2 h-3.5 w-3.5" />
              {client.userId ? "New sign-in link" : "Invite to the app"}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => void askDelete()} className="text-destructive focus:text-destructive">
              <Trash2 className="mr-2 h-3.5 w-3.5" />
              Delete client
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Where they are with the app, and the way to a fresh link at any time (reset emails may not reach them) */}
      {access && (
        <p className="-mt-3 mb-5 flex flex-wrap items-center gap-x-3 text-[13px] text-ink-soft">
          <span data-testid="login-status">{access.label}</span>
          {/* A fresh link at any time, even after a password is set: reset emails may not reach them */}
          <button type="button" onClick={() => setConfirmInvite(true)} className="press inline-flex min-h-11 items-center font-medium text-ink underline underline-offset-2">
            {access.key === "not_invited" ? "Invite" : "New link"}
          </button>
        </p>
      )}

      {/* Retention flag banner */}
      {client.retentionFlag && (
        <div className="mb-4 px-4 py-2.5 rounded-lg border border-warn/30 bg-warn/10 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 text-warn mt-0.5 shrink-0" />
          <p className="text-sm text-warn">{client.retentionFlag}</p>
        </div>
      )}

      {confirmInvite && <InviteConfirm email={client.email} onConfirm={inviteClient} onSaveEmail={saveEmail} onClose={() => setConfirmInvite(false)} />}
      {toDelete && <DeleteClientSheet preview={toDelete} onDelete={confirmDelete} onClose={() => setToDelete(null)} />}
      {invite && <InviteSheet name={client.fullName} invite={invite} onClose={() => setInvite(null)} />}

      {/* ── The one action ──────────────────────────────────────────────── */}
      {noPlanNoSessions ? (
        // A client with no plan and no sessions: the page leads with making a plan (drop a file, or tap to choose one);
        // logging is a quieter link under it. Once there is a plan or a session, the layout below is the usual one.
        <section className="mb-8" aria-label="Create a plan">
          <h2 className="text-[22px] font-semibold tracking-[-0.02em] text-ink">Create a plan</h2>
          <div className="mt-3 max-w-xl">
            <SheetPlanUpload clientId={client.id} firstName={client.fullName.split(" ")[0]} />
          </div>
          <Link href={`/clients/${client.id}/log`} className="press mt-3 inline-flex min-h-11 items-center text-[15px] font-medium text-ink-soft hover:text-ink">
            Log session
          </Link>
        </section>
      ) : (
        <Link
          href={`/clients/${client.id}/log`}
          className="press mb-8 flex h-14 w-full items-center justify-center rounded-2xl bg-dusk-button text-[17px] font-semibold text-dusk-button-text hover:bg-dusk-button/85 sm:max-w-sm"
        >
          Log session
        </Link>
      )}
      {report && <div className="-mt-3 mb-8">{report}</div>}
      {latest}
      <div className="mb-12">
        <div role="tablist" className="flex w-full max-w-md gap-1 overflow-x-auto rounded-2xl bg-ink/5 p-1">
          {views.map((v) => (
            <button
              key={v.id}
              type="button"
              role="tab"
              aria-selected={shown === v.id}
              onClick={() => setView(v.id)}
              className={cn(
                "press h-11 flex-1 shrink-0 rounded-xl px-4 text-[15px] font-medium transition-colors",
                shown === v.id ? "bg-dusk-selected text-dusk-selected-text shadow-sm" : "text-ink-soft hover:text-ink"
              )}
            >
              {v.label}
            </button>
          ))}
        </div>
      </div>

      {shown === "progress" && (
        <div className="fade-in space-y-10">
          {week}
          {progress}
        </div>
      )}


      {shown === "sessions" && (
        <div className="fade-in space-y-10">
          {history}
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
                        {finishedByClient({ loggedBy: s.assignedWorkout?.loggedBy, completedAt: s.completedAt }) && (
                          <span className="mr-1.5 rounded-full bg-ink/5 px-2 py-0.5 text-[11px] font-semibold text-ink-soft">{FINISHED_BY_CLIENT}</span>
                        )}
                        {/* No "0 sets": a session with none shows its name (its minutes are on the right), or nothing. */}
                        {[s.title ?? s.assignedWorkout?.name, s._count.sets > 0 ? `${s._count.sets} set${s._count.sets === 1 ? "" : "s"}` : null].filter(Boolean).join(" · ")}
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

      {shown === "plan" && (
        <div className="fade-in">
          <PlanStart client={{ id: client.id, fullName: client.fullName, primaryGoal: client.primaryGoal }} initialDoor={startDoor} />
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

      {shown === "notes" && (
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

