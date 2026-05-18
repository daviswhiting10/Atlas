"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { StatusBadge } from "@/components/status-badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  ArrowLeft,
  Mail,
  Phone,
  Dumbbell,
  ClipboardList,
  FileText,
  MessageSquare,
  AlertTriangle,
  Trash2,
  UserCheck,
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
  intakeForms: Array<{ id: string; aiSummary: string | null; createdAt: string; redFlags: Array<{ issue: string; severity: string; recommendedAction: string }> | null }>;
  outreachLog: Array<{ id: string; purpose: string; channel: string; createdAt: string; sentAt: string | null }>;
};

const GOAL_LABELS: Record<string, string> = {
  weight_loss: "Weight Loss",
  hypertrophy: "Hypertrophy",
  pain_mgmt: "Pain Management",
  performance: "Performance",
  general: "General Fitness",
};

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

  async function updateStatus(status: string | null) {
    if (!status) return;
    const res = await fetch(`/api/clients/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    if (res.ok) {
      const updated = await res.json();
      setClient((prev) => prev ? { ...prev, status: updated.status } : null);
      toast.success("Status updated");
    }
  }

  async function inviteClient() {
    if (!client?.email) { toast.error("Add an email to this client first"); return; }
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
      <div className="p-8 max-w-4xl">
        <div className="h-8 w-48 bg-muted rounded animate-pulse mb-6" />
        <div className="h-32 bg-muted rounded-lg animate-pulse" />
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

  const redFlags = client.intakeForms[0]?.redFlags ?? null;

  return (
    <div className="p-8 max-w-4xl">
      {/* Back */}
      <Link href="/clients" className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "mb-4 -ml-2")}>
        <ArrowLeft className="w-4 h-4 mr-1" />
        Clients
      </Link>

      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center text-xl font-bold text-primary">
            {client.fullName.charAt(0)}
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">{client.fullName}</h1>
            <div className="flex items-center gap-3 mt-1">
              <StatusBadge status={client.status} />
              {client.primaryGoal && (
                <span className="text-sm text-muted-foreground">
                  {GOAL_LABELS[client.primaryGoal] ?? client.primaryGoal}
                </span>
              )}
              {client.retentionScore != null && (
                <span className="text-xs font-mono text-muted-foreground">
                  Retention {client.retentionScore}/100
                </span>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Select value={client.status} onValueChange={updateStatus}>
            <SelectTrigger className="w-32 h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="PROSPECT">Prospect</SelectItem>
              <SelectItem value="ACTIVE">Active</SelectItem>
              <SelectItem value="AT_RISK">At Risk</SelectItem>
              <SelectItem value="CHURNED">Churned</SelectItem>
            </SelectContent>
          </Select>
          <Link
            href={`/outreach?clientId=${client.id}`}
            className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
          >
            <MessageSquare className="w-3 h-3 mr-1" />
            Message
          </Link>
          <Button variant="outline" size="sm" onClick={inviteClient}>
            <UserCheck className="w-3 h-3 mr-1" />
            Invite to Atlas
          </Button>
          <Button variant="ghost" size="sm" onClick={deleteClient} className="text-destructive hover:text-destructive">
            <Trash2 className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Contact info */}
      <div className="flex gap-4 mb-6">
        {client.email && (
          <a href={`mailto:${client.email}`} className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
            <Mail className="w-3.5 h-3.5" />
            {client.email}
          </a>
        )}
        {client.phone && (
          <a href={`tel:${client.phone}`} className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
            <Phone className="w-3.5 h-3.5" />
            {client.phone}
          </a>
        )}
        <span className="text-xs text-muted-foreground ml-auto">
          Added {new Date(client.createdAt).toLocaleDateString()}
        </span>
      </div>

      {/* Retention flag */}
      {client.retentionFlag && (
        <Card className="mb-6 border-amber-200 bg-amber-50/50">
          <CardContent className="py-3 px-4 flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
            <p className="text-sm text-amber-800">{client.retentionFlag}</p>
          </CardContent>
        </Card>
      )}

      {/* Tabs */}
      <Tabs defaultValue="overview">
        <TabsList className="mb-4">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="programs">
            Programs
            {client.programAssignments.length > 0 && (
              <Badge variant="secondary" className="ml-1.5 text-xs h-4 px-1">
                {client.programAssignments.length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="sessions">
            Sessions
            {client.sessionNotes.length > 0 && (
              <Badge variant="secondary" className="ml-1.5 text-xs h-4 px-1">
                {client.sessionNotes.length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="files">Files</TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          {client.intakeForms[0]?.aiSummary ? (
            <Card className="mb-4">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold">AI Intake Summary</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  {client.intakeForms[0].aiSummary}
                </p>
              </CardContent>
            </Card>
          ) : (
            <Card className="mb-4 border-dashed">
              <CardContent className="py-8 flex flex-col items-center text-center">
                <FileText className="w-8 h-8 text-muted-foreground mb-2" />
                <p className="text-sm font-medium">No intake form yet</p>
                <p className="text-xs text-muted-foreground mt-1 mb-3">
                  Complete the intake to unlock AI summaries and red-flag detection
                </p>
                <Link href={`/intake?clientId=${client.id}`} className={buttonVariants({ size: "sm" })}>
                  Start Intake
                </Link>
              </CardContent>
            </Card>
          )}

          {redFlags && redFlags.length > 0 && (
            <Card className="border-red-200 bg-red-50/50">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold text-red-700 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4" />
                  Red Flags Detected
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {redFlags.map((flag: { issue: string; severity: string; recommendedAction: string }, i: number) => (
                  <div key={i} className="p-3 bg-white rounded border border-red-100">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-medium text-red-800">{flag.issue}</span>
                      <Badge variant="outline" className={
                        flag.severity === "high" ? "border-red-300 text-red-700" :
                        flag.severity === "medium" ? "border-amber-300 text-amber-700" :
                        "border-zinc-300 text-zinc-600"
                      }>
                        {flag.severity}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">{flag.recommendedAction}</p>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </TabsContent>

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

        <TabsContent value="sessions">
          <div className="flex justify-between items-center mb-3">
            <p className="text-sm text-muted-foreground">{client.sessionNotes.length} sessions</p>
            <Link href={`/sessions?clientId=${client.id}`} className={cn(buttonVariants({ size: "sm" }))}>
              <ClipboardList className="w-3 h-3 mr-1.5" />
              Log Session
            </Link>
          </div>
          {client.sessionNotes.length === 0 ? (
            <Card className="border-dashed">
              <CardContent className="py-10 text-center">
                <ClipboardList className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
                <p className="text-sm font-medium">No sessions logged</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2">
              {client.sessionNotes.map((s) => (
                <Card key={s.id}>
                  <CardContent className="py-3 px-4">
                    <div className="flex items-center justify-between mb-1">
                      <p className="text-sm font-semibold">
                        {new Date(s.date).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}
                      </p>
                      {s.rpeAvg && <span className="text-xs font-mono text-muted-foreground">RPE {s.rpeAvg.toFixed(1)}</span>}
                    </div>
                    <p className="text-xs text-muted-foreground line-clamp-2">{s.rawInput}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

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
      </Tabs>
    </div>
  );
}
