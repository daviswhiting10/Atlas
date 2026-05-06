"use client";

import { useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
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
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { ChevronRight, ChevronLeft, CheckCircle, AlertTriangle, Loader2 } from "lucide-react";

type Client = { id: string; fullName: string };

type FormData = {
  // Step 1: Demographics & History
  age: string;
  sex: string;
  occupation: string;
  trainingHistory: string;
  yearsTraining: string;
  // Step 2: Goals
  primaryGoal: string;
  secondaryGoals: string;
  targetTimeline: string;
  // Step 3: Injury & Medical
  currentInjuries: string;
  pastInjuries: string;
  medications: string;
  medicalConditions: string;
  // Step 4: PAR-Q+
  heartCondition: string;
  chestPain: string;
  dizziness: string;
  boneJointProblem: string;
  bloodPressureMeds: string;
  otherReason: string;
  // Step 5: Lifestyle
  sleepHours: string;
  stressLevel: string;
  nutritionBaseline: string;
  waterIntake: string;
  // Step 6: Preferences
  sessionLength: string;
  sessionsPerWeek: string;
  equipment: string;
  dislikes: string;
};

const STEPS = [
  "Demographics",
  "Goals",
  "Injury History",
  "PAR-Q+",
  "Lifestyle",
  "Preferences",
];

const EMPTY_FORM: FormData = {
  age: "", sex: "", occupation: "", trainingHistory: "", yearsTraining: "",
  primaryGoal: "", secondaryGoals: "", targetTimeline: "",
  currentInjuries: "", pastInjuries: "", medications: "", medicalConditions: "",
  heartCondition: "no", chestPain: "no", dizziness: "no", boneJointProblem: "no",
  bloodPressureMeds: "no", otherReason: "no",
  sleepHours: "", stressLevel: "", nutritionBaseline: "", waterIntake: "",
  sessionLength: "", sessionsPerWeek: "", equipment: "", dislikes: "",
};

function YesNoField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex items-start justify-between py-3 border-b border-border last:border-0">
      <Label className="text-sm leading-relaxed max-w-sm">{label}</Label>
      <div className="flex gap-2 ml-4 shrink-0">
        <button
          type="button"
          onClick={() => onChange("yes")}
          className={`px-3 py-1 rounded text-sm font-medium transition-colors ${value === "yes" ? "bg-primary text-white" : "bg-muted text-muted-foreground hover:bg-muted/80"}`}
        >
          Yes
        </button>
        <button
          type="button"
          onClick={() => onChange("no")}
          className={`px-3 py-1 rounded text-sm font-medium transition-colors ${value === "no" ? "bg-foreground text-background" : "bg-muted text-muted-foreground hover:bg-muted/80"}`}
        >
          No
        </button>
      </div>
    </div>
  );
}

