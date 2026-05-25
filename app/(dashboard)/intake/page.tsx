"use client";

import { useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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
import { CheckCircle, AlertTriangle, Loader2, Upload, Plus } from "lucide-react";

type Client = { id: string; fullName: string };

type FormData = {
  // Demographics
  date: string;
  phoneNumber: string;
  email: string;
  weight: string;
  height: string;
  age: string;
  fatMass: string;
  leanMass: string;
  bfp: string;
  vf: string;
  pacemakerOrPregnant: string;
  // Goals
  goal1: string;
  goal2: string;
  goal3: string;
  whyImportant: string;
  // Exercise
  currentExercise: string;
  neatMovementJob: string;
  // Nutrition
  nutritionBreakfast: string;
  nutritionLunch: string;
  nutritionDinner: string;
  nutritionSnacks: string;
  nutritionDrinks: string;
  nutritionSupplements: string;
  suggestedLTH: string;
  // Coaching & Classes
  priorCoaching: string;
  classRecommendations: string;
  // Motivation
  biggestMotivation: string;
  biggestChallenge: string;
  supportSystem: string;
  // Scheduling
  daysPerWeek: string;
  preferredTime: string;
  // Medical
  injuriesMedications: string;
  // Confidence
  confidenceScore: string;
  limitingFactor: string;
  // Notes
  additionalNotes: string;
};

const EMPTY_FORM: FormData = {
  date: "", phoneNumber: "", email: "",
  weight: "", height: "", age: "",
  fatMass: "", leanMass: "", bfp: "", vf: "",
  pacemakerOrPregnant: "no",
  goal1: "", goal2: "", goal3: "",
  whyImportant: "",
  currentExercise: "", neatMovementJob: "",
  nutritionBreakfast: "", nutritionLunch: "", nutritionDinner: "",
  nutritionSnacks: "", nutritionDrinks: "", nutritionSupplements: "",
  suggestedLTH: "",
  priorCoaching: "", classRecommendations: "",
  biggestMotivation: "", biggestChallenge: "",
  supportSystem: "",
  daysPerWeek: "", preferredTime: "",
  injuriesMedications: "",
  confidenceScore: "", limitingFactor: "",
  additionalNotes: "",
};

function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <div className="pt-6 pb-2 border-b border-border mb-4">
      <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {children}
      </h2>
    </div>
  );
}

