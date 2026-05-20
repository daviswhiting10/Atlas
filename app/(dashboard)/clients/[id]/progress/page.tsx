"use client";

import { useParams } from "next/navigation";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Plus } from "lucide-react";
import { ProgressShell, useProgressData, type ProgressData } from "./_components/ProgressShell";
import { StatTile } from "./_components/StatTile";
import { MilestoneCard } from "./_components/MilestoneCard";
import { HeroProgressChart, type HeroDataPoint } from "@/components/charts/HeroProgressChart";
import { E1RMLineChart, type E1RMPoint } from "@/components/charts/E1RMLineChart";
import { VolumeBarChart } from "@/components/charts/VolumeBarChart";
import { WeightTrendChart } from "@/components/charts/WeightTrendChart";

// ── Goal-driven config ────────────────────────────────────────────────────────

const GOAL_CONFIG: Record<
  string,
  {
    label: string;
    heroMetric: "weight" | "strength" | "sessions";
    color: string;
    accentClass: string;
  }
> = {
  weight_loss: {
    label: "Body Weight Trend",
    heroMetric: "weight",
    color: "#10b981",
    accentClass: "text-emerald-600",
  },
  hypertrophy: {
    label: "Strength Composite",
    heroMetric: "strength",
    color: "#3b82f6",
    accentClass: "text-blue-600",
  },
  performance: {
    label: "Strength Composite",
    heroMetric: "strength",
    color: "#8b5cf6",
    accentClass: "text-violet-600",
  },
  general: {
    label: "Weekly Sessions",
    heroMetric: "sessions",
    color: "#6366f1",
    accentClass: "text-indigo-600",
  },
  pain_mgmt: {
    label: "Body Weight Trend",
    heroMetric: "weight",
    color: "#f59e0b",
    accentClass: "text-amber-600",
  },
};

const DEFAULT_GOAL_CONFIG = {
  label: "Strength Composite",
  heroMetric: "strength" as const,
  color: "#6366f1",
  accentClass: "text-indigo-600",
};

// ── Hero data builders ────────────────────────────────────────────────────────

function buildWeightHero(data: ProgressData): HeroDataPoint[] {
  return data.weightSeries.map((w) => ({ date: w.date, value: w.ema }));
}

function buildStrengthHero(data: ProgressData): HeroDataPoint[] {
  // Composite % change from baseline, bucketed by date
  const { keyLifts, strengthSeries } = data;
  if (keyLifts.length === 0) return [];

  // Map: date → composite % change
  const byDate = new Map<string, number[]>();
  for (const pt of strengthSeries) {
    if (!keyLifts.find((kl) => kl.exerciseId === pt.exerciseId)) continue;
    const kl = keyLifts.find((kl) => kl.exerciseId === pt.exerciseId)!;
    if (kl.baselineE1RM == null || kl.baselineE1RM === 0) continue;
    const pct = ((pt.e1RM - kl.baselineE1RM) / kl.baselineE1RM) * 100;
    if (!byDate.has(pt.date)) byDate.set(pt.date, []);
    byDate.get(pt.date)!.push(pct);
  }

  return Array.from(byDate.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, pcts]) => ({
      date,
      value: Math.round((pcts.reduce((a, b) => a + b, 0) / pcts.length) * 10) / 10,
    }));
}

function buildSessionsHero(data: ProgressData): HeroDataPoint[] {
  return data.volumeSeries.map((v) => ({ date: v.weekStart, value: v.sessionCount }));
}

function buildLiftSeries(data: ProgressData, exerciseId: string): E1RMPoint[] {
  const pts = data.strengthSeries
    .filter((s) => s.exerciseId === exerciseId)
    .sort((a, b) => a.date.localeCompare(b.date));
  let best = 0;
  return pts.map((p) => {
    const isPR = p.e1RM > best;
    if (isPR) best = p.e1RM;
    return { date: p.date, e1RM: p.e1RM, isPR };
  });
}

const LIFT_COLORS = ["#3b82f6", "#10b981", "#8b5cf6", "#f59e0b", "#ef4444"];

// ── Stats builders ────────────────────────────────────────────────────────────

