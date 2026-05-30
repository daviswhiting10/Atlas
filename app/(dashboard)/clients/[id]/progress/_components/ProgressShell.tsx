"use client";

// Shared data fetching and layout for all progress sub-views.
// Uses a single API call; sub-views receive the data via props or context.

import { useEffect, useState } from "react";
import { useParams, usePathname } from "next/navigation";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ArrowLeft } from "lucide-react";
import { useContentFade } from "@/hooks/use-content-fade";

// ── Shared types (exported for sub-views) ────────────────────────────────────

export type StrengthPoint = {
  date: string;
  exerciseId: string;
  exerciseName: string;
  e1RM: number;
};

export type KeyLift = {
  exerciseId: string;
  exerciseName: string;
  baselineE1RM: number | null;
  currentE1RM: number | null;
  allTimeBestE1RM: number | null;
  pctChange: number | null;
};

export type WeightPoint = {
  date: string;
  weightKg: number;
  ema: number;
};

export type VolumePoint = {
  weekStart: string;
  totalKg: number;
  sessionCount: number;
};

export type MilestoneRecord = {
  id: string;
  type: string;
  title: string;
  description: string;
  metricValue: number | null;
  metricUnit: string | null;
  exerciseId: string | null;
  exerciseName: string | null;
  achievedAt: string;
  seenByClient: boolean;
};

export type MeasurementRecord = {
  id: string;
  measuredAt: string;
  bodyWeightKg: number | null;
  bodyFatPct: number | null;
  leanMassKg: number | null;
  visceralFat: number | null;
  waistCm: number | null;
  hipsCm: number | null;
  chestCm: number | null;
  armCm: number | null;
  thighCm: number | null;
  painRating: number | null;
  source: string;
  notes: string | null;
};

export type ProgressData = {
  client: {
    primaryGoal: string | null;
    keyLiftIds: string[];
    goalTargets: Record<string, unknown> | null;
  };
  strengthSeries: StrengthPoint[];
  keyLifts: KeyLift[];
  volumeSeries: VolumePoint[];
  weightSeries: WeightPoint[];
  milestones: MilestoneRecord[];
  lastMeasurement: {
    bodyWeightKg: number | null;
    bodyFatPct: number | null;
    leanMassKg: number | null;
    waistCm: number | null;
    hipsCm: number | null;
    measuredAt: string;
  } | null;
  measurements: MeasurementRecord[];
  totalSessions: number;
};

// ── Sub-nav tabs ──────────────────────────────────────────────────────────────

const TABS = [
  { label: "Overview", href: "" },
  { label: "Strength", href: "/strength" },
  { label: "Body",     href: "/body" },
];

// ── Loading skeleton ──────────────────────────────────────────────────────────
// Heights are derived from the real ProgressOverview layout to guarantee zero
// layout shift when the crossfade completes.

