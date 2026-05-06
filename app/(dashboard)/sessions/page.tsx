"use client";

/// <reference types="@types/dom-speech-recognition" />

import { useEffect, useRef, useState } from "react";
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
import { Mic, MicOff, Loader2, CheckCircle } from "lucide-react";

type Client = { id: string; fullName: string };
type StructuredNote = {
  subjective: string;
  objective: string;
  assessment: string;
  plan: string;
  exercises?: Array<{ name: string; sets?: number; reps?: string; weight?: string }>;
  rpeAvg?: number;
  wins?: string[];
  concerns?: string[];
  nextSessionFocus?: string;
};

export default function SessionsPage() {
  const searchParams = useSearchParams();
  const preselectedClientId = searchParams.get("clientId") ?? "";

  const [clients, setClients] = useState<Client[]>([]);
  const [clientId, setClientId] = useState(preselectedClientId);
  const [rawInput, setRawInput] = useState("");
  const [structuredNote, setStructuredNote] = useState<StructuredNote | null>(null);
  const [loading, setLoading] = useState(false);
  const [recording, setRecording] = useState(false);
  const recognitionRef = useRef<SpeechRecognition | null>(null);

  useEffect(() => {
    fetch("/api/clients").then((r) => r.json()).then(setClients);
  }, []);

  function toggleRecording() {
    const SpeechRecognitionAPI =
      (window as Window & { SpeechRecognition?: typeof SpeechRecognition }).SpeechRecognition ||
      (window as Window & { webkitSpeechRecognition?: typeof SpeechRecognition }).webkitSpeechRecognition;

    if (!SpeechRecognitionAPI) {
      toast.error("Speech recognition not supported in this browser");
      return;
    }
    if (recording) {
      recognitionRef.current?.stop();
      setRecording(false);
      return;
    }
    const recognition = new SpeechRecognitionAPI();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.onresult = (e: SpeechRecognitionEvent) => {
      const transcript = Array.from(e.results)
        .map((r) => r[0].transcript)
        .join(" ");
      setRawInput(transcript);
    };
    recognition.onend = () => setRecording(false);
    recognition.start();
    recognitionRef.current = recognition;
    setRecording(true);
  }

  async function structureNote() {
    if (!clientId) { toast.error("Select a client first"); return; }
    if (!rawInput.trim()) { toast.error("Add some notes first"); return; }
    setLoading(true);
    try {
      const res = await fetch("/api/ai/session-structure", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId, rawInput }),
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setStructuredNote(data.structuredNote as StructuredNote);
    } catch {
      toast.error("Failed to structure note. Check API key.");
    } finally {
      setLoading(false);
    }
  }

  async function saveNote() {
    if (!structuredNote) return;
    const res = await fetch("/api/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        clientId,
        rawInput,
        structuredNote,
        rpeAvg: structuredNote.rpeAvg ?? null,
        date: new Date().toISOString(),
      }),
    });
    if (!res.ok) { toast.error("Failed to save"); return; }
    toast.success("Session saved");
    setRawInput("");
    setStructuredNote(null);
  }

  return (
    <div className="p-8 max-w-3xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">Log Session</h1>
        <p className="text-muted-foreground text-sm mt-0.5">
          Speak or type post-session notes. Atlas structures them into SOAP format.
        </p>
      </div>

      <div className="mb-4">
        <Label className="mb-1.5 block">Client</Label>
        <Select value={clientId} onValueChange={(v) => { if (v) setClientId(v); }}>
          <SelectTrigger className="w-64">
            <SelectValue placeholder="Select client..." />
          </SelectTrigger>
          <SelectContent>
            {clients.map((c) => (
              <SelectItem key={c.id} value={c.id}>{c.fullName}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Card className="mb-4">
        <CardHeader className="pb-2 flex flex-row items-center justify-between">
          <CardTitle className="text-sm font-semibold">Raw Notes</CardTitle>
          <Button
            variant={recording ? "destructive" : "outline"}
            size="sm"
            onClick={toggleRecording}
            className="gap-1.5"
          >
            {recording ? (
              <><MicOff className="w-3.5 h-3.5" />Stop</>
            ) : (
              <><Mic className="w-3.5 h-3.5" />Voice Input</>
            )}
          </Button>
        </CardHeader>
        <CardContent>
          {recording && (
            <div className="flex items-center gap-2 mb-2 text-xs text-red-600">
              <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
              Recording...
            </div>
          )}
          <Textarea
            value={rawInput}
            onChange={(e) => setRawInput(e.target.value)}
            placeholder="Just talk — 'Did chest/shoulders today, she hit 95lbs on bench for the first time. RPE was about a 7...'"
            rows={6}
            className="resize-none font-mono text-sm"
          />
        </CardContent>
      </Card>

      <Button onClick={structureNote} disabled={loading || !rawInput.trim()} className="mb-6">
        {loading ? (
          <><Loader2 className="w-4 h-4 mr-1.5 animate-spin" />Structuring...</>
        ) : "Structure with AI"}
      </Button>

      {structuredNote && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-sm">SOAP Note</h2>
            <div className="flex gap-2">
              {structuredNote.rpeAvg && (
                <Badge variant="secondary">Avg RPE {structuredNote.rpeAvg}</Badge>
              )}
              <Button size="sm" onClick={saveNote}>
                <CheckCircle className="w-3.5 h-3.5 mr-1.5" />
                Save
              </Button>
            </div>
          </div>

          {(["subjective", "objective", "assessment", "plan"] as const).map((key) => (
            <Card key={key}>
              <CardContent className="pt-4 pb-3">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">{key}</p>
                <p className="text-sm">{structuredNote[key]}</p>
              </CardContent>
            </Card>
          ))}

          {structuredNote.wins && structuredNote.wins.length > 0 && (
            <Card className="border-emerald-200 bg-emerald-50/40">
              <CardContent className="pt-4 pb-3">
                <p className="text-xs font-semibold uppercase tracking-wider text-emerald-700 mb-2">Wins</p>
                <ul className="space-y-0.5">
                  {structuredNote.wins.map((w, i) => <li key={i} className="text-sm text-emerald-800">• {w}</li>)}
                </ul>
              </CardContent>
            </Card>
          )}

          {structuredNote.concerns && structuredNote.concerns.length > 0 && (
            <Card className="border-amber-200 bg-amber-50/40">
              <CardContent className="pt-4 pb-3">
                <p className="text-xs font-semibold uppercase tracking-wider text-amber-700 mb-2">Concerns</p>
                <ul className="space-y-0.5">
                  {structuredNote.concerns.map((c, i) => <li key={i} className="text-sm text-amber-800">• {c}</li>)}
                </ul>
              </CardContent>
            </Card>
          )}

          {structuredNote.nextSessionFocus && (
            <Card>
              <CardContent className="pt-4 pb-3">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">Next Session Focus</p>
                <p className="text-sm">{structuredNote.nextSessionFocus}</p>
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
