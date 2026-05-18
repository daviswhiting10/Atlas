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
import { ChevronRight, ChevronLeft, CheckCircle, AlertTriangle, Loader2, Upload, Plus } from "lucide-react";

type Client = { id: string; fullName: string };

type FormData = {
  // Step 0: Demographics
  age: string;
  sex: string;
  weight: string;
  height: string;
  occupation: string;
  trainingHistory: string;
  yearsTraining: string;
  fatMass: string;
  leanMass: string;
  bfp: string;
  vf: string;
  // Step 1: Goals
  primaryGoal: string;
  secondaryGoals: string;
  targetTimeline: string;
  whyImportant: string;
  // Step 2: Injury & Medical
  currentInjuries: string;
  pastInjuries: string;
  medications: string;
  medicalConditions: string;
  priorCoaching: string;
  // Step 3: PAR-Q+
  heartCondition: string;
  chestPain: string;
  dizziness: string;
  boneJointProblem: string;
  bloodPressureMeds: string;
  otherReason: string;
  // Step 4: Lifestyle & Nutrition
  sleepHours: string;
  stressLevel: string;
  nutritionBreakfast: string;
  nutritionLunch: string;
  nutritionDinner: string;
  nutritionSnacks: string;
  nutritionDrinks: string;
  nutritionSupplements: string;
  waterIntake: string;
  supportSystem: string;
  biggestMotivation: string;
  biggestChallenge: string;
  // Step 5: Preferences & Wrap-Up
  sessionLength: string;
  sessionsPerWeek: string;
  preferredDays: string;
  preferredTime: string;
  equipment: string;
  dislikes: string;
  confidenceScore: string;
  limitingFactor: string;
};

const STEPS = [
  "Demographics",
  "Goals",
  "Injury History",
  "PAR-Q+",
  "Lifestyle & Nutrition",
  "Preferences",
];

