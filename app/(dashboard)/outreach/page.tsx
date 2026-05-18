"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Copy, CheckCheck, Loader2, Sparkles } from "lucide-react";
import Link from "next/link";

type Client = { id: string; fullName: string };
type OutreachRecord = {
  id: string;
  purpose: string;
  channel: string;
  generatedDraft: string;
  createdAt: string;
  client: { id: string; fullName: string } | null;
};

const PURPOSES = [
  { value: "reactivation", label: "Reactivation" },
  { value: "birthday", label: "Birthday" },
  { value: "check-in", label: "Check-In" },
  { value: "appointment-confirm", label: "Appt. Confirmation" },
  { value: "first-contact", label: "First Contact" },
  { value: "goal-review", label: "Goal Review" },
];

const TEMPLATES = [
  {
    id: "reactivation",
    label: "Reactivation Email",
    channel: "Email",
    body: `Hi ______!

My name is Davis Whiting and I'm a Personal Trainer here at Life Time - Columbia. We are happy to see that you've come back and to make your experience even better, I'm offering you a 1h complimentary Goal Setting Session available to use during your first month of reactivation! During that session, we can talk about your health and fitness goals and I will help you make a plan to achieve them!

Let me know what day & time works best for you so we can get started!

You can reply to this email or text at 513-828-8682.

Hope to hear from you soon!

In Health,
Davis Whiting`,
  },
  {
    id: "birthday",
    label: "Birthday Email",
    channel: "Email",
    body: `Hello ______,

My name is Davis Whiting and I'm a Personal Trainer here at Life Time - Columbia.

I hope all is well with you.

First and foremost, HAPPY BIRTHDAY!!! I hope your special day is awesome!

To make it even better, as a birthday gift, I'm giving you a 1h complimentary Dynamic Personal Training Experience available to use on your account! During that session, you can inquire as to how to set up your workouts for success each time you come in.

Let me know what day & time works best for you so we can get started!

You can reply to this email or text at 513-828-8682.

Hope to hear from you soon!

In Health,
Davis Whiting`,
  },
  {
    id: "appointment_confirm",
    label: "Appointment Confirmation",
    channel: "Text — send 12–24 hrs before",
    body: `Hi _____! It's Davis from Life Time. This text is to confirm you for your 1-1 Goal Setting Session with me tomorrow at _____ AM/PM.

Please confirm by 5PM today to avoid late cancellation.`,
  },
];

function TemplateCard({ template }: { template: (typeof TEMPLATES)[0] }) {
  const [body, setBody] = useState(template.body);
  const [copied, setCopied] = useState(false);

  function copy() {
    navigator.clipboard.writeText(body);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast.success("Copied to clipboard");
  }

  return (
    <Card>
      <CardHeader className="pb-2 flex flex-row items-center justify-between">
        <div>
          <CardTitle className="text-sm font-semibold">{template.label}</CardTitle>
          <p className="text-xs text-muted-foreground mt-0.5">{template.channel}</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setBody(template.body)} className="text-xs">
            Reset
          </Button>
          <Button size="sm" onClick={copy}>
            {copied ? (
              <><CheckCheck className="w-3.5 h-3.5 mr-1" />Copied</>
            ) : (
              <><Copy className="w-3.5 h-3.5 mr-1" />Copy</>
            )}
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <Textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={body.split("\n").length + 2}
          className="font-mono text-sm resize-none"
        />
        <p className="text-xs text-muted-foreground mt-2">Fill in the blanks (______), then copy.</p>
      </CardContent>
    </Card>
  );
}

