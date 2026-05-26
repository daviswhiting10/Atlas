"use client";

import { useParams } from "next/navigation";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Plus } from "lucide-react";
import { ProgressShell, useProgressData, type ProgressData } from "./_components/ProgressShell";
import { StatTile } from "./_components/StatTile";
import { HeroProgressChart, type HeroDataPoint } from "@/components/charts/HeroProgressChart";
import { E1RMLineChart, type E1RMPoint } from "@/components/charts/E1RMLineChart";
import { WeightTrendChart } from "@/components/charts/WeightTrendChart";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
} from "recharts";
import { format } from "date-fns";

// ── Goal-driven config ────────────────────────────────────────────────────────

const GOAL_CONFIG: Record<
  string,
  { label: string; heroMetric: "weight" | "strength" | "sessions"; color: string }
> = {
  weight_loss:  { label: "Body Weight Trend",    heroMetric: "weight",   color: "var(--success)" },
  hypertrophy:  { label: "Strength Composite",   heroMetric: "strength", color: "var(--blue)" },
  performance:  { label: "Strength Composite",   heroMetric: "strength", color: "var(--blue)" },
  general:      { label: "Weekly Sessions",      heroMetric: "sessions", color: "var(--blue)" },
  pain_mgmt:    { label: "Body Weight Trend",    heroMetric: "weight",   color: "var(--warn)" },
};

const DEFAULT_GOAL_CONFIG = {
  label: "Strength Composite",
  heroMetric: "strength" as const,
  color: "#6366f1",
};

// ── Hero data builders ────────────────────────────────────────────────────────

function buildWeightHero(data: ProgressData): HeroDataPoint[] {
  return data.weightSeries.map((w) => ({ date: w.date, value: w.ema }));
}