function computeStats(data: ProgressData, goal: string) {
  const cfg = GOAL_CONFIG[goal] ?? DEFAULT_GOAL_CONFIG;

  if (cfg.heroMetric === "weight" && data.weightSeries.length > 0) {
    const first = data.weightSeries[0];
    const last = data.weightSeries[data.lastMeasurement ? data.weightSeries.length - 1 : 0];
    const deltaKg = last.ema - first.ema;
    const deltaLb = deltaKg * 2.20462;
    const lastKg = data.lastMeasurement?.bodyWeightKg ?? last.weightKg;
    return [
      { label: "Current weight", value: `${lastKg.toFixed(1)} kg`, sub: `${(lastKg * 2.205).toFixed(0)} lb` },
      { label: "Change", value: `${deltaLb >= 0 ? "+" : ""}${deltaLb.toFixed(1)} lb`, delta: `${deltaKg >= 0 ? "+" : ""}${deltaKg.toFixed(1)} kg`, deltaPositive: goal === "weight_loss" ? deltaKg < 0 : deltaKg > 0 },
      { label: "Sessions", value: String(data.totalSessions), sub: "total logged" },
    ];
  }

  if (cfg.heroMetric === "strength" && data.keyLifts.length > 0) {
    const withData = data.keyLifts.filter((kl) => kl.currentE1RM != null && kl.baselineE1RM != null);
    const avgPct = withData.length > 0
      ? withData.reduce((a, kl) => a + (kl.pctChange ?? 0), 0) / withData.length
      : 0;
    const topLift = [...data.keyLifts].sort((a, b) => (b.pctChange ?? 0) - (a.pctChange ?? 0))[0];
    return [
      { label: "Strength gain", value: `${avgPct >= 0 ? "+" : ""}${avgPct.toFixed(1)}%`, sub: "composite avg", deltaPositive: avgPct > 0 },
      { label: "Top lift", value: topLift?.exerciseName?.split(" ")[1] ?? topLift?.exerciseName ?? "—", sub: topLift?.pctChange != null ? `${topLift.pctChange > 0 ? "+" : ""}${topLift.pctChange.toFixed(0)}%` : undefined },
      { label: "Sessions", value: String(data.totalSessions), sub: "total logged" },
    ];
  }

  return [
    { label: "Sessions", value: String(data.totalSessions), sub: "total logged" },
    { label: "Milestones", value: String(data.milestones.length), sub: "earned" },
  ];
}

// ── Main overview ─────────────────────────────────────────────────────────────

