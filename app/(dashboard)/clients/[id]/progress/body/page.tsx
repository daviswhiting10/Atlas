"use client";

import { useParams } from "next/navigation";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Plus } from "lucide-react";
import {
  ProgressShell,
  useProgressData,
  type ProgressData,
  type MeasurementRecord,
} from "../_components/ProgressShell";
import { WeightTrendChart } from "@/components/charts/WeightTrendChart";
import { format } from "date-fns";

function delta(
  current: number | null,
  first: number | null,
  unit: string,
  higherIsBetter?: boolean
): { display: string; positive: boolean } | null {
  if (current == null || first == null) return null;
  const diff = current - first;
  const positive = higherIsBetter ? diff > 0 : diff < 0;
  return {
    display: `${diff >= 0 ? "+" : ""}${diff.toFixed(1)} ${unit}`,
    positive,
  };
}

function MeasurementRow({ label, value, unit, change }: {
  label: string;
  value: number | null;
  unit: string;
  change?: { display: string; positive: boolean } | null;
}) {
  if (value == null) return null;
  return (
    <div className="flex items-center justify-between py-2 border-b last:border-0">
      <p className="text-sm text-muted-foreground">{label}</p>
      <div className="flex items-baseline gap-2">
        <p className="text-sm font-medium">
          {value.toFixed(1)} {unit}
        </p>
        {change && (
          <p
            className={cn(
              "text-xs font-medium",
              change.positive ? "text-emerald-600" : "text-red-500"
            )}
          >
            {change.display}
          </p>
        )}
      </div>
    </div>
  );
}

function BodyView({ data, clientId }: { data: ProgressData; clientId: string }) {
  const { weightSeries, measurements } = data;

  const first = measurements[0] ?? null;
  const last = measurements[measurements.length - 1] ?? null;

  const hasData = measurements.length > 0;

  return (
    <div className="space-y-5">
      {/* Header action */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {measurements.length} measurement{measurements.length !== 1 ? "s" : ""} logged
        </p>
        <Link
          href={`/clients/${clientId}/measurements/new`}
          className={cn(buttonVariants({ size: "sm" }), "h-8")}
        >
          <Plus className="w-3.5 h-3.5 mr-1" />
          Log measurement
        </Link>
      </div>

      {!hasData && (
        <div className="rounded-xl border border-dashed p-12 text-center text-muted-foreground">
          <p className="text-sm mb-3">No measurements logged yet.</p>
          <Link
            href={`/clients/${clientId}/measurements/new`}
            className={buttonVariants({ size: "sm" })}
          >
            Log first measurement
          </Link>
        </div>
      )}

      {/* Weight trend chart */}
      {weightSeries.length > 0 && (
        <div className="rounded-xl border bg-card p-4">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">
            Body Weight — raw + 7-day trend
          </p>
          <WeightTrendChart data={weightSeries} height={220} />
        </div>
      )}

      {/* Current metrics snapshot */}
      {last && (
        <div className="rounded-xl border bg-card p-4">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              Latest ({format(new Date(last.measuredAt), "MMM d, yyyy")})
            </p>
            {last.source && (
              <span className="text-xs text-muted-foreground capitalize">
                {last.source} entry
              </span>
            )}
          </div>

          <div className="space-y-0">
            <MeasurementRow
              label="Body weight"
              value={last.bodyWeightKg}
              unit="kg"
              change={delta(last.bodyWeightKg, first?.bodyWeightKg ?? null, "kg")}
            />
            <MeasurementRow
              label="Body fat"
              value={last.bodyFatPct}
              unit="%"
              change={delta(last.bodyFatPct, first?.bodyFatPct ?? null, "%")}
            />
            <MeasurementRow
              label="Lean mass"
              value={last.leanMassKg}
              unit="kg"
              change={delta(last.leanMassKg, first?.leanMassKg ?? null, "kg", true)}
            />
            <MeasurementRow
              label="Visceral fat"
              value={last.visceralFat}
              unit=""
              change={delta(last.visceralFat, first?.visceralFat ?? null, "")}
            />
          </div>
        </div>
      )}

      {/* Circumferences */}
      {last && (last.waistCm || last.hipsCm || last.chestCm || last.armCm || last.thighCm) && (
        <div className="rounded-xl border bg-card p-4">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">
            Circumferences
          </p>
          <MeasurementRow label="Waist" value={last.waistCm} unit="cm" change={delta(last.waistCm, first?.waistCm ?? null, "cm")} />
          <MeasurementRow label="Hips" value={last.hipsCm} unit="cm" change={delta(last.hipsCm, first?.hipsCm ?? null, "cm")} />
          <MeasurementRow label="Chest" value={last.chestCm} unit="cm" change={delta(last.chestCm, first?.chestCm ?? null, "cm")} />
          <MeasurementRow label="Arm" value={last.armCm} unit="cm" change={delta(last.armCm, first?.armCm ?? null, "cm")} />
          <MeasurementRow label="Thigh" value={last.thighCm} unit="cm" change={delta(last.thighCm, first?.thighCm ?? null, "cm")} />
        </div>
      )}

      {/* Measurement history */}
      {measurements.length > 1 && (
        <div className="rounded-xl border bg-card p-4">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">
            History
          </p>
          <div className="space-y-0 divide-y">
            {[...measurements].reverse().map((m) => (
              <div key={m.id} className="py-2.5 flex items-center justify-between">
                <div>
                  <p className="text-xs font-medium">
                    {format(new Date(m.measuredAt), "MMM d, yyyy")}
                  </p>
                  <p className="text-xs text-muted-foreground capitalize">{m.source}</p>
                </div>
                <div className="flex items-baseline gap-3 text-xs text-right">
                  {m.bodyWeightKg != null && (
                    <span className="font-medium">{m.bodyWeightKg.toFixed(1)} kg</span>
                  )}
                  {m.bodyFatPct != null && (
                    <span className="text-muted-foreground">{m.bodyFatPct.toFixed(1)}%</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default function BodyPage() {
  const { id: clientId } = useParams<{ id: string }>();
  const { data, loading } = useProgressData(clientId);

  return (
    <ProgressShell clientName="Progress" data={data} loading={loading}>
      {(d) => <BodyView data={d} clientId={clientId} />}
    </ProgressShell>
  );
}
