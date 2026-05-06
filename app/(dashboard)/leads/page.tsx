"use client";

import { useEffect, useState } from "react";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { LeadStatusBadge } from "@/components/status-badge";
import { toast } from "sonner";
import { Plus } from "lucide-react";

type Lead = {
  id: string;
  fullName: string;
  email: string | null;
  phone: string | null;
  source: string;
  context: string | null;
  status: string;
  createdAt: string;
};

const COLUMNS = [
  { key: "new", label: "New" },
  { key: "contacted", label: "Contacted" },
  { key: "replied", label: "Replied" },
  { key: "booked", label: "Booked" },
  { key: "converted", label: "Converted" },
  { key: "dead", label: "Dead" },
];

const SOURCE_LABELS: Record<string, string> = {
  referral: "Referral",
  ig: "Instagram",
  life_time_floor: "Life Time Floor",
  cold_list: "Cold List",
  other: "Other",
};

const sel = (setter: (v: string) => void) => (v: string | null) => { if (v) setter(v); };

export default function LeadsPage() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState({
    fullName: "",
    email: "",
    phone: "",
    source: "referral",
    context: "",
  });

  useEffect(() => {
    fetch("/api/leads").then((r) => r.json()).then(setLeads);
  }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    const res = await fetch("/api/leads", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    if (!res.ok) { toast.error("Failed to add lead"); return; }
    const lead = await res.json();
    setLeads((prev) => [lead, ...prev]);
    setDialogOpen(false);
    setForm({ fullName: "", email: "", phone: "", source: "referral", context: "" });
    toast.success(`${lead.fullName} added to pipeline`);
  }

  async function moveToStatus(leadId: string, status: string) {
    const res = await fetch(`/api/leads/${leadId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    if (!res.ok) return;
    setLeads((prev) => prev.map((l) => (l.id === leadId ? { ...l, status } : l)));
  }

  const grouped = COLUMNS.reduce<Record<string, Lead[]>>((acc, col) => {
    acc[col.key] = leads.filter((l) => l.status === col.key);
    return acc;
  }, {});

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Pipeline</h1>
          <p className="text-muted-foreground text-sm mt-0.5">{leads.length} leads total</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger>
            <span className={buttonVariants()}>
              <Plus className="w-4 h-4 mr-1.5" />
              Add Lead
            </span>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>New Lead</DialogTitle></DialogHeader>
            <form onSubmit={handleCreate} className="space-y-4 mt-2">
              <div className="space-y-1.5">
                <Label>Name *</Label>
                <Input required value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} placeholder="Name" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Email</Label>
                  <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <Label>Phone</Label>
                  <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Source *</Label>
                <Select value={form.source} onValueChange={sel((v) => setForm((f) => ({ ...f, source: v })))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="referral">Referral</SelectItem>
                    <SelectItem value="ig">Instagram</SelectItem>
                    <SelectItem value="life_time_floor">Life Time Floor</SelectItem>
                    <SelectItem value="cold_list">Cold List</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Context</Label>
                <Textarea
                  value={form.context}
                  onChange={(e) => setForm({ ...form, context: e.target.value })}
                  placeholder="e.g. Saw her doing RDLs wrong on Tuesday. Has knee issues."
                  rows={3}
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setDialogOpen(false)} className={buttonVariants({ variant: "outline" })}>Cancel</button>
                <button type="submit" className={buttonVariants()}>Add Lead</button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Kanban */}
      <div className="flex gap-4 overflow-x-auto pb-4">
        {COLUMNS.map((col) => (
          <div key={col.key} className="flex-shrink-0 w-60">
            <div className="flex items-center gap-2 mb-3">
              <LeadStatusBadge status={col.key} />
              <span className="text-xs text-muted-foreground font-medium">{grouped[col.key].length}</span>
            </div>
            <div className="space-y-2 min-h-[200px]">
              {grouped[col.key].map((lead) => (
                <Card key={lead.id} className="shadow-none hover:border-primary/40 transition-colors">
                  <CardContent className="p-3">
                    <p className="text-sm font-semibold leading-tight">{lead.fullName}</p>
                    {lead.email && <p className="text-xs text-muted-foreground mt-0.5 truncate">{lead.email}</p>}
                    <p className="text-xs text-muted-foreground mt-1">{SOURCE_LABELS[lead.source] ?? lead.source}</p>
                    {lead.context && (
                      <p className="text-xs text-muted-foreground mt-1 line-clamp-2 italic">"{lead.context}"</p>
                    )}
                    <div className="flex gap-1 mt-2 flex-wrap">
                      {COLUMNS.filter((c) => c.key !== col.key).slice(0, 3).map((target) => (
                        <button
                          key={target.key}
                          onClick={() => moveToStatus(lead.id, target.key)}
                          className="text-xs text-muted-foreground hover:text-primary border border-border rounded px-1.5 py-0.5 hover:border-primary transition-colors"
                        >
                          → {target.label}
                        </button>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              ))}
              {grouped[col.key].length === 0 && (
                <div className="border-2 border-dashed border-border rounded-lg h-24 flex items-center justify-center">
                  <p className="text-xs text-muted-foreground">Empty</p>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