function YesNoField({
  label,
  value,
  onChange,
  warning,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  warning?: string;
}) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => onChange("yes")}
          className={`px-3 py-1.5 rounded text-sm font-medium transition-colors ${
            value === "yes"
              ? "bg-primary text-white"
              : "bg-muted text-muted-foreground hover:bg-muted/80"
          }`}
        >
          Yes
        </button>
        <button
          type="button"
          onClick={() => onChange("no")}
          className={`px-3 py-1.5 rounded text-sm font-medium transition-colors ${
            value === "no"
              ? "bg-foreground text-background"
              : "bg-muted text-muted-foreground hover:bg-muted/80"
          }`}
        >
          No
        </button>
      </div>
      {value === "yes" && warning && (
        <p className="text-xs text-amber-600 font-medium flex items-center gap-1">
          <AlertTriangle className="w-3 h-3" />
          {warning}
        </p>
      )}
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
  const [form, setForm] = useState<FormData>(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{
    aiSummary: string;
    redFlags: Array<{ issue: string; severity: string; recommendedAction: string }>;
  } | null>(null);

  // Pre-fill today's date
  useEffect(() => {
    const today = new Date().toISOString().split("T")[0];
    setForm((prev) => ({ ...prev, date: today }));
  }, []);

  useEffect(() => {
    fetch("/api/clients")
      .then((r) => r.json())
      .then((data) => setClients(Array.isArray(data) ? data : []));
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
    if (!clientId) {
      toast.error("Select a client");
      return;
    }
    setSubmitting(true);
    try {
      let res: Response;
      if (mode === "pdf") {
        if (!pdfFile) {
          toast.error("Select a PDF file");
          setSubmitting(false);
          return;
        }
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

  // ── Result screen ──────────────────────────────────────────────────────────
  if (result) {
    return (
      <div className="p-4 sm:p-8 max-w-2xl">
        <div className="flex items-center gap-2 mb-6">
          <CheckCircle className="w-5 h-5 text-emerald-600" />
          <h1 className="text-xl font-bold">Intake Complete</h1>
        </div>

        <Card className="mb-4">
          <CardContent className="pt-5">
            <p className="text-xs font-semibold text-muted-foreground mb-2">AI CLIENT SUMMARY</p>
            <p className="text-sm leading-relaxed text-muted-foreground">{result.aiSummary}</p>
          </CardContent>
        </Card>

        {result.redFlags.length > 0 && (
          <Card className="mb-4 border-red-200 bg-red-50/50">
            <CardContent className="pt-5">
              <p className="text-xs font-semibold text-red-700 flex items-center gap-1.5 mb-3">
                <AlertTriangle className="w-3.5 h-3.5" />
                RED FLAGS ({result.redFlags.length})
              </p>
              <div className="space-y-2">
                {result.redFlags.map((flag, i) => (
                  <div key={i} className="p-3 bg-white rounded border border-red-100">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-medium text-red-800">{flag.issue}</span>
                      <Badge
                        variant="outline"
                        className={
                          flag.severity === "high"
                            ? "border-red-300 text-red-700"
                            : flag.severity === "medium"
                            ? "border-amber-300 text-amber-700"
                            : "border-zinc-300 text-zinc-600"
                        }
                      >
                        {flag.severity}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">{flag.recommendedAction}</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        <div className="flex gap-3">
          <Button onClick={() => router.push(`/clients/${clientId}`)}>View Client</Button>
          <Button
            variant="outline"
            onClick={() => {
              setResult(null);
              setForm({ ...EMPTY_FORM, date: new Date().toISOString().split("T")[0] });
            }}
          >
            New Intake
          </Button>
        </div>
      </div>
    );
  }

  // ── Main form ──────────────────────────────────────────────────────────────
  return (
    <div className="p-4 sm:p-8 max-w-2xl">
      {/* Header */}
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Goal Setting Session</h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            {mode === "form"
              ? "Fill out with your client."
              : "Upload an existing intake PDF to extract."}
          </p>
        </div>
        <div className="flex gap-1 bg-muted rounded-lg p-1 shrink-0">
          <button
            onClick={() => setMode("form")}
            className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
              mode === "form" ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Form
          </button>
          <button
            onClick={() => setMode("pdf")}
            className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors flex items-center gap-1.5 ${
              mode === "pdf" ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground"
            }`}
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
          <SelectTrigger className="w-full sm:w-64">
            <SelectValue placeholder="Select client..." />
          </SelectTrigger>
          <SelectContent>
            {clients.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.fullName}
              </SelectItem>
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
              <p className="text-xs text-muted-foreground mt-2">
                {pdfFile.name} ({(pdfFile.size / 1024).toFixed(0)} KB)
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {/* ── Continuous form ─────────────────────────────────────────────────── */}
      {mode === "form" && (
        <div className="space-y-5">

          {/* ── Demographics ── */}
          <SectionHeader>Demographics</SectionHeader>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Date</Label>
              <Input type="date" value={form.date} onChange={set("date")} />
            </div>
            <div className="space-y-1.5">
              <Label>Age</Label>
              <Input value={form.age} onChange={set("age")} placeholder="28" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Phone Number</Label>
              <Input value={form.phoneNumber} onChange={set("phoneNumber")} placeholder="(555) 000-0000" />
            </div>
            <div className="space-y-1.5">
              <Label>Email</Label>
              <Input type="email" value={form.email} onChange={set("email")} placeholder="client@email.com" />
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
              <Label>BFP</Label>
              <Input value={form.bfp} onChange={set("bfp")} placeholder="%" />
            </div>
            <div className="space-y-1.5">
              <Label>VF</Label>
              <Input value={form.vf} onChange={set("vf")} placeholder="1–20" />
            </div>
          </div>

          <YesNoField
            label="Pacemaker or Pregnant?"
            value={form.pacemakerOrPregnant}
            onChange={(v) => setForm({ ...form, pacemakerOrPregnant: v })}
            warning="DO NOT perform InBody scan."
          />

          {/* ── Goals ── */}
          <SectionHeader>Goals</SectionHeader>

          <div className="space-y-2">
            <Label>
              Why did you join LT and what are your most important health &amp; fitness goals?
            </Label>
            <div className="space-y-2 pl-1">
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground w-4 shrink-0">1.</span>
                <Input value={form.goal1} onChange={set("goal1")} placeholder="First goal..." />
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground w-4 shrink-0">2.</span>
                <Input value={form.goal2} onChange={set("goal2")} placeholder="Second goal..." />
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground w-4 shrink-0">3.</span>
                <Input value={form.goal3} onChange={set("goal3")} placeholder="Third goal..." />
              </div>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>
              Why is it important to achieve those goals and how will your life change once you
              achieve them?
            </Label>
            <Textarea
              value={form.whyImportant}
              onChange={set("whyImportant")}
              rows={3}
              placeholder="What's the deeper motivation?"
            />
          </div>

          {/* ── Exercise & Movement ── */}
          <SectionHeader>Exercise &amp; Movement</SectionHeader>

          <div className="space-y-1.5">
            <Label>What are you currently doing for exercise &amp; movement weekly?</Label>
            <Textarea
              value={form.currentExercise}
              onChange={set("currentExercise")}
              rows={3}
              placeholder="Types of exercise, frequency, duration..."
            />
          </div>

          <div className="space-y-1.5">
            <Label>NEAT Movement / Job</Label>
            <Input
              value={form.neatMovementJob}
              onChange={set("neatMovementJob")}
              placeholder="e.g. desk job, on feet all day, construction..."
            />
          </div>

          {/* ── Nutrition ── */}
          <SectionHeader>Nutrition</SectionHeader>

          <p className="text-sm text-muted-foreground -mt-2">Describe a typical day of nutrition:</p>

          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Breakfast</Label>
              <Input value={form.nutritionBreakfast} onChange={set("nutritionBreakfast")} placeholder="Typical breakfast?" />
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
              <Input
                value={form.nutritionDrinks}
                onChange={set("nutritionDrinks")}
                placeholder="Coffee, energy drinks, alcohol frequency, water oz..."
              />
            </div>
            <div className="space-y-1.5">
              <Label>Current Supplements</Label>
              <Input
                value={form.nutritionSupplements}
                onChange={set("nutritionSupplements")}
                placeholder="Protein powder, creatine, vitamins, none..."
              />
            </div>
            <div className="space-y-1.5">
              <Label>Suggested LTH</Label>
              <Input value={form.suggestedLTH} onChange={set("suggestedLTH")} placeholder="" />
            </div>
          </div>

          {/* ── Coaching & Classes ── */}
          <SectionHeader>Coaching &amp; Classes</SectionHeader>

          <div className="space-y-1.5">
            <Label>Have you worked w/ a nutrition or fitness coach in the past?</Label>
            <Textarea
              value={form.priorCoaching}
              onChange={set("priorCoaching")}
              rows={2}
              placeholder="If yes, what worked? What didn't?"
            />
          </div>

          <div className="space-y-1.5">
            <Label>Class Recommendations (if needed)</Label>
            <Input value={form.classRecommendations} onChange={set("classRecommendations")} placeholder="" />
          </div>

          {/* ── Motivation & Mindset ── */}
          <SectionHeader>Motivation &amp; Mindset</SectionHeader>

          <div className="space-y-1.5">
            <Label>What is your biggest motivation?</Label>
            <Input value={form.biggestMotivation} onChange={set("biggestMotivation")} placeholder="What gets you out of bed?" />
          </div>

          <div className="space-y-1.5">
            <Label>What is your biggest challenge?</Label>
            <Input value={form.biggestChallenge} onChange={set("biggestChallenge")} placeholder="What has gotten in the way before?" />
          </div>

          <div className="space-y-1.5">
            <Label>Do you have a support system? What do they think about your goals?</Label>
            <Textarea
              value={form.supportSystem}
              onChange={set("supportSystem")}
              rows={2}
              placeholder="Spouse, friends, family — are they on board?"
            />
          </div>

          {/* ── Schedule ── */}
          <SectionHeader>Schedule</SectionHeader>

          <div className="space-y-1.5">
            <Label>
              How many days a week do you plan on consistently exercising, and which days are best?
            </Label>
            <Textarea
              value={form.daysPerWeek}
              onChange={set("daysPerWeek")}
              rows={2}
              placeholder="e.g. 3x/week — Mon, Wed, Fri work best"
            />
          </div>

          <div className="space-y-1.5">
            <Label>What time of day works best for you?</Label>
            <Input value={form.preferredTime} onChange={set("preferredTime")} placeholder="e.g. early morning, evenings after 6pm..." />
          </div>

          {/* ── Injuries & Medical ── */}
          <SectionHeader>Injuries &amp; Medical</SectionHeader>

          <div className="space-y-1.5">
            <Label>Any injuries or medications I need to know about?</Label>
            <Textarea
              value={form.injuriesMedications}
              onChange={set("injuriesMedications")}
              rows={3}
              placeholder="Current injuries, past surgeries, medications, medical conditions..."
            />
          </div>

          {/* ── Confidence Check ── */}
          <SectionHeader>Confidence Check</SectionHeader>

          <div className="space-y-1.5">
            <Label>
              On a scale of 1–10, how confident are you in achieving the goals we discussed in the
              time frame we set?
            </Label>
            <Select
              value={form.confidenceScore}
              onValueChange={(v) => {
                if (v) setForm({ ...form, confidenceScore: v });
              }}
            >
              <SelectTrigger className="w-32">
                <SelectValue placeholder="1–10" />
              </SelectTrigger>
              <SelectContent>
                {["1", "2", "3", "4", "5", "6", "7", "8", "9", "10"].map((n) => (
                  <SelectItem key={n} value={n}>
                    {n}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {form.confidenceScore && parseInt(form.confidenceScore) < 10 && (
            <div className="space-y-1.5">
              <Label>If lower than 10, what is the limiting factor?</Label>
              <Textarea
                value={form.limitingFactor}
                onChange={set("limitingFactor")}
                rows={2}
                placeholder="What would need to change to make it a 10?"
              />
            </div>
          )}

          {/* ── Additional Notes ── */}
          <SectionHeader>Additional Notes</SectionHeader>

          <div className="space-y-1.5">
            <Textarea
              value={form.additionalNotes}
              onChange={set("additionalNotes")}
              rows={4}
              placeholder="Any other notes from this session..."
            />
          </div>

          {/* Submit */}
          <div className="pt-4 pb-8">
            <Button
              onClick={submit}
              disabled={submitting || !clientId}
              className="w-full sm:w-auto"
              size="lg"
            >
              {submitting ? (
                <>
                  <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
                  Processing...
                </>
              ) : (
                "Submit & Process with AI"
              )}
            </Button>
          </div>
        </div>
      )}

      {/* PDF submit */}
      {mode === "pdf" && (
        <Button
          onClick={submit}
          disabled={submitting || !clientId || !pdfFile}
          className="w-full sm:w-auto"
          size="lg"
        >
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
  );
}
