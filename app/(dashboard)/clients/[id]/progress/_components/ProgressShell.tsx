"use client";

// Shared data fetching and layout for all progress sub-views.
// Uses a single API call; sub-views receive the data via props or context.

import { useEffect, useState } from "react";
import { useParams, usePathname } from "next/navigation";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ArrowLeft, Loader2 } from "lucide-react";

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
  { label: "Overview",   href: "" },
  { label: "Strength",   href: "/strength" },
  { label: "Body",       href: "/body" },
  { label: "Milestones", href: "/milestones" },
];

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

  return (
    <div className="p-4 md:p-8 max-w-5xl pb-20 md:pb-8">
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

      {loading ? (
        <div className="flex items-center justify-center py-24">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : data ? (
        children(data)
      ) : (
        <p className="text-muted-foreground">Failed to load progress data.</p>
      )}
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
      .then((r) => r.json())
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [clientId]);

  return { data, loading };
}
