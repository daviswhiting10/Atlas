"use client";

import { emailTypo } from "@/lib/email-typos";
import { useEffect, useRef, useState } from "react";
import { useContentFade } from "@/hooks/use-content-fade";
import Link from "next/link";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { NO_CONNECTION, createdSince } from "@/lib/net/guard";
import { MoreHorizontal, Plus, Search, Upload, Users } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { lastLogged } from "@/lib/coach/last-logged";
import { SwipeRow } from "@/components/coach/SwipeRow";
import { DeleteClientSheet, type DeletePreview } from "@/components/coach/DeleteClientSheet";

type Client = {
  id: string;
  fullName: string;
  email: string | null;
  phone: string | null;
  /** Set once she has a login of her own. */
  userId?: string | null;
  status: "PROSPECT" | "ACTIVE" | "AT_RISK" | "CHURNED";
  primaryGoal: string | null;
  retentionScore: number | null;
  updatedAt: string;
  _count: { sessionNotes: number; programAssignments: number; workoutLogs?: number };
  /** The latest finished session (at most one). */
  workoutLogs?: Array<{ date: string }>;
  /** Workouts done of those planned in her plan's current week. */
  thisWeek?: { done: number; planned: number } | null;
};

const GOAL_LABELS: Record<string, string> = {
  weight_loss: "Weight Loss",
  hypertrophy: "Hypertrophy",
  pain_mgmt: "Pain Management",
  performance: "Performance",
  general: "General Fitness",
};

const sel = (setter: (v: string) => void) => (v: string | null) => { if (v) setter(v); };

