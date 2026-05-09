"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Loader2, Copy, CheckCheck, Wand2, Save } from "lucide-react";

type Client = { id: string; fullName: string; status: string };

const PURPOSES = [
  { value: "cold_outreach", label: "Cold Outreach" },
  { value: "check_in", label: "Check-In" },
  { value: "win_back", label: "Win Back (Churned)" },
  { value: "retention_nudge", label: "Retention Nudge (At Risk)" },
  { value: "post_consult", label: "Post-Consult Follow-Up" },
  { value: "referral_ask", label: "Referral Ask" },
];

const CHANNELS = [
  { value: "email", label: "Email" },
  { value: "sms", label: "SMS" },
  { value: "dm", label: "DM" },
];

export default function OutreachPage() {
  const searchParams = useSearchParams();
  const preselectedClientId = searchParams.get("clientId") ?? "";

  const [clients, setClients] = useState<Client[]>([]);
  const [clientId, setClientId] = useState(preselectedClientId);
  const [purpose, setPurpose] = useState("check_in");
  const [channel, setChannel] = useState("email");
  const [context, setContext] = useState("");
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [savedId, setSavedId] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/clients")
      .then((r) => r.json())
      .then((data) => setClients(Array.isArray(data) ? data : []));
  }, []);

  async function generate() {
    if (!clientId) { toast.error("Select a client"); return; }
    setLoading(true);
    setDraft("");
    setSavedId(null);
    try {
      const res = await fetch("/api/ai/outreach-generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId, purpose, channel, context }),
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setDraft(data.draft);
      // Auto-save draft to OutreachMessage log
      const saveRes = await fetch("/api/outreach", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId, purpose, channel, generatedDraft: data.draft }),
      });
      if (saveRes.ok) {
        const saved = await saveRes.json();
        setSavedId(saved.id);
      }
    } catch {
      toast.error("Failed to generate. Check your API key.");
    } finally {
      setLoading(false);
    }
  }

  function copy() {
    navigator.clipboard.writeText(draft);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast.success("Copied to clipboard");
  }

  const selectedClient = clients.find((c) => c.id === clientId);

  return (
    <div className="p-8 max-w-3xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">Outreach</h1>
        <p className="text-muted-foreground text-sm mt-0.5">
          Generate personalized messages in your voice. Review, edit, then copy or send.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4 mb-4">
        <div className="space-y-1.5">
          <Label>Client</Label>
          <Select value={clientId} onValueChange={(v) => { if (v) setClientId(v); }}>
            <SelectTrigger>
              <SelectValue placeholder="Select client..." />
            </SelectTrigger>
            <SelectContent>
              {clients.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.fullName}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Purpose</Label>
          <Select value={purpose} onValueChange={(v) => { if (v) setPurpose(v); }}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PURPOSES.map((p) => (
                <SelectItem key={p.value} value={p.value}>
                  {p.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Channel</Label>
          <Select value={channel} onValueChange={(v) => { if (v) setChannel(v); }}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CHANNELS.map((c) => (
                <SelectItem key={c.value} value={c.value}>
                  {c.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Extra context <span className="text-muted-foreground font-normal">(optional)</span></Label>
          <Input
            value={context}
            onChange={(e) => setContext(e.target.value)}
            placeholder="She hit a PR last week, hasn't replied in 2 weeks..."
          />
        </div>
      </div>

      <Button onClick={generate} disabled={loading || !clientId} className="mb-6">
        {loading ? (
          <>
            <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
            Generating...
          </>
        ) : (
          <>
            <Wand2 className="w-4 h-4 mr-1.5" />
            Generate Message
          </>
        )}
      </Button>

      {draft && (
        <Card>
          <CardHeader className="pb-2 flex flex-row items-center justify-between">
            <CardTitle className="text-sm font-semibold">
              Draft — {PURPOSES.find((p) => p.value === purpose)?.label}
            </CardTitle>
            <div className="flex gap-2 items-center">
              {savedId && (
                <span className="text-xs text-muted-foreground flex items-center gap-1">
                  <Save className="w-3 h-3" /> Saved
                </span>
              )}
              {selectedClient && (
                <Badge variant="outline" className="text-xs">
                  {selectedClient.fullName}
                </Badge>
              )}
              <Button variant="outline" size="sm" onClick={copy}>
                {copied ? (
                  <>
                    <CheckCheck className="w-3.5 h-3.5 mr-1" />
                    Copied
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5 mr-1" />
                    Copy
                  </>
                )}
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <Textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              rows={10}
              className="font-mono text-sm resize-none border-0 p-0 focus-visible:ring-0 shadow-none"
            />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