function ProgressSkeleton() {
  return (
    <div className="space-y-6">

      {/* 1 ── Hero chart block: 80px header + 280px chart = 360px */}
      <div className="rounded-2xl border bg-card overflow-hidden">
        <div className="flex items-start justify-between px-5 pt-5 pb-2">
          <div>
            {/* label: h-4 = 16px */}
            <div className="h-4 w-28 rounded bg-muted animate-pulse" />
            {/* display value: h-8 = 32px, mt-1 = 4px */}
            <div className="h-8 w-32 rounded bg-muted animate-pulse mt-1" />
          </div>
          {/* button placeholder: h-8 matches buttonVariants size="sm" */}
          <div className="h-8 w-36 rounded-md bg-muted animate-pulse" />
        </div>
        {/* chart: exactly 280px */}
        <div className="h-[280px] bg-muted animate-pulse" />
      </div>

      {/* 2 ── Stat strip: 3 cols, each tile 92px */}
      <div className="flex gap-3 overflow-x-auto md:grid md:grid-cols-3 md:overflow-visible">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="rounded-[18px] px-4 py-3 min-w-[120px] snap-start"
            style={{ border: "1px solid var(--line)", background: "var(--paper)" }}
          >
            {/* label: h-4 = 16px */}
            <div className="h-4 w-14 rounded bg-muted animate-pulse" />
            {/* value: h-7 = 28px (= 1.75rem, matches clamp min), mt-1 = 4px */}
            <div className="h-7 w-20 rounded bg-muted animate-pulse mt-1" />
            {/* sub: h-4 = 16px, mt-1 = 4px */}
            <div className="h-4 w-12 rounded bg-muted animate-pulse mt-1" />
          </div>
        ))}
      </div>

      {/* 3 ── Key lifts: heading row + 2×2 grid, each card 154px */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <div className="h-4 w-16 rounded bg-muted animate-pulse" />
          <div className="h-3 w-28 rounded bg-muted animate-pulse" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="rounded-xl border bg-card p-3">
              {/* title row: h-4 = 16px, mb-1 = 4px */}
              <div className="flex items-center justify-between mb-1">
                <div className="h-4 w-24 rounded bg-muted animate-pulse" />
                <div className="h-4 w-16 rounded bg-muted animate-pulse" />
              </div>
              {/* chart: exactly 90px */}
              <div className="h-[90px] rounded bg-muted animate-pulse" />
              {/* pct change line: h-4 = 16px, mt-1 = 4px */}
              <div className="h-4 w-20 rounded bg-muted animate-pulse mt-1" />
            </div>
          ))}
        </div>
      </div>

      {/* 4 ── Secondary charts: 2-col grid */}
      {/* Weekly strength card: p-4(32) + h-4(16) + mb-1(4) + h-4(16) + mb-3(12) + h-[160](160) = 240px */}
      {/* Body weight card:     p-4(32) + h-4(16) + mb-3(12) + h-[160](160) = 220px               */}
      {/* Grid row = max(240,220) = 240px — matches real layout exactly                            */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="rounded-xl border bg-card p-4">
          <div className="h-4 w-40 rounded bg-muted animate-pulse mb-1" />
          <div className="h-4 w-48 rounded bg-muted animate-pulse mb-3" />
          <div className="h-[160px] rounded bg-muted animate-pulse" />
        </div>
        <div className="rounded-xl border bg-card p-4">
          <div className="h-4 w-32 rounded bg-muted animate-pulse mb-3" />
          <div className="h-[160px] rounded bg-muted animate-pulse" />
        </div>
      </div>

    </div>
  );
}

// ── Shell component ───────────────────────────────────────────────────────────

export function ProgressShell({
  children,
  clientName,
  data,
  loading,
}: {
  children: (data: ProgressData) => React.ReactNode;
  clientName?: string;
  data: ProgressData | null;
  loading: boolean;
}) {
  const { id: clientId } = useParams<{ id: string }>();
  const pathname = usePathname();
  const base = `/clients/${clientId}/progress`;
  const phase = useContentFade(loading);

  return (
    <div className="px-5 pt-5 md:px-8 md:pt-8 md:max-w-5xl pb-20 md:pb-8">
      {/* Back */}
      <Link
        href={`/clients/${clientId}`}
        className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "mb-4 -ml-2")}
      >
        <ArrowLeft className="w-4 h-4 mr-1" />
        {clientName ?? "Client"}
      </Link>

      {/* Sub-nav */}
      <nav className="flex gap-0 border-b mb-6 overflow-x-auto">
        {TABS.map((tab) => {
          const href = `${base}${tab.href}`;
          const isActive = tab.href === ""
            ? pathname === base || pathname === base + "/"
            : pathname.startsWith(href);
          return (
            <Link
              key={tab.href}
              href={href}
              className={cn(
                "px-4 py-2 text-sm whitespace-nowrap border-b-2 -mb-px transition-colors",
                isActive
                  ? "border-primary text-foreground font-medium"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              )}
            >
              {tab.label}
            </Link>
          );
        })}
      </nav>

      <div className="relative">
        {phase !== "done" && (
          <div
            className={phase === "fading" ? "absolute inset-0 pointer-events-none opacity-0" : undefined}
            aria-hidden={phase === "fading"}
          >
            <ProgressSkeleton />
          </div>
        )}
        {phase !== "loading" && (
          <div className={phase === "fading" ? "animate-in fade-in-0 duration-200 ease-out" : undefined}>
            {data
              ? children(data)
              : <p className="text-muted-foreground">Failed to load progress data.</p>
            }
          </div>
        )}
      </div>
    </div>
  );
}

// ── Data hook ─────────────────────────────────────────────────────────────────

export function useProgressData(clientId: string): {
  data: ProgressData | null;
  loading: boolean;
} {
  const [data, setData] = useState<ProgressData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/clients/${clientId}/progress`)
      .then((r) => {
        if (!r.ok) throw new Error(String(r.status));
        return r.json();
      })
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [clientId]);

  return { data, loading };
}