export default function ClientsPage() {
  const [clients, setClients] = useState<Client[]>([]);
  const [search, setSearch] = useState("");
  // Swipe left on a row: Delete. One row open at a time; the sheet says exactly what goes.
  const [openRow, setOpenRow] = useState<string | null>(null);
  const [toDelete, setToDelete] = useState<(DeletePreview & { id: string }) | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const phase = useContentFade(loading);

  const [form, setForm] = useState({
    fullName: "",
    email: "",
    phone: "",
    primaryGoal: "",
    status: "PROSPECT",
  });

  useEffect(() => {
    fetch("/api/clients")
      .then((r) => r.json())
      .then((data) => setClients(Array.isArray(data) ? data : []))
      .finally(() => setLoading(false));
  }, []);

  // Search only: with a roster this size a status filter is one more control than it's worth.
  // Deleting a client lives in the client page's ⋯ menu, not on every row.
  const filtered = clients.filter(
    (c) => c.fullName.toLowerCase().includes(search.toLowerCase()) || (c.email ?? "").toLowerCase().includes(search.toLowerCase())
  );

  async function askDelete(id: string) {
    const res = await fetch(`/api/clients/${id}/erase`);
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast.error(body?.error ?? "Can't delete this client");
      setOpenRow(null);
      return;
    }
    setToDelete({ id, ...(body as DeletePreview) });
  }

  async function confirmDelete() {
    if (!toDelete) return;
    const res = await fetch(`/api/clients/${toDelete.id}/erase`, { method: "POST" });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast.error(body?.error ?? "Couldn't delete");
      return;
    }
    setClients((prev) => prev.filter((c) => c.id !== toDelete.id));
    toast.success(`${toDelete.name} deleted`);
    setToDelete(null);
    setOpenRow(null);
  }

  // When the first try of "Add" left the phone and no answer came back, the client may exist already: before trying
  // again, look for her (same name and email, made since that try) instead of adding a second copy.
  const firstTry = useRef<number | null>(null);
  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    let newClient;
    try {
      if (firstTry.current != null) {
        const list = (await (await fetch("/api/clients")).json()) as Array<{ id: string; fullName: string; email?: string | null; createdAt: string }>;
        newClient = createdSince(list, form, firstTry.current) ?? undefined;
      }
      if (!newClient) {
        firstTry.current ??= Date.now();
        const res = await fetch("/api/clients", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(form),
        });
        if (!res.ok) { firstTry.current = null; const err = await res.json().catch(() => ({})); toast.error(`Failed to create client (${res.status}): ${err?.error ?? "unknown"}`); return; }
        newClient = await res.json();
      }
    } catch {
      // No connection (or no answer). What she typed stays in the form.
      toast.error(NO_CONNECTION);
      return;
    }
    firstTry.current = null;
    setClients((prev) => (prev.some((c) => c.id === newClient.id) ? prev : [newClient, ...prev]));
    setDialogOpen(false);
    setForm({ fullName: "", email: "", phone: "", primaryGoal: "", status: "PROSPECT" });
    toast.success(`${newClient.fullName} added`);
  }

  return (
    <div className="">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-4xl leading-none text-ink">
            Clients
          </h1>
          <p className="mt-2 max-w-xl text-[15px] leading-relaxed text-ink-soft">
            {clients.length} total · {clients.filter((c) => c.status === "ACTIVE").length} active
          </p>
        </div>
        <div className="flex items-center gap-2">
        <Link href="/clients/import" className={buttonVariants({ variant: "outline" })}>
          <Upload className="w-4 h-4 mr-1.5" />
          Import
        </Link>
        <Dialog open={dialogOpen} onOpenChange={(o) => { setDialogOpen(o); if (!o) firstTry.current = null; }}>
          <DialogTrigger>
            <span className={buttonVariants()}>
              <Plus className="w-4 h-4 mr-1.5" />
              Add Client
            </span>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>New Client</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleCreate} className="space-y-4 mt-2">
              <div className="space-y-1.5">
                <Label>Full Name *</Label>
                <Input
                  required
                  value={form.fullName}
                  onChange={(e) => setForm({ ...form, fullName: e.target.value })}
                  placeholder="Jane Smith"
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Email</Label>
                  <Input
                    type="email"
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                    placeholder="jane@email.com"
                  />
                  {/* A slip like ".con" locks her out later (she signs in with this address): one tap to fix it. */}
                  {emailTypo(form.email) && (
                    <button type="button" onClick={() => setForm({ ...form, email: emailTypo(form.email)! })} className="press inline-flex min-h-11 items-center text-sm font-medium text-ink-soft underline underline-offset-4 hover:text-ink">
                      Did you mean {emailTypo(form.email)}?
                    </button>
                  )}
                </div>
                <div className="space-y-1.5">
                  <Label>Phone</Label>
                  <Input
                    value={form.phone}
                    onChange={(e) => setForm({ ...form, phone: e.target.value })}
                    placeholder="(443) 555-0100"
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Primary Goal</Label>
                  <Select value={form.primaryGoal} onValueChange={sel((v) => setForm((f) => ({ ...f, primaryGoal: v })))}>
                    <SelectTrigger><SelectValue placeholder="Select goal" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="weight_loss">Weight Loss</SelectItem>
                      <SelectItem value="hypertrophy">Hypertrophy</SelectItem>
                      <SelectItem value="pain_mgmt">Pain Management</SelectItem>
                      <SelectItem value="performance">Performance</SelectItem>
                      <SelectItem value="general">General Fitness</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Status</Label>
                  <Select value={form.status} onValueChange={sel((v) => setForm((f) => ({ ...f, status: v })))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="PROSPECT">Prospect</SelectItem>
                      <SelectItem value="ACTIVE">Active</SelectItem>
                      <SelectItem value="AT_RISK">At Risk</SelectItem>
                      <SelectItem value="CHURNED">Churned</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
                <Button type="submit">Add Client</Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-3 mb-6">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search clients..."
            className="pl-8 min-h-[44px]"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      <div className="relative">
        {phase !== "done" && (
          <div
            className={"space-y-2" + (phase === "fading" ? " absolute inset-0 pointer-events-none opacity-0" : "")}
            aria-hidden={phase === "fading"}
          >
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-16 rounded-lg bg-muted animate-pulse" />
            ))}
          </div>
        )}
        {phase !== "loading" && (
          <div className={phase === "fading" ? "animate-in fade-in-0 duration-200 ease-out" : undefined}>
            {filtered.length === 0 ? (
              <Card className="border-dashed">
                <CardContent className="py-16 flex flex-col items-center text-center">
                  <Users className="w-10 h-10 text-muted-foreground mb-3" />
                  <p className="font-medium">{clients.length === 0 ? "No clients yet" : "No clients found"}</p>
                  <p className="mt-2 max-w-xl text-[15px] leading-relaxed text-ink-soft">
                    {clients.length > 0
                      ? "Try a different name"
                      : "Have a client list in a spreadsheet? Bring it over in one go, or add clients one at a time above."}
                  </p>
                  {clients.length === 0 && (
                    <Link href="/clients/import" className={cn(buttonVariants(), "mt-5")}>
                      <Upload className="w-4 h-4 mr-1.5" />
                      Import your clients
                    </Link>
                  )}
                </CardContent>
              </Card>
            ) : (
              <Card>
                <div className="divide-y divide-border">
                  {filtered.map((client) => (
                    <SwipeRow key={client.id} open={openRow === client.id} onOpenChange={(o) => setOpenRow(o ? client.id : null)} onDelete={() => void askDelete(client.id)}>
                    <div className="group flex items-center hover:bg-muted/40 transition-colors">
                    <Link
                      href={`/clients/${client.id}`}
                      draggable={false}
                      className="flex min-w-0 flex-1 items-center justify-between gap-3 py-4 px-5 min-h-[60px] active:bg-muted/60"
                    >
                      <div className="flex min-w-0 items-center gap-3">
                        <div className="w-9 h-9 shrink-0 rounded-full bg-primary/10 flex items-center justify-center text-sm font-semibold text-primary">
                          {client.fullName.charAt(0)}
                        </div>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold">{client.fullName}</p>
                          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                            {client.userId && <span className="shrink-0 rounded-full border border-line-strong px-1.5 py-px text-[10px] font-medium text-ink-soft">Logs own</span>}
                            <span className="truncate">{[client.email, client.primaryGoal ? (GOAL_LABELS[client.primaryGoal] ?? client.primaryGoal) : null].filter(Boolean).join(" · ")}</span>
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        {/* When she last logged ("Logged today" in teal) and the plan week so far (3/4), on a phone too. */}
                        {(() => {
                          const last = lastLogged(client.workoutLogs?.[0]?.date);
                          if (!last && !client.thisWeek) return null;
                          return (
                            <div className="flex shrink-0 flex-col items-end gap-0.5 whitespace-nowrap">
                              {last && <p className={cn("text-xs", last.today ? "font-semibold text-primary" : "text-muted-foreground")}>{last.label}</p>}
                              {client.thisWeek && (
                                <p className="text-sm font-semibold tabular-nums" title="Workouts done this week of those planned">
                                  {client.thisWeek.done}/{client.thisWeek.planned}
                                </p>
                              )}
                            </div>
                          );
                        })()}
                        <div className="text-right hidden sm:block">
                          {client.retentionScore != null && (
                            <p className="text-xs font-mono text-muted-foreground">
                              Retention: {client.retentionScore}/100
                            </p>
                          )}
                        </div>
                      </div>
                    </Link>
{/* Desktop: the same Delete as the swipe (same sheet that says what goes). A phone keeps the swipe. */}
                    <DropdownMenu>
                      <DropdownMenuTrigger aria-label={`More for ${client.fullName}`} className="press mr-3 hidden h-11 w-11 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-muted md:flex">
                        <MoreHorizontal className="h-5 w-5" />
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="min-w-[180px]">
                        <DropdownMenuItem className="min-h-11 text-destructive" onClick={() => void askDelete(client.id)}>
                          Delete client
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                    </div>
                    </SwipeRow>
                  ))}
                </div>
              </Card>
            )}
          </div>
        )}
      </div>
      {toDelete && <DeleteClientSheet preview={toDelete} onDelete={confirmDelete} onClose={() => { setToDelete(null); setOpenRow(null); }} />}
    </div>
  );
}