function ProgressOverview({ data, clientId }: { data: ProgressData; clientId: string }) {
  const goal = data.client.primaryGoal ?? "general";
  const cfg = GOAL_CONFIG[goal] ?? DEFAULT_GOAL_CONFIG;

  // Fall back to strength hero if goal is weight-based but no measurements yet
  const weightHero = buildWeightHero(data);
  const strengthHero = buildStrengthHero(data);
  let heroData: HeroDataPoint[];
  let heroLabel = cfg.label;
  let heroUnit = cfg.heroMetric === "weight" ? "kg" : cfg.heroMetric === "strength" ? "%" : "sessions";
  let heroColor = cfg.color;

  if (cfg.heroMetric === "weight") {
    if (weightHero.length > 0) {
      heroData = weightHero;
    } else if (strengthHero.length > 0) {
      heroData = strengthHero;
      heroLabel = "Strength composite";
      heroUnit = "%";
      heroColor = "#3b82f6";
    } else {
      heroData = [];
    }
  } else if (cfg.heroMetric === "strength") {
    heroData = strengthHero;
  } else {
    heroData = buildSessionsHero(data);
  }

  const stats = computeStats(data, goal);
  const recentMilestones = data.milestones.slice(0, 5);
  const hasData = heroData.length > 0;

  // Key lifts that have actual data
  const keyLiftsWithData = data.keyLifts.filter((kl) =>
    data.strengthSeries.some((s) => s.exerciseId === kl.exerciseId)
  );

  return (
    <div className="space-y-6">
      {/* Hero chart band */}
      <div className="rounded-2xl border bg-card overflow-hidden">
        <div className="flex items-start justify-between px-5 pt-5 pb-2">
          <div>
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              {heroLabel}
            </p>
            {heroData.length > 0 && (
              <p className={cn("text-4xl font-bold tracking-tight mt-1", cfg.accentClass)}>
                {heroUnit === "kg"
                  ? `${heroData[heroData.length - 1].value.toFixed(1)} kg`
                  : heroUnit === "%"
                  ? `${heroData[heroData.length - 1].value > 0 ? "+" : ""}${heroData[heroData.length - 1].value.toFixed(1)}%`
                  : `${heroData[heroData.length - 1].value} sessions/wk`}
              </p>
            )}
          </div>
          <Link
            href={`/clients/${clientId}/measurements/new`}
            className={cn(buttonVariants({ variant: "outline", size: "sm" }), "h-8 text-xs")}
          >
            <Plus className="w-3.5 h-3.5 mr-1" />
            Log measurement
          </Link>
        </div>

        {hasData ? (
          <div style={{ height: 280 }}>
            <HeroProgressChart
              data={heroData}
              label={heroLabel}
              unit={heroUnit}
              color={heroColor}
              formatY={heroUnit === "%" ? (v) => `${v >= 0 ? "+" : ""}${v.toFixed(1)}%` : undefined}
            />
          </div>
        ) : (
          <div className="h-48 flex flex-col items-center justify-center gap-3 text-muted-foreground">
            <p className="text-sm text-center px-4">
              Log a session to see strength charts, or log a body measurement to see weight trend.
            </p>
            <Link
              href={`/clients/${clientId}/measurements/new`}
              className={buttonVariants({ variant: "outline", size: "sm" })}
            >
              <Plus className="w-3.5 h-3.5 mr-1" />
              Log first measurement
            </Link>
          </div>
        )}
      </div>

      {/* Stat strip */}
      <div className="flex gap-3 overflow-x-auto snap-x snap-mandatory pb-1 md:grid md:grid-cols-3 md:overflow-visible md:pb-0">
        {stats.map((s, i) => (
          <StatTile
            key={i}
            label={s.label}
            value={s.value}
            sub={"sub" in s ? s.sub : undefined}
            delta={"delta" in s ? s.delta : undefined}
            deltaPositive={"deltaPositive" in s ? s.deltaPositive : undefined}
          />
        ))}
      </div>

      {/* Key lifts — shown for all goals when session data exists */}
      {keyLiftsWithData.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-semibold">Key lifts</p>
            <Link
              href={`/clients/${clientId}/progress/strength`}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              Full strength view →
            </Link>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {keyLiftsWithData.slice(0, 4).map((kl, i) => {
              const color = LIFT_COLORS[i % LIFT_COLORS.length];
              const series = buildLiftSeries(data, kl.exerciseId);
              return (
                <div key={kl.exerciseId} className="rounded-xl border bg-card p-3">
                  <div className="flex items-baseline justify-between mb-1">
                    <p className="text-xs font-semibold">{kl.exerciseName}</p>
                    <span className="text-xs font-bold" style={{ color }}>
                      {kl.currentE1RM?.toFixed(0) ?? "—"} lb e1RM
                    </span>
                  </div>
                  <E1RMLineChart data={series} color={color} height={90} />
                  {kl.pctChange != null && (
                    <p className={cn("text-xs font-medium mt-1", kl.pctChange >= 0 ? "text-emerald-600" : "text-red-500")}>
                      {kl.pctChange > 0 ? "+" : ""}{kl.pctChange.toFixed(1)}% from baseline
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Secondary charts */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Volume bar chart */}
        {data.volumeSeries.length > 0 && (
          <div className="rounded-xl border bg-card p-4">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">
              Weekly Volume (lb)
            </p>
            <VolumeBarChart data={data.volumeSeries} color={cfg.color} />
          </div>
        )}

        {/* Body weight trend — shown for all goals when data exists */}
        {data.weightSeries.length > 0 && (
          <div className="rounded-xl border bg-card p-4">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">
              Body Weight Trend
            </p>
            <WeightTrendChart data={data.weightSeries} color="#10b981" height={160} />
          </div>
        )}

        {/* Nudge to log body weight if none yet */}
        {data.weightSeries.length === 0 && data.totalSessions > 0 && (
          <div className="rounded-xl border border-dashed bg-card p-4 flex flex-col items-center justify-center gap-2 text-center">
            <p className="text-xs text-muted-foreground">No body measurements yet</p>
            <Link
              href={`/clients/${clientId}/measurements/new`}
              className={cn(buttonVariants({ variant: "outline", size: "sm" }), "h-7 text-xs")}
            >
              <Plus className="w-3 h-3 mr-1" />
              Log weight
            </Link>
          </div>
        )}
      </div>

      {/* Recent milestones */}
      {recentMilestones.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-semibold">Recent milestones</p>
            <Link
              href={`/clients/${clientId}/progress/milestones`}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              View all →
            </Link>
          </div>
          <div className="flex gap-3 overflow-x-auto snap-x snap-mandatory pb-2">
            {recentMilestones.map((m) => (
              <MilestoneCard key={m.id} milestone={m} compact />
            ))}
          </div>
        </div>
      )}

      {/* Empty milestone state */}
      {recentMilestones.length === 0 && data.totalSessions > 0 && (
        <div className="rounded-xl border border-dashed p-6 text-center text-muted-foreground text-sm">
          Milestones are earned automatically as clients log sessions and hit new PRs.
        </div>
      )}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function ProgressPage() {
  const { id: clientId } = useParams<{ id: string }>();
  const { data, loading } = useProgressData(clientId);

  return (
    <ProgressShell clientName="Progress" data={data} loading={loading}>
      {(d) => <ProgressOverview data={d} clientId={clientId} />}
    </ProgressShell>
  );
}
