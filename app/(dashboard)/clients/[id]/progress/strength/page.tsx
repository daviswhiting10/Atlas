"use client";

import { useParams } from "next/navigation";
import { ProgressShell, useProgressData, type ProgressData, type StrengthPoint } from "../_components/ProgressShell";
import { E1RMLineChart, type E1RMPoint } from "@/components/charts/E1RMLineChart";
import { VolumeBarChart } from "@/components/charts/VolumeBarChart";
import { cn } from "@/lib/utils";

const COLORS = ["#3b82f6", "#10b981", "#8b5cf6", "#f59e0b", "#ef4444"];

function buildE1RMSeries(series: StrengthPoint[], exerciseId: string): E1RMPoint[] {
  const pts = series
    .filter((s) => s.exerciseId === exerciseId)
    .sort((a, b) => a.date.localeCompare(b.date));

  let bestSoFar = 0;
  return pts.map((p) => {
    const isPR = p.e1RM > bestSoFar;
    if (isPR) bestSoFar = p.e1RM;
    return { date: p.date, e1RM: p.e1RM, isPR };
  });
}

function StrengthView({ data }: { data: ProgressData }) {
  const { keyLifts, strengthSeries, volumeSeries } = data;

  if (keyLifts.length === 0) {
    return (
      <div className="rounded-xl border border-dashed p-12 text-center text-muted-foreground text-sm">
        No key lifts configured yet. Log sessions to start building your strength chart.
      </div>
    );
  }

  const liftsWithData = keyLifts.filter(
    (kl) => strengthSeries.some((s) => s.exerciseId === kl.exerciseId)
  );

  return (
    <div className="space-y-8">
      {/* Per-lift charts */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {liftsWithData.map((kl, i) => {
          const color = COLORS[i % COLORS.length];
          const series = buildE1RMSeries(strengthSeries, kl.exerciseId);

          return (
            <div key={kl.exerciseId} className="rounded-xl border bg-card p-4">
              <div className="flex items-start justify-between mb-1">
                <p className="text-sm font-semibold">{kl.exerciseName}</p>
                {kl.pctChange != null && (
                  <span
                    className={cn(
                      "text-xs font-medium px-1.5 py-0.5 rounded-full",
                      kl.pctChange > 0
                        ? "bg-emerald-50 text-emerald-700"
                        : "bg-red-50 text-red-600"
                    )}
                  >
                    {kl.pctChange > 0 ? "+" : ""}
                    {kl.pctChange.toFixed(1)}%
                  </span>
                )}
              </div>
              <div className="flex items-baseline gap-3 mb-3">
                <p className="text-2xl font-bold" style={{ color }}>
                  {kl.currentE1RM?.toFixed(0) ?? "—"}
                  <span className="text-sm font-normal text-muted-foreground ml-1">lb e1RM</span>
                </p>
              </div>

              <E1RMLineChart data={series} color={color} height={130} />

              <div className="grid grid-cols-3 gap-2 mt-3 pt-3 border-t">
                <div>
                  <p className="text-[10px] text-muted-foreground uppercase">Baseline</p>
                  <p className="text-sm font-medium">{kl.baselineE1RM?.toFixed(0) ?? "—"}</p>
                </div>
                <div>
                  <p className="text-[10px] text-muted-foreground uppercase">Current</p>
                  <p className="text-sm font-medium">{kl.currentE1RM?.toFixed(0) ?? "—"}</p>
                </div>
                <div>
                  <p className="text-[10px] text-muted-foreground uppercase">All-time best</p>
                  <p className="text-sm font-medium">{kl.allTimeBestE1RM?.toFixed(0) ?? "—"}</p>
                </div>
              </div>
            </div>
          );
        })}

        {/* Lifts with no data */}
        {keyLifts
          .filter((kl) => !strengthSeries.some((s) => s.exerciseId === kl.exerciseId))
          .map((kl) => (
            <div key={kl.exerciseId} className="rounded-xl border border-dashed bg-card p-4 flex items-center justify-center">
              <p className="text-sm text-muted-foreground">{kl.exerciseName} — no data yet</p>
            </div>
          ))}
      </div>

      {/* Weekly volume */}
      {volumeSeries.length > 0 && (
        <div className="rounded-xl border bg-card p-4">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">
            Weekly Volume (lb)
          </p>
          <VolumeBarChart data={volumeSeries} color="#3b82f6" height={160} />
        </div>
      )}
    </div>
  );
}

export default function StrengthPage() {
  const { id: clientId } = useParams<{ id: string }>();
  const { data, loading } = useProgressData(clientId);

  return (
    <ProgressShell clientName="Progress" data={data} loading={loading}>
      {(d) => <StrengthView data={d} />}
    </ProgressShell>
  );
}