export default function OutreachPage() {
  const searchParams = useSearchParams();
  const preselectedClientId = searchParams.get("clientId") ?? "";

  const [clients, setClients] = useState<Client[]>([]);
  const [history, setHistory] = useState<OutreachRecord[]>([]);
  const [clientId, setClientId] = useState(preselectedClientId);
  const [purpose, setPurpose] = useState("");
  const [channel, setChannel] = useState<"email" | "sms" | "dm">("email");
  const [context, setContext] = useState("");
  const [draft, setDraft] = useState("");
  const [generating, setGenerating] = useState(false);
  const [copied, setCopied] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch("/api/clients").then((r) => r.json()).then((d) => setClients(Array.isArray(d) ? d : []));
    fetch("/api/outreach").then((r) => r.json()).then((d) => setHistory(Array.isArray(d) ? d : []));
  }, []);

  async function generate() {
    if (!clientId) { toast.error("Select a client first"); return; }
    if (!purpose) { toast.error("Select a purpose"); return; }
    setGenerating(true);
    setDraft("");
    try {
      const res = await fetch("/api/ai/outreach-generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId, purpose, channel, context: context || undefined }),
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setDraft(data.draft);
    } catch {
      toast.error("Failed to generate. Check API key.");
    } finally {
      setGenerating(false);
    }
  }

  async function saveDraft() {
    if (!draft) return;
    setSaving(true);
    try {
      const res = await fetch("/api/outreach", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId: clientId || undefined, channel, purpose, generatedDraft: draft }),
      });
      if (!res.ok) throw new Error(await res.text());
      toast.success("Saved to outreach log");
      const saved = await res.json();
      const client = clients.find((c) => c.id === clientId) ?? null;
      setHistory((prev) => [{ ...saved, client: client ? { id: client.id, fullName: client.fullName } : null }, ...prev]);
      setDraft("");
      setContext("");
    } catch {
      toast.error("Failed to save");
    } finally {
      setSaving(false);
    }
  }

  function copyDraft() {
    navigator.clipboard.writeText(draft);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast.success("Copied to clipboard");
  }

  return (
    <div className="p-8 max-w-3xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">Outreach</h1>
        <p className="text-muted-foreground text-sm mt-0.5">
          Generate AI-personalized messages or use templates.
        </p>
      </div>

      {/* AI Generator */}
      <Card className="mb-6">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-primary" />
            AI Generator
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label className="mb-1.5 block text-xs">Client</Label>
              <Select value={clientId} onValueChange={(v) => { if (v) setClientId(v); }}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue placeholder="Select..." />
                </SelectTrigger>
                <SelectContent>
                  {clients.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.fullName}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="mb-1.5 block text-xs">Purpose</Label>
              <Select value={purpose} onValueChange={setPurpose}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue placeholder="Select..." />
                </SelectTrigger>
                <SelectContent>
                  {PURPOSES.map((p) => (
                    <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="mb-1.5 block text-xs">Channel</Label>
              <Select value={channel} onValueChange={(v) => setChannel(v as "email" | "sms" | "dm")}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="email">Email</SelectItem>
                  <SelectItem value="sms">Text / SMS</SelectItem>
                  <SelectItem value="dm">DM</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <Label className="mb-1.5 block text-xs">Context (optional)</Label>
            <Textarea
              value={context}
              onChange={(e) => setContext(e.target.value)}
              placeholder="e.g. She missed two sessions, mentioned knee pain last time..."
              rows={2}
              className="text-sm resize-none"
            />
          </div>

          <Button onClick={generate} disabled={generating || !clientId || !purpose} className="w-full">
            {generating ? (
              <><Loader2 className="w-4 h-4 mr-1.5 animate-spin" />Generating...</>
            ) : (
              <><Sparkles className="w-4 h-4 mr-1.5" />Generate</>
            )}
          </Button>

          {draft && (
            <div className="space-y-2 pt-1">
              <Textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                rows={draft.split("\n").length + 2}
                className="font-mono text-sm resize-none"
              />
              <div className="flex gap-2 justify-end">
                <Button variant="outline" size="sm" onClick={copyDraft}>
                  {copied ? (
                    <><CheckCheck className="w-3.5 h-3.5 mr-1" />Copied</>
                  ) : (
                    <><Copy className="w-3.5 h-3.5 mr-1" />Copy</>
                  )}
                </Button>
                <Button size="sm" onClick={saveDraft} disabled={saving}>
                  {saving ? "Saving..." : "Save to Log"}
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Static Templates */}
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Templates</p>
      <div className="space-y-5 mb-8">
        {TEMPLATES.map((t) => (
          <TemplateCard key={t.id} template={t} />
        ))}
      </div>

      {/* History */}
      {history.length > 0 && (
        <>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Recent Outreach</p>
          <div className="space-y-2">
            {history.map((msg) => (
              <Card key={msg.id}>
                <CardContent className="py-3 px-4">
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      {msg.client ? (
                        <Link href={`/clients/${msg.client.id}`} className="text-sm font-medium hover:text-primary">
                          {msg.client.fullName}
                        </Link>
                      ) : (
                        <span className="text-sm font-medium text-muted-foreground">No client</span>
                      )}
                      <Badge variant="outline" className="text-xs capitalize">{msg.channel}</Badge>
                      <Badge variant="secondary" className="text-xs">{msg.purpose}</Badge>
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {new Date(msg.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground line-clamp-2 font-mono">{msg.generatedDraft}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