const EMPTY_FORM: FormData = {
  age: "", sex: "", weight: "", height: "", occupation: "", trainingHistory: "", yearsTraining: "",
  fatMass: "", leanMass: "", bfp: "", vf: "",
  primaryGoal: "", secondaryGoals: "", targetTimeline: "", whyImportant: "",
  currentInjuries: "", pastInjuries: "", medications: "", medicalConditions: "", priorCoaching: "",
  heartCondition: "no", chestPain: "no", dizziness: "no", boneJointProblem: "no",
  bloodPressureMeds: "no", otherReason: "no",
  sleepHours: "", stressLevel: "",
  nutritionBreakfast: "", nutritionLunch: "", nutritionDinner: "", nutritionSnacks: "",
  nutritionDrinks: "", nutritionSupplements: "",
  waterIntake: "", supportSystem: "", biggestMotivation: "", biggestChallenge: "",
  sessionLength: "", sessionsPerWeek: "", preferredDays: "", preferredTime: "",
  equipment: "", dislikes: "", confidenceScore: "", limitingFactor: "",
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
  const [mode, setMode] = useState<"form" | "pdf">("form");
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<FormData>(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ aiSummary: string; redFlags: Array<{ issue: string; severity: string; recommendedAction: string }> } | null>(null);

  useEffect(() => {
    fetch("/api/clients").then((r) => r.json()).then((data) => setClients(Array.isArray(data) ? data : []));
  }, []);

  function set(field: keyof FormData) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setForm((prev) => ({ ...prev, [field]: e.target.value }));
  }

  function handleClientSelect(v: string) {
    if (v === "__new__") {
      router.push("/clients");
      return;
    }
    setClientId(v);
  }

  async function submit() {
    if (!clientId) { toast.error("Select a client"); return; }
    setSubmitting(true);
    try {
      let res: Response;
      if (mode === "pdf") {
        if (!pdfFile) { toast.error("Select a PDF file"); setSubmitting(false); return; }
        const fd = new FormData();
        fd.append("clientId", clientId);
        fd.append("file", pdfFile);
        res = await fetch("/api/ai/intake-pdf", { method: "POST", body: fd });
      } else {
        res = await fetch("/api/ai/intake-extract", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ clientId, formData: form }),
        });
      }
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
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">New Intake</h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            {mode === "form" ? "Client fills this out on your laptop/iPad." : "Upload an existing intake PDF to extract."}
          </p>
        </div>
        <div className="flex gap-1 bg-muted rounded-lg p-1">
          <button
            onClick={() => setMode("form")}
            className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${mode === "form" ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
          >
            Form
          </button>
          <button
            onClick={() => setMode("pdf")}
            className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors flex items-center gap-1.5 ${mode === "pdf" ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
          >
            <Upload className="w-3.5 h-3.5" />
            PDF
          </button>
        </div>
      </div>

      {/* Client selector */}
      <div className="mb-6">
        <Label className="mb-1.5 block">Client</Label>
        <Select value={clientId} onValueChange={handleClientSelect}>
          <SelectTrigger className="w-64">
            <SelectValue placeholder="Select client..." />
          </SelectTrigger>
          <SelectContent>
            {clients.map((c) => (
              <SelectItem key={c.id} value={c.id}>{c.fullName}</SelectItem>
            ))}
            <SelectItem value="__new__">
              <span className="flex items-center gap-1.5 text-primary">
                <Plus className="w-3.5 h-3.5" />
                Add new client
              </span>
            </SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* PDF upload mode */}
      {mode === "pdf" && (
        <Card className="mb-6">
          <CardContent className="pt-6">
            <Label className="mb-2 block">Upload Intake PDF</Label>
            <input
              type="file"
              accept=".pdf"
              onChange={(e) => setPdfFile(e.target.files?.[0] ?? null)}
              className="block w-full text-sm text-muted-foreground file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-medium file:bg-primary file:text-primary-foreground hover:file:bg-primary/90 cursor-pointer"
            />
            {pdfFile && (
              <p className="text-xs text-muted-foreground mt-2">{pdfFile.name} ({(pdfFile.size / 1024).toFixed(0)} KB)</p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Progress (form mode only) */}
      {mode === "form" && <div className="flex gap-1 mb-6">
        {STEPS.map((s, i) => (
          <div key={s} className="flex-1">
            <div className={`h-1 rounded-full transition-colors ${i <= step ? "bg-primary" : "bg-muted"}`} />
            <p className={`text-xs mt-1 ${i === step ? "text-foreground font-medium" : "text-muted-foreground"}`}>
              {s}
            </p>
          </div>
        ))}
      </div>}

      {/* Step content (form mode only) */}
      {mode === "form" && <Card className="mb-6">
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
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Weight</Label>
                  <Input value={form.weight} onChange={set("weight")} placeholder="e.g. 185 lbs" />
                </div>
                <div className="space-y-1.5">
                  <Label>Height</Label>
                  <Input value={form.height} onChange={set("height")} placeholder={`e.g. 5'10"`} />
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
              <div className="pt-2 border-t border-border">
                <p className="text-xs font-medium text-muted-foreground mb-3">InBody Scan Results <span className="font-normal">(optional — fill after scan)</span></p>
                <div className="grid grid-cols-4 gap-3">
                  <div className="space-y-1.5">
                    <Label>Fat Mass</Label>
                    <Input value={form.fatMass} onChange={set("fatMass")} placeholder="lbs" />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Lean Mass</Label>
                    <Input value={form.leanMass} onChange={set("leanMass")} placeholder="lbs" />
                  </div>
                  <div className="space-y-1.5">
                    <Label>BFP %</Label>
                    <Input value={form.bfp} onChange={set("bfp")} placeholder="%" />
                  </div>
                  <div className="space-y-1.5">
                    <Label>VF Score</Label>
                    <Input value={form.vf} onChange={set("vf")} placeholder="1–20" />
                  </div>
                </div>
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
                <Textarea value={form.secondaryGoals} onChange={set("secondaryGoals")} rows={3} placeholder="List up to 3 additional goals — e.g. run a 5K, fit in my suit, reduce lower back pain..." />
              </div>
              <div className="space-y-1.5">
                <Label>Why is it important to achieve these goals? How will your life change?</Label>
                <Textarea value={form.whyImportant} onChange={set("whyImportant")} rows={3} placeholder="What's the deeper motivation? How will things be different when you get there?" />
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
              <div className="space-y-1.5">
                <Label>Have you worked with a nutrition or fitness coach before?</Label>
                <Textarea value={form.priorCoaching} onChange={set("priorCoaching")} rows={2} placeholder="If yes, what worked? What didn't?" />
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
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Sleep (hours/night)</Label>
                  <Input value={form.sleepHours} onChange={set("sleepHours")} placeholder="e.g. 7" />
                </div>
                <div className="space-y-1.5">
                  <Label>Stress level (1–10)</Label>
                  <Input value={form.stressLevel} onChange={set("stressLevel")} placeholder="1 = zen, 10 = on fire" />
                </div>
              </div>
              <div className="pt-2 border-t border-border">
                <p className="text-xs font-medium text-muted-foreground mb-3">Typical day of nutrition</p>
                <div className="space-y-3">
                  <div className="space-y-1.5">
                    <Label>Breakfast</Label>
                    <Input value={form.nutritionBreakfast} onChange={set("nutritionBreakfast")} placeholder="What do you typically eat for breakfast?" />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Lunch</Label>
                    <Input value={form.nutritionLunch} onChange={set("nutritionLunch")} placeholder="Typical lunch?" />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Dinner</Label>
                    <Input value={form.nutritionDinner} onChange={set("nutritionDinner")} placeholder="Typical dinner?" />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Snacks</Label>
                    <Input value={form.nutritionSnacks} onChange={set("nutritionSnacks")} placeholder="Any snacks throughout the day?" />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Drinks (caffeine / alcohol / water)</Label>
                    <Input value={form.nutritionDrinks} onChange={set("nutritionDrinks")} placeholder="Coffee, energy drinks, alcohol frequency, water oz..." />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Current supplements</Label>
                    <Input value={form.nutritionSupplements} onChange={set("nutritionSupplements")} placeholder="Protein powder, creatine, vitamins, none..." />
                  </div>
                </div>
              </div>
              <div className="pt-2 border-t border-border space-y-3">
                <div className="space-y-1.5">
                  <Label>Do you have a support system? What do they think about your goals?</Label>
                  <Textarea value={form.supportSystem} onChange={set("supportSystem")} rows={2} placeholder="Spouse, friends, family — are they on board?" />
                </div>
                <div className="space-y-1.5">
                  <Label>What is your biggest motivation?</Label>
                  <Input value={form.biggestMotivation} onChange={set("biggestMotivation")} placeholder="What gets you out of bed?" />
                </div>
                <div className="space-y-1.5">
                  <Label>What is your biggest challenge?</Label>
                  <Input value={form.biggestChallenge} onChange={set("biggestChallenge")} placeholder="What has gotten in the way before?" />
                </div>
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
                <Label>Preferred training days</Label>
                <Input value={form.preferredDays} onChange={set("preferredDays")} placeholder="e.g. Mon/Wed/Fri, weekdays only, weekends work best..." />
              </div>
              <div className="space-y-1.5">
                <Label>Preferred time of day</Label>
                <Select value={form.preferredTime} onValueChange={(v) => { if (v) setForm({ ...form, preferredTime: v }); }}>
                  <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="early_morning">Early morning (5–7 AM)</SelectItem>
                    <SelectItem value="morning">Morning (7–10 AM)</SelectItem>
                    <SelectItem value="midday">Midday (10 AM–1 PM)</SelectItem>
                    <SelectItem value="afternoon">Afternoon (1–5 PM)</SelectItem>
                    <SelectItem value="evening">Evening (5–8 PM)</SelectItem>
                    <SelectItem value="flexible">Flexible</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Equipment available</Label>
                <Textarea value={form.equipment} onChange={set("equipment")} rows={2} placeholder="Full gym, home gym (describe), bands only, etc." />
              </div>
              <div className="space-y-1.5">
                <Label>Exercise dislikes or hard limits</Label>
                <Textarea value={form.dislikes} onChange={set("dislikes")} rows={2} placeholder="e.g. hate running, bad knees so no high-impact, don't want to do Olympic lifts..." />
              </div>
              <div className="pt-2 border-t border-border">
                <p className="text-xs font-medium text-muted-foreground mb-3">Confidence Check</p>
                <div className="space-y-3">
                  <div className="space-y-1.5">
                    <Label>On a scale of 1–10, how confident are you in achieving the goals we discussed?</Label>
                    <Select value={form.confidenceScore} onValueChange={(v) => { if (v) setForm({ ...form, confidenceScore: v }); }}>
                      <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                      <SelectContent>
                        {["1","2","3","4","5","6","7","8","9","10"].map((n) => (
                          <SelectItem key={n} value={n}>{n}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  {form.confidenceScore && parseInt(form.confidenceScore) < 10 && (
                    <div className="space-y-1.5">
                      <Label>What is the limiting factor?</Label>
                      <Textarea value={form.limitingFactor} onChange={set("limitingFactor")} rows={2} placeholder="What would need to change to make it a 10?" />
                    </div>
                  )}
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>}

      {/* Nav buttons */}
      <div className="flex justify-between">
        {mode === "form" ? (
          <Button
            variant="outline"
            onClick={() => setStep((s) => s - 1)}
            disabled={step === 0}
          >
            <ChevronLeft className="w-4 h-4 mr-1" />
            Back
          </Button>
        ) : <div />}
        {mode === "form" && step < STEPS.length - 1 ? (
          <Button onClick={() => setStep((s) => s + 1)}>
            Next
            <ChevronRight className="w-4 h-4 ml-1" />
          </Button>
        ) : (
          <Button onClick={submit} disabled={submitting || !clientId || (mode === "pdf" && !pdfFile)}>
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
