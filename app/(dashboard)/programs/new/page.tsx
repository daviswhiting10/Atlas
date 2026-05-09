"use client";

import { useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { ArrowLeft, Loader2, Wand2, Save } from "lucide-react";

type Client = { id: string; fullName: string };

export default function NewProgramPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const preselectedClientId = searchParams.get("clientId") ?? "";

  const [clients, setClients] = useState<Client[]>([]);
  const [clientId, setClientId] = useState(preselectedClientId);
  const [goal, setGoal] = useState("general");
  const [durationWeeks, setDurationWeeks] = useState("8");
  const [sessionsPerWeek, setSessionsPerWeek] = useState("3");
  const [sessionLength, setSessionLength] = useState("60");
  const [equipment, setEquipment] = useState("Full commercial gym");
  const [notes, setNotes] = useState("");
  const [generatedProgram, setGeneratedProgram] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch("/api/clients").then((r) => r.json()).then((data) => setClients(Array.isArray(data) ? data : []));
  }, []);

  const sel = (setter: (v: string) => void) => (v: string | null) => { if (v) setter(v); };

  async function generate() {
    if (!clientId) { toast.error("Select a client"); return; }
    setLoading(true);
    setGeneratedProgram("");
    try {
      const res = await fetch("/api/ai/program-generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientId,
          goal,
          durationWeeks: parseInt(durationWeeks),
          sessionsPerWeek: parseInt(sessionsPerWeek),
          sessionLength: parseInt(sessionLength),
          equipment,
          notes,
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setGeneratedProgram(typeof data.program === "string" ? data.program : JSON.stringify(data.program, null, 2));
    } catch {
      toast.error("Failed to generate. Check API key.");
    } finally {
      setLoading(false);
    }
  }

  async function saveProgram() {
    if (!generatedProgram || !clientId) return;
    setSaving(true);
    const client = clients.find((c) => c.id === clientId);
    const res = await fetch("/api/programs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        clientId,
        name: `${client?.fullName ?? "Client"} — ${goal.replace("_", " ")} program`,
        goal,
        durationWeeks: parseInt(durationWeeks),
        markdownBlob: generatedProgram,
        notes,
      }),
    });
    setSaving(false);
    if (res.ok) {
      toast.success("Program saved");
      router.push(`/clients/${clientId}`);
    } else {
      toast.error("Failed to save");
    }
  }

  return (
    <div className="p-8 max-w-3xl">
      <Link href="/programs" className={buttonVariants({ variant: "ghost", size: "sm" }) + " mb-4 -ml-2 inline-flex"}>
        <ArrowLeft className="w-4 h-4 mr-1" />
        Programs
      </Link>

      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">New Program</h1>
        <p className="text-muted-foreground text-sm mt-0.5">
          AI generates a full periodized program based on your methodology.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4 mb-4">
        <div className="space-y-1.5">
          <Label>Client *</Label>
          <Select value={clientId} onValueChange={sel(setClientId)}>
            <SelectTrigger><SelectValue placeholder="Select client..." /></SelectTrigger>
            <SelectContent>
              {clients.map((c) => (
                <SelectItem key={c.id} value={c.id}>{c.fullName}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Goal</Label>
          <Select value={goal} onValueChange={sel(setGoal)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
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
          <Label>Duration (weeks)</Label>
          <Select value={durationWeeks} onValueChange={sel(setDurationWeeks)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {["4","6","8","10","12","16"].map((w) => (
                <SelectItem key={w} value={w}>{w} weeks</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Sessions / week</Label>
          <Select value={sessionsPerWeek} onValueChange={sel(setSessionsPerWeek)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {["2","3","4","5","6"].map((s) => (
                <SelectItem key={s} value={s}>{s}x / week</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Session length (min)</Label>
          <Select value={sessionLength} onValueChange={sel(setSessionLength)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {["30","45","60","75","90"].map((l) => (
                <SelectItem key={l} value={l}>{l} min</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Equipment</Label>
          <Input value={equipment} onChange={(e) => setEquipment(e.target.value)} />
        </div>
      </div>

      <div className="space-y-1.5 mb-6">
        <Label>Additional notes</Label>
        <Textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
          placeholder="Client has lower back sensitivity, just finished a cut, wants to prioritize upper body..."
        />
      </div>

      <Button onClick={generate} disabled={loading || !clientId} className="mb-6">
        {loading ? (
          <><Loader2 className="w-4 h-4 mr-1.5 animate-spin" />Generating...</>
        ) : (
          <><Wand2 className="w-4 h-4 mr-1.5" />Generate Program</>
        )}
      </Button>

      {generatedProgram && (
        <Card>
          <CardHeader className="pb-2 flex flex-row items-center justify-between">
            <CardTitle className="text-sm font-semibold">Generated Program</CardTitle>
            <Button size="sm" onClick={saveProgram} disabled={saving}>
              {saving ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Save className="w-3.5 h-3.5 mr-1.5" />}
              Save
            </Button>
          </CardHeader>
          <CardContent>
            <Textarea
              value={generatedProgram}
              onChange={(e) => setGeneratedProgram(e.target.value)}
              rows={30}
              className="font-mono text-xs resize-none border-0 p-0 focus-visible:ring-0 shadow-none"
            />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
