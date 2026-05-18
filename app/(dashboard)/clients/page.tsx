"use client";

import { useEffect, useState } from "react";
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
import { StatusBadge } from "@/components/status-badge";
import { toast } from "sonner";
import { Plus, Search, Users } from "lucide-react";

type Client = {
  id: string;
  fullName: string;
  email: string | null;
  phone: string | null;
  status: "PROSPECT" | "ACTIVE" | "AT_RISK" | "CHURNED";
  primaryGoal: string | null;
  retentionScore: number | null;
  updatedAt: string;
  _count: { sessionNotes: number; programAssignments: number };
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
  const [filterStatus, setFilterStatus] = useState("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [loading, setLoading] = useState(true);

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

  const filtered = clients.filter((c) => {
    const matchesSearch =
      c.fullName.toLowerCase().includes(search.toLowerCase()) ||
      (c.email ?? "").toLowerCase().includes(search.toLowerCase());
    const matchesStatus = filterStatus === "all" || c.status === filterStatus;
    return matchesSearch && matchesStatus;
  });

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    const res = await fetch("/api/clients", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    if (!res.ok) { const err = await res.json().catch(() => ({})); toast.error(`Failed to create client (${res.status}): ${err?.error ?? "unknown"}`); return; }
    const newClient = await res.json();
    setClients((prev) => [newClient, ...prev]);
    setDialogOpen(false);
    setForm({ fullName: "", email: "", phone: "", primaryGoal: "", status: "PROSPECT" });
    toast.success(`${newClient.fullName} added`);
  }

  return (
    <div className="p-8 max-w-5xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Clients</h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            {clients.length} total · {clients.filter((c) => c.status === "ACTIVE").length} active
          </p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
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
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Email</Label>
                  <Input
                    type="email"
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                    placeholder="jane@email.com"
                  />
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
              <div className="grid grid-cols-2 gap-3">
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

      {/* Filters */}
      <div className="flex gap-3 mb-6">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-2.5 top-2.5 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search clients..."
            className="pl-8"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Select value={filterStatus} onValueChange={sel(setFilterStatus)}>
          <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="PROSPECT">Prospect</SelectItem>
            <SelectItem value="ACTIVE">Active</SelectItem>
            <SelectItem value="AT_RISK">At Risk</SelectItem>
            <SelectItem value="CHURNED">Churned</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {loading ? (
        <div className="space-y-2">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-16 rounded-lg bg-muted animate-pulse" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="py-16 flex flex-col items-center text-center">
            <Users className="w-10 h-10 text-muted-foreground mb-3" />
            <p className="font-medium">No clients found</p>
            <p className="text-sm text-muted-foreground mt-1">
              {search || filterStatus !== "all" ? "Try adjusting your filters" : "Add your first client above"}
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <div className="divide-y divide-border">
            {filtered.map((client) => (
              <Link
                key={client.id}
                href={`/clients/${client.id}`}
                className="flex items-center justify-between px-5 py-4 hover:bg-muted/40 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center text-sm font-semibold text-primary">
                    {client.fullName.charAt(0)}
                  </div>
                  <div>
                    <p className="text-sm font-semibold">{client.fullName}</p>
                    <p className="text-xs text-muted-foreground">
                      {client.email ?? "No email"}
                      {client.primaryGoal ? ` · ${GOAL_LABELS[client.primaryGoal] ?? client.primaryGoal}` : ""}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <div className="text-right hidden sm:block">
                    <p className="text-xs text-muted-foreground">
                      {client._count.sessionNotes} sessions · {client._count.programAssignments} programs
                    </p>
                    {client.retentionScore != null && (
                      <p className="text-xs font-mono text-muted-foreground">
                        Retention: {client.retentionScore}/100
                      </p>
                    )}
                  </div>
                  <StatusBadge status={client.status} />
                </div>
              </Link>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
