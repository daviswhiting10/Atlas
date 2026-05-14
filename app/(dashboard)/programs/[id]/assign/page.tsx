"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { ArrowLeft, UserPlus, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

type Client = { id: string; fullName: string; status: string };
type Program = { id: string; name: string; durationWeeks: number; blocks: { weeks: number; workouts: { id: string }[] }[] };

function nextMonday(): string {
  const d = new Date();
  const day = d.getDay(); // 0=Sun, 1=Mon...
  const daysUntilMonday = day === 1 ? 7 : (8 - day) % 7 || 7;
  d.setDate(d.getDate() + daysUntilMonday);
  return d.toISOString().split("T")[0];
}

export default function AssignProgramPage() {
  const { id: programId } = useParams<{ id: string }>();
  const router = useRouter();

  const [program, setProgram] = useState<Program | null>(null);
  const [clients, setClients] = useState<Client[]>([]);
  const [clientId, setClientId] = useState("");
  const [startDate, setStartDate] = useState(nextMonday());
  const [assignName, setAssignName] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    Promise.all([
      fetch(`/api/programs/${programId}`).then((r) => r.json()),
      fetch("/api/clients").then((r) => r.json()),
    ]).then(([prog, clientsData]) => {
      setProgram(prog);
      setAssignName(prog.name ?? "");
      const active = Array.isArray(clientsData)
        ? clientsData.filter((c: Client) => c.status === "ACTIVE")
        : [];
      setClients(active);
    });
  }, [programId]);

  async function assign() {
    if (!clientId) { toast.error("Select a client"); return; }
    if (!startDate) { toast.error("Set a start date"); return; }

    setSaving(true);
    try {
      const res = await fetch(`/api/programs/${programId}/assign`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientId,
          startDate: new Date(startDate).toISOString(),
          name: assignName.trim() || undefined,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast.error(err?.error ?? "Assignment failed");
        return;
      }
      const assignment = await res.json();
      toast.success("Program assigned");
      router.push(`/clients/${clientId}/programs/${assignment.id}`);
    } finally {
      setSaving(false);
    }
  }

  if (!program) {
    return <div className="p-8"><div className="h-8 w-48 bg-muted rounded animate-pulse" /></div>;
  }

  const totalWorkoutsPerBlock = program.blocks.map((b) => b.workouts.length * b.weeks);
  const totalWorkouts = totalWorkoutsPerBlock.reduce((a, b) => a + b, 0);

  return (
    <div className="p-8 max-w-xl">
      <Link
        href={`/programs/${programId}`}
        className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "mb-4 -ml-2")}
      >
        <ArrowLeft className="w-4 h-4 mr-1" />
        Back to program
      </Link>

      <h1 className="text-2xl font-bold tracking-tight mb-1">Assign Program</h1>
      <p className="text-sm text-muted-foreground mb-6">
        This creates an independent copy for the client. Edits won&apos;t affect the template.
      </p>

      <Card className="mb-6">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">{program.name}</CardTitle>
        </CardHeader>
        <CardContent className="text-xs text-muted-foreground">
          {program.durationWeeks} weeks · {program.blocks.length} blocks · {totalWorkouts} total sessions
        </CardContent>
      </Card>

      <div className="space-y-4">
        <div className="space-y-1.5">
          <Label>Client *</Label>
          <Select value={clientId} onValueChange={setClientId}>
            <SelectTrigger>
              <SelectValue placeholder="Select active client..." />
            </SelectTrigger>
            <SelectContent>
              {clients.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.fullName}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {clients.length === 0 && (
            <p className="text-xs text-muted-foreground">No active clients. Set a client to Active first.</p>
          )}
        </div>

        <div className="space-y-1.5">
          <Label>Assignment name</Label>
          <Input
            value={assignName}
            onChange={(e) => setAssignName(e.target.value)}
            placeholder="Defaults to program name..."
          />
        </div>

        <div className="space-y-1.5">
          <Label>Start date (Week 1 Monday) *</Label>
          <Input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
          />
        </div>

        <Button onClick={assign} disabled={saving || !clientId} className="w-full">
          {saving ? (
            <><Loader2 className="w-4 h-4 mr-1.5 animate-spin" />Assigning...</>
          ) : (
            <><UserPlus className="w-4 h-4 mr-1.5" />Assign to Client</>
          )}
        </Button>
      </div>
    </div>
  );
}
