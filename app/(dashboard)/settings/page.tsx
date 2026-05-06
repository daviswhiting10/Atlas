"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Save, Loader2, BookOpen, Zap } from "lucide-react";

const DEFAULT_VOICE = `Davis Whiting — NASM CPT, NASM CNC, former D1 lacrosse captain. Training at Life Time Fitness, Columbia MD.

Voice: Evidence-based, direct, no fluff. Slight intellectual edge — I read the research and I apply it. Not a Planet Fitness coach. I say what I mean and I expect clients to do the work.

What I say:
- "Here's why this works..." (brief, evidence-backed rationale)
- "The goal this block is X. Here's how we get there."
- Short sentences. No corporate wellness speak.
- I call out when someone is sandbagging or playing it safe.

What I don't say:
- "Amazing!" after every set
- "You've got this!" filler
- Vague encouragement without substance
- Jargon the client doesn't understand

Client relationship style:
- I'm direct but I'm in their corner. I care about results and I hold people accountable.
- I adjust based on what I observe — not just what they report.
- I give credit when it's earned and honest feedback when it isn't.

Training philosophy:
- Train Like It Matters. Every session has a purpose.
- Evidence-based programming: periodization, progressive overload, specificity.
- Corrective work isn't optional for clients with dysfunction — it's part of the program.
- I don't believe in programs that look good on paper but don't transfer to the gym floor.`;

export default function SettingsPage() {
  const [form, setForm] = useState({
    name: "Davis Whiting",
    email: "davis@atlas.app",
    voiceProfile: DEFAULT_VOICE,
  });
  const [saving, setSaving] = useState(false);
  const [pingResult, setPingResult] = useState<string | null>(null);
  const [pinging, setPinging] = useState(false);

  useEffect(() => {
    fetch("/api/trainer")
      .then((r) => r.json())
      .then((trainer) => {
        if (trainer) {
          setForm({
            name: trainer.name ?? form.name,
            email: trainer.email ?? form.email,
            voiceProfile: trainer.voiceProfile ?? DEFAULT_VOICE,
          });
        }
      });
  }, []);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const res = await fetch("/api/trainer", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    setSaving(false);
    if (res.ok) toast.success("Settings saved");
    else toast.error("Failed to save");
  }

  async function ping() {
    setPinging(true);
    setPingResult(null);
    try {
      const res = await fetch("/api/ai/ping");
      const data = await res.json();
      setPingResult(JSON.stringify(data, null, 2));
      toast.success("AI connection confirmed");
    } catch {
      setPingResult("Error — check your ANTHROPIC_API_KEY in .env.local");
      toast.error("AI ping failed");
    } finally {
      setPinging(false);
    }
  }

  return (
    <div className="p-8 max-w-2xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
        <p className="text-muted-foreground text-sm mt-0.5">
          Your trainer profile and voice — injected into every AI generation.
        </p>
      </div>

      <form onSubmit={save} className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-semibold">Profile</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Name</Label>
                <Input
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Email</Label>
                <Input
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              Voice Profile
              <Badge variant="outline" className="text-xs font-normal">
                Injected into every AI prompt
              </Badge>
            </CardTitle>
            <CardDescription className="text-xs">
              Describe your training style, what you say and don't say, and how you relate to clients.
              The more specific, the better the AI output.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Textarea
              value={form.voiceProfile}
              onChange={(e) => setForm({ ...form, voiceProfile: e.target.value })}
              rows={18}
              className="font-mono text-xs leading-relaxed resize-none"
            />
          </CardContent>
        </Card>

        <div className="flex justify-end">
          <Button type="submit" disabled={saving}>
            {saving ? (
              <>
                <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Save className="w-4 h-4 mr-1.5" />
                Save Settings
              </>
            )}
          </Button>
        </div>
      </form>

      {/* AI connection test */}
      <Card className="mt-8">
        <CardHeader>
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Zap className="w-4 h-4 text-primary" />
            AI Connection
          </CardTitle>
          <CardDescription className="text-xs">
            Test your Anthropic API key. Add it to <code className="font-mono bg-muted px-1 rounded">.env.local</code> if missing.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button variant="outline" onClick={ping} disabled={pinging} size="sm">
            {pinging ? (
              <>
                <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                Pinging...
              </>
            ) : (
              "Test AI Connection"
            )}
          </Button>
          {pingResult && (
            <pre className="mt-3 text-xs font-mono bg-muted rounded p-3 overflow-auto max-h-48">
              {pingResult}
            </pre>
          )}
        </CardContent>
      </Card>

      {/* Methodology info */}
      <Card className="mt-4">
        <CardHeader>
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <BookOpen className="w-4 h-4 text-primary" />
            Methodology Files
          </CardTitle>
          <CardDescription className="text-xs">
            Fill in <code className="font-mono bg-muted px-1 rounded">/methodology/*.md</code> files to give Atlas your training framework.
            These are loaded into every AI prompt automatically.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-1">
            {[
              "00-voice-and-philosophy.md",
              "01-program-design-framework.md",
              "02-periodization.md",
              "03-corrective-exercise.md",
              "04-nutrition.md",
              "05-population-templates.md",
              "06-scope-of-practice.md",
            ].map((f) => (
              <div key={f} className="flex items-center gap-2 text-xs">
                <div className="w-1.5 h-1.5 rounded-full bg-muted-foreground/40" />
                <code className="font-mono text-muted-foreground">{f}</code>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