function buildStrengthHero(data: ProgressData): HeroDataPoint[] {
  const { keyLifts, strengthSeries } = data;
  if (keyLifts.length === 0) return [];
  const byDate = new Map<string, number[]>();
  for (const pt of strengthSeries) {
    const kl = keyLifts.find((kl) => kl.exerciseId === pt.exerciseId);
    if (!kl || kl.baselineE1RM == null || kl.baselineE1RM === 0) continue;
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

// ── Weekly strength progress ──────────────────────────────────────────────────
//
// Groups strengthSeries by week, computes the best e1RM per key lift per week,
// then averages the % change from each lift's baseline. Uses the Epley-derived
// e1RM (already in strengthSeries) so 20 lb × 15 reps correctly beats
// 20 lb × 10 reps even though rep count dropped.

type WeeklyStrengthPoint = { weekStart: string; pctChange: number; liftCount: number };

function buildWeeklyStrengthSeries(data: ProgressData): WeeklyStrengthPoint[] {
  const { keyLifts, strengthSeries } = data;
  if (keyLifts.length === 0) return [];

  // ISO week-start (Mon) for a date string
  function toWeekStart(dateStr: string): string {
    const d = new Date(dateStr + "T12:00:00");
    const day = d.getDay(); // 0=Sun
    const diff = (day === 0 ? -6 : 1 - day);
    const mon = new Date(d);
    mon.setDate(d.getDate() + diff);
    return mon.toISOString().slice(0, 10);
  }

  // For each (exerciseId, weekStart) keep the max e1RM
  const weekMax = new Map<string, number>(); // `${exId}__${weekStart}`
  for (const pt of strengthSeries) {
    const ws = toWeekStart(pt.date);
    const k = `${pt.exerciseId}__${ws}`;
    weekMax.set(k, Math.max(weekMax.get(k) ?? 0, pt.e1RM));
  }

  // Collect all week-starts across key lifts
  const allWeeks = new Set<string>();
  for (const k of weekMax.keys()) {
    allWeeks.add(k.split("__")[1]);
  }

  const result: WeeklyStrengthPoint[] = [];
  for (const ws of Array.from(allWeeks).sort()) {
    const pcts: number[] = [];
    for (const kl of keyLifts) {
      if (kl.baselineE1RM == null || kl.baselineE1RM === 0) continue;
      const best = weekMax.get(`${kl.exerciseId}__${ws}`);
      if (best == null) continue;
      pcts.push(((best - kl.baselineE1RM) / kl.baselineE1RM) * 100);
    }
    if (pcts.length > 0) {
      result.push({
        weekStart: ws,
        pctChange: Math.round((pcts.reduce((a, b) => a + b, 0) / pcts.length) * 10) / 10,
        liftCount: pcts.length,
      });
    }
  }
  return result;
}

// ── Weekly strength chart ─────────────────────────────────────────────────────

function WeeklyStrengthChart({ data, color = "var(--blue)" }: { data: WeeklyStrengthPoint[]; color?: string }) {
  if (data.length === 0) return null;
  const maxAbs = Math.max(...data.map((d) => Math.abs(d.pctChange)), 1);

  return (
    <ResponsiveContainer width="100%" height={160}>
      <BarChart data={data} margin={{ top: 4, right: 4, left: 0, bottom: 0 }} barSize={12}>
        <XAxis
          dataKey="weekStart"
          tickFormatter={(d: string) => format(new Date(d + "T00:00:00"), "MMM d")}
          tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
          axisLine={false} tickLine={false}
        />
        <YAxis
          tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
          axisLine={false} tickLine={false} width={32}
          tickFormatter={(v: number) => `${v > 0 ? "+" : ""}${v.toFixed(0)}%`}
        />
        <Tooltip
          cursor={{ fill: "var(--muted)", opacity: 0.3 }}
          content={({ active, payload, label }) => {
            if (!active || !payload?.length) return null;
            const pt = payload[0].payload as WeeklyStrengthPoint;
            return (
              <div className="bg-popover border border-border rounded-lg shadow-lg px-3 py-2 text-xs">
                <p className="text-muted-foreground mb-1">
                  {label ? `Week of ${format(new Date(label + "T00:00:00"), "MMM d")}` : ""}
                </p>
                <p className="font-semibold text-foreground">
                  {pt.pctChange > 0 ? "+" : ""}{pt.pctChange.toFixed(1)}% vs baseline
                </p>
                <p className="text-muted-foreground">{pt.liftCount} lift{pt.liftCount !== 1 ? "s" : ""} tracked</p>
              </div>
            );
          }}
        />
        <Bar dataKey="pctChange" radius={[3, 3, 0, 0]} isAnimationActive animationDuration={600}>
          {data.map((entry, i) => (
            <Cell
              key={i}
              fill={entry.pctChange >= 0 ? color : "var(--destructive)"}
              fillOpacity={0.4 + 0.6 * (Math.abs(entry.pctChange) / maxAbs)}
            />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

// ── Stats builder ─────────────────────────────────────────────────────────────

const LIFT_COLORS = ["#3b82f6", "#10b981", "#8b5cf6", "#f59e0b", "#ef4444"];

function computeStats(data: ProgressData, goal: string) {
  const cfg = GOAL_CONFIG[goal] ?? DEFAULT_GOAL_CONFIG;

  if (cfg.heroMetric === "weight" && data.weightSeries.length > 0) {
    const first = data.weightSeries[0];
    const last = data.weightSeries[data.weightSeries.length - 1];
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
  ];
}

// ── Main overview ─────────────────────────────────────────────────────────────

function ProgressOverview({ data, clientId }: { data: ProgressData; clientId: string }) {
  const goal = data.client.primaryGoal ?? "general";
  const cfg = GOAL_CONFIG[goal] ?? DEFAULT_GOAL_CONFIG;

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
  const hasData = heroData.length > 0;
  const keyLiftsWithData = data.keyLifts.filter((kl) =>
    data.strengthSeries.some((s) => s.exerciseId === kl.exerciseId)
  );
  const weeklyStrength = buildWeeklyStrengthSeries(data);

  return (
    <div className="space-y-6">
      {/* Hero chart */}
      <div className="rounded-2xl border bg-card overflow-hidden">
        <div className="flex items-start justify-between px-5 pt-5 pb-2">
          <div>
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{heroLabel}</p>
            {heroData.length > 0 && (
              <p className="font-display italic leading-none mt-1" style={{ fontSize: "clamp(2rem, 5vw, 4rem)", color: cfg.color }}>
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

      {/* Key lifts */}
      {keyLiftsWithData.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-semibold">Key lifts</p>
            <Link href={`/clients/${clientId}/progress/strength`} className="text-xs text-muted-foreground hover:text-foreground">
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
                    <p className={cn("text-xs font-medium mt-1", kl.pctChange >= 0 ? "text-green-700" : "text-red-500")}>
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
        {/* Weekly strength progress (replaces raw volume) */}
        {weeklyStrength.length > 0 && (
          <div className="rounded-xl border bg-card p-4">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">
              Weekly Strength Progress
            </p>
            <p className="text-xs text-muted-foreground mb-3">
              Avg e1RM change vs baseline across key lifts
            </p>
            <WeeklyStrengthChart data={weeklyStrength} color={cfg.color} />
          </div>
        )}

        {/* Body weight trend */}
        {data.weightSeries.length > 0 && (
          <div className="rounded-xl border bg-card p-4">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">
              Body Weight Trend
            </p>
            <WeightTrendChart data={data.weightSeries} color="#10b981" height={160} />
          </div>
        )}

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