export default function IntakePage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const preselectedClientId = searchParams.get("clientId") ?? "";

  const [clients, setClients] = useState<Client[]>([]);
  const [clientId, setClientId] = useState(preselectedClientId);
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<FormData>(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ aiSummary: string; redFlags: Array<{ issue: string; severity: string; recommendedAction: string }> } | null>(null);

  useEffect(() => {
    fetch("/api/clients").then((r) => r.json()).then(setClients);
  }, []);

  function set(field: keyof FormData) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setForm((prev) => ({ ...prev, [field]: e.target.value }));
  }

  async function submit() {
    if (!clientId) { toast.error("Select a client"); return; }
    setSubmitting(true);
    try {
      const res = await fetch("/api/ai/intake-extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId, formData: form }),
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setResult({ aiSummary: data.aiSummary, redFlags: data.redFlags ?? [] });
      toast.success("Intake processed by Atlas AI");
    } catch {
      toast.error("Failed to process intake. Check API key.");
    } finally {
      setSubmitting(false);
    }
  }

  if (result) {
    return (
      <div className="p-8 max-w-2xl">
        <div className="flex items-center gap-2 mb-6">
          <CheckCircle className="w-5 h-5 text-emerald-600" />
          <h1 className="text-xl font-bold">Intake Complete</h1>
        </div>

        <Card className="mb-4">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">AI Client Summary</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm leading-relaxed text-muted-foreground">{result.aiSummary}</p>
          </CardContent>
        </Card>

        {result.redFlags.length > 0 && (
          <Card className="mb-4 border-red-200 bg-red-50/50">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold text-red-700 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4" />
                Red Flags ({result.redFlags.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {result.redFlags.map((flag, i) => (
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

        <div className="flex gap-3">
          <Button onClick={() => router.push(`/clients/${clientId}`)}>
            View Client
          </Button>
          <Button variant="outline" onClick={() => { setResult(null); setStep(0); setForm(EMPTY_FORM); }}>
            New Intake
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8 max-w-2xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">New Intake</h1>
        <p className="text-muted-foreground text-sm mt-0.5">
          Client fills this out on your laptop/iPad. AI processes it on submission.
        </p>
      </div>

      {/* Client selector */}
      <div className="mb-6">
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

      {/* Progress */}
      <div className="flex gap-1 mb-6">
        {STEPS.map((s, i) => (
          <div key={s} className="flex-1">
            <div className={`h-1 rounded-full transition-colors ${i <= step ? "bg-primary" : "bg-muted"}`} />
            <p className={`text-xs mt-1 ${i === step ? "text-foreground font-medium" : "text-muted-foreground"}`}>
              {s}
            </p>
          </div>
        ))}
      </div>

      {/* Step content */}
      <Card className="mb-6">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold">Step {step + 1}: {STEPS[step]}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {step === 0 && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Age</Label>
                  <Input value={form.age} onChange={set("age")} placeholder="28" />
                </div>
                <div className="space-y-1.5">
                  <Label>Sex</Label>
                  <Select value={form.sex} onValueChange={(v) => { if (v) setForm({ ...form, sex: v }); }}>
                    <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="male">Male</SelectItem>
                      <SelectItem value="female">Female</SelectItem>
                      <SelectItem value="other">Other / prefer not to say</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Occupation</Label>
                <Input value={form.occupation} onChange={set("occupation")} placeholder="e.g. Software engineer, nurse, teacher..." />
              </div>
              <div className="space-y-1.5">
                <Label>Training background</Label>
                <Textarea value={form.trainingHistory} onChange={set("trainingHistory")} rows={3} placeholder="What have you done before? Gym experience, sports, classes..." />
              </div>
              <div className="space-y-1.5">
                <Label>Years of consistent training</Label>
                <Input value={form.yearsTraining} onChange={set("yearsTraining")} placeholder="e.g. 2 years, 6 months, just starting" />
              </div>
            </>
          )}
          {step === 1 && (
            <>
              <div className="space-y-1.5">
                <Label>Primary goal</Label>
                <Select value={form.primaryGoal} onValueChange={(v) => { if (v) setForm({ ...form, primaryGoal: v }); }}>
                  <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="weight_loss">Lose weight / body recomposition</SelectItem>
                    <SelectItem value="hypertrophy">Build muscle</SelectItem>
                    <SelectItem value="pain_mgmt">Move better / reduce pain</SelectItem>
                    <SelectItem value="performance">Athletic performance</SelectItem>
                    <SelectItem value="general">General health and fitness</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Secondary goals or specifics</Label>
                <Textarea value={form.secondaryGoals} onChange={set("secondaryGoals")} rows={2} placeholder="e.g. Run a 5K, fit in my suit again, reduce lower back pain..." />
              </div>
              <div className="space-y-1.5">
                <Label>Timeline</Label>
                <Input value={form.targetTimeline} onChange={set("targetTimeline")} placeholder="e.g. I have a wedding in 4 months, no rush, etc." />
              </div>
            </>
          )}
          {step === 2 && (
            <>
              <div className="space-y-1.5">
                <Label>Current injuries or pain</Label>
                <Textarea value={form.currentInjuries} onChange={set("currentInjuries")} rows={3} placeholder="Any current pain, discomfort, or movement restrictions? Where? How long?" />
              </div>
              <div className="space-y-1.5">
                <Label>Past injuries or surgeries</Label>
                <Textarea value={form.pastInjuries} onChange={set("pastInjuries")} rows={3} placeholder="Any past injuries, surgeries, or chronic issues?" />
              </div>
              <div className="space-y-1.5">
                <Label>Current medications</Label>
                <Input value={form.medications} onChange={set("medications")} placeholder="List any medications, or 'none'" />
              </div>
              <div className="space-y-1.5">
                <Label>Diagnosed medical conditions</Label>
                <Input value={form.medicalConditions} onChange={set("medicalConditions")} placeholder="e.g. Type 2 diabetes, hypertension, none..." />
              </div>
            </>
          )}
          {step === 3 && (
            <div>
              <p className="text-xs text-muted-foreground mb-4">
                Physical Activity Readiness Questionnaire (PAR-Q+). Answer honestly.
              </p>
              <YesNoField
                label="Has your doctor ever said you have a heart condition or high blood pressure?"
                value={form.heartCondition}
                onChange={(v) => setForm({ ...form, heartCondition: v })}
              />
              <YesNoField
                label="Do you feel pain in your chest at rest, during daily activities, or during exercise?"
                value={form.chestPain}
                onChange={(v) => setForm({ ...form, chestPain: v })}
              />
              <YesNoField
                label="Do you lose balance because of dizziness, or have you lost consciousness in the past 12 months?"
                value={form.dizziness}
                onChange={(v) => setForm({ ...form, dizziness: v })}
              />
              <YesNoField
                label="Have you ever been diagnosed with a bone or joint problem that could be worsened by exercise?"
                value={form.boneJointProblem}
                onChange={(v) => setForm({ ...form, boneJointProblem: v })}
              />
              <YesNoField
                label="Are you currently taking prescribed medications for blood pressure or a heart condition?"
                value={form.bloodPressureMeds}
                onChange={(v) => setForm({ ...form, bloodPressureMeds: v })}
              />
              <YesNoField
                label="Do you know of any other reason why you should not participate in physical activity?"
                value={form.otherReason}
                onChange={(v) => setForm({ ...form, otherReason: v })}
              />
            </div>
          )}
          {step === 4 && (
            <>
              <div className="space-y-1.5">
                <Label>Sleep (hours per night average)</Label>
                <Input value={form.sleepHours} onChange={set("sleepHours")} placeholder="e.g. 7" />
              </div>
              <div className="space-y-1.5">
                <Label>Stress level (1–10)</Label>
                <Input value={form.stressLevel} onChange={set("stressLevel")} placeholder="1 = zen, 10 = on fire" />
              </div>
              <div className="space-y-1.5">
                <Label>Current nutrition habits</Label>
                <Textarea value={form.nutritionBaseline} onChange={set("nutritionBaseline")} rows={3} placeholder="How do you eat day-to-day? Any dietary restrictions? Do you track anything?" />
              </div>
              <div className="space-y-1.5">
                <Label>Daily water intake</Label>
                <Input value={form.waterIntake} onChange={set("waterIntake")} placeholder="e.g. 64oz, 1 liter, not enough..." />
              </div>
            </>
          )}
          {step === 5 && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Session length preference</Label>
                  <Select value={form.sessionLength} onValueChange={(v) => { if (v) setForm({ ...form, sessionLength: v }); }}>
                    <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="30">30 minutes</SelectItem>
                      <SelectItem value="45">45 minutes</SelectItem>
                      <SelectItem value="60">60 minutes</SelectItem>
                      <SelectItem value="75">75 minutes</SelectItem>
                      <SelectItem value="90">90 minutes</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Sessions per week</Label>
                  <Select value={form.sessionsPerWeek} onValueChange={(v) => { if (v) setForm({ ...form, sessionsPerWeek: v }); }}>
                    <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1">1x / week</SelectItem>
                      <SelectItem value="2">2x / week</SelectItem>
                      <SelectItem value="3">3x / week</SelectItem>
                      <SelectItem value="4">4x / week</SelectItem>
                      <SelectItem value="5+">5+ / week</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Equipment available</Label>
                <Textarea value={form.equipment} onChange={set("equipment")} rows={2} placeholder="Full gym, home gym (describe), bands only, etc." />
              </div>
              <div className="space-y-1.5">
                <Label>Exercise dislikes or hard limits</Label>
                <Textarea value={form.dislikes} onChange={set("dislikes")} rows={2} placeholder="e.g. hate running, bad knees so no high-impact, don't want to do Olympic lifts..." />
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Nav buttons */}
      <div className="flex justify-between">
        <Button
          variant="outline"
          onClick={() => setStep((s) => s - 1)}
          disabled={step === 0}
        >
          <ChevronLeft className="w-4 h-4 mr-1" />
          Back
        </Button>
        {step < STEPS.length - 1 ? (
          <Button onClick={() => setStep((s) => s + 1)}>
            Next
            <ChevronRight className="w-4 h-4 ml-1" />
          </Button>
        ) : (
          <Button onClick={submit} disabled={submitting || !clientId}>
            {submitting ? (
              <>
                <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
                Processing...
              </>
            ) : (
              "Submit & Process with AI"
            )}
          </Button>
        )}
      </div>
    </div>
  );
}
