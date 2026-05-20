"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { ArrowLeft, ChevronDown, ChevronUp, Loader2, Zap } from "lucide-react";
import { saveMeasurement } from "@/lib/actions/measurements";

function Section({
  title,
  children,
  defaultOpen = true,
}: {
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border rounded-lg overflow-hidden">
      <button
        type="button"
        className="w-full flex items-center justify-between px-4 py-3 bg-muted/40 text-sm font-medium hover:bg-muted/60 transition-colors"
        onClick={() => setOpen((v) => !v)}
      >
        {title}
        {open ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
      </button>
      {open && <div className="px-4 py-3 space-y-3">{children}</div>}
    </div>
  );
}

function NumericField({
  label,
  value,
  onChange,
  placeholder,
  unit,
  step = "0.1",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  unit?: string;
  step?: string;
}) {
  return (
    <div>
      <label className="text-xs font-medium text-muted-foreground mb-1 block">
        {label}
        {unit && <span className="ml-1 text-muted-foreground/60">({unit})</span>}
      </label>
      <Input
        type="number"
        step={step}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder ?? "—"}
        className="h-9"
      />
    </div>
  );
}

export default function NewMeasurementPage() {
  const { id: clientId } = useParams<{ id: string }>();
  const router = useRouter();

  const today = new Date().toISOString().slice(0, 10);
  const [inbodyMode, setInbodyMode] = useState(false);
  const [saving, setSaving] = useState(false);

  // Form fields
  const [measuredAt, setMeasuredAt] = useState(today);
  const [source, setSource] = useState<"manual" | "inbody" | "other">("manual");
  const [bodyWeightKg, setBodyWeightKg] = useState("");
  const [bodyFatPct, setBodyFatPct] = useState("");
  const [leanMassKg, setLeanMassKg] = useState("");
  const [visceralFat, setVisceralFat] = useState("");
  const [waistCm, setWaistCm] = useState("");
  const [hipsCm, setHipsCm] = useState("");
  const [chestCm, setChestCm] = useState("");
  const [armCm, setArmCm] = useState("");
  const [thighCm, setThighCm] = useState("");
  const [painRating, setPainRating] = useState("");
  const [notes, setNotes] = useState("");

  function num(v: string): number | null {
    const n = parseFloat(v);
    return isNaN(n) ? null : n;
  }

  async function handleSave() {
    setSaving(true);
    try {
      await saveMeasurement({
        clientId,
        measuredAt,
        source,
        bodyWeightKg: num(bodyWeightKg),
        bodyFatPct: num(bodyFatPct),
        leanMassKg: num(leanMassKg),
        visceralFat: num(visceralFat),
        waistCm: num(waistCm),
        hipsCm: num(hipsCm),
        chestCm: num(chestCm),
        armCm: num(armCm),
        thighCm: num(thighCm),
        painRating: painRating ? parseInt(painRating, 10) : null,
        notes: notes || undefined,
      });
      toast.success("Measurement saved");
      router.push(`/clients/${clientId}/progress/body`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  function toggleInbody() {
    const next = !inbodyMode;
    setInbodyMode(next);
    if (next) setSource("inbody");
    else setSource("manual");
  }

  return (
    <div className="p-4 md:p-8 max-w-xl">
      <Link
        href={`/clients/${clientId}/progress/body`}
        className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "mb-4 -ml-2")}
      >
        <ArrowLeft className="w-4 h-4 mr-1" />
        Back to body progress
      </Link>

      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold tracking-tight">Log measurement</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            All fields optional — enter what you have.
          </p>
        </div>
        <button
          type="button"
          onClick={toggleInbody}
          className={cn(
            "flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full border font-medium transition-colors",
            inbodyMode
              ? "bg-violet-50 text-violet-700 border-violet-300"
              : "bg-background text-muted-foreground border-border hover:border-foreground"
          )}
        >
          <Zap className="w-3.5 h-3.5" />
          {inbodyMode ? "InBody mode" : "Quick InBody"}
        </button>
      </div>

      <div className="space-y-4">
        {/* Date + source */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Date</label>
            <Input
              type="date"
              value={measuredAt}
              onChange={(e) => setMeasuredAt(e.target.value)}
              className="h-9"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Source</label>
            <select
              value={source}
              onChange={(e) => setSource(e.target.value as "manual" | "inbody" | "other")}
              className="w-full h-9 text-sm rounded-md border border-input px-3 bg-background"
            >
              <option value="manual">Manual</option>
              <option value="inbody">InBody scan</option>
              <option value="other">Other scan</option>
            </select>
          </div>
        </div>

        {/* InBody quick-entry mode */}
        {inbodyMode ? (
          <Section title="InBody reading" defaultOpen>
            <div className="grid grid-cols-2 gap-3">
              <NumericField label="Body weight" value={bodyWeightKg} onChange={setBodyWeightKg} unit="kg" />
              <NumericField label="Body fat %" value={bodyFatPct} onChange={setBodyFatPct} unit="%" step="0.1" />
              <NumericField label="Lean mass" value={leanMassKg} onChange={setLeanMassKg} unit="kg" />
              <NumericField label="Visceral fat" value={visceralFat} onChange={setVisceralFat} unit="rating" step="0.5" />
            </div>
          </Section>
        ) : (
          <>
            <Section title="Body composition" defaultOpen>
              <div className="grid grid-cols-2 gap-3">
                <NumericField label="Body weight" value={bodyWeightKg} onChange={setBodyWeightKg} unit="kg" />
                <NumericField label="Body fat %" value={bodyFatPct} onChange={setBodyFatPct} unit="%" step="0.1" />
                <NumericField label="Lean mass" value={leanMassKg} onChange={setLeanMassKg} unit="kg" />
                <NumericField label="Visceral fat" value={visceralFat} onChange={setVisceralFat} unit="rating" step="0.5" />
              </div>
            </Section>

            <Section title="Circumferences" defaultOpen={false}>
              <div className="grid grid-cols-2 gap-3">
                <NumericField label="Waist" value={waistCm} onChange={setWaistCm} unit="cm" />
                <NumericField label="Hips" value={hipsCm} onChange={setHipsCm} unit="cm" />
                <NumericField label="Chest" value={chestCm} onChange={setChestCm} unit="cm" />
                <NumericField label="Arm" value={armCm} onChange={setArmCm} unit="cm" />
                <NumericField label="Thigh" value={thighCm} onChange={setThighCm} unit="cm" />
              </div>
            </Section>

            <Section title="Pain rating (0 = no pain, 10 = severe)" defaultOpen={false}>
              <div className="flex items-center gap-3">
                <Input
                  type="range"
                  min={0}
                  max={10}
                  step={1}
                  value={painRating || "0"}
                  onChange={(e) => setPainRating(e.target.value)}
                  className="flex-1 h-9"
                />
                <span className="text-sm font-mono w-6 text-center">{painRating || "0"}</span>
              </div>
            </Section>
          </>
        )}

        {/* Notes */}
        <div>
          <label className="text-xs font-medium text-muted-foreground mb-1 block">Notes</label>
          <Textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Optional context, how they felt, coach observations..."
            rows={3}
            className="resize-none"
            style={{ fontSize: 16 }}
          />
        </div>

        <Button onClick={handleSave} disabled={saving} className="w-full" size="lg">
          {saving ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Saving...</> : "Save measurement"}
        </Button>
      </div>
    </div>
  );
}
