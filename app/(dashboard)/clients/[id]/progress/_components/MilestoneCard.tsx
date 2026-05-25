import { Trophy, Flame, TrendingUp, Target, Award, Dumbbell, Star } from "lucide-react";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import type { MilestoneRecord } from "./ProgressShell";

const ICON_MAP: Record<string, React.ElementType> = {
  first_session: Star,
  session_7_streak: Flame,
  session_25: Trophy,
  session_50: Trophy,
  session_100: Trophy,
  first_pr: TrendingUp,
  first_exercise_logged: Dumbbell,
  weight_5lb: Target,
  weight_10lb: Target,
  weight_25lb: Award,
};

function getMilestoneIcon(type: string): React.ElementType {
  if (ICON_MAP[type]) return ICON_MAP[type];
  if (type.startsWith("strength_")) return TrendingUp;
  if (type.startsWith("plate_")) return Dumbbell;
  if (type.startsWith("weight_")) return Target;
  return Award;
}

// All milestone accents use the two-token approach: border/bg/color inline styles
type AccentStyle = { border: string; bg: string; color: string };

function getMilestoneAccent(type: string): AccentStyle {
  // Success (weight loss milestones)
  const successAccent: AccentStyle = {
    border: "rgba(31,122,77,0.30)",
    bg: "rgba(31,122,77,0.07)",
    color: "var(--success)",
  };
  // Blue (strength / session milestones)
  const blueAccent: AccentStyle = {
    border: "rgba(43,107,255,0.30)",
    bg: "rgba(43,107,255,0.07)",
    color: "var(--blue)",
  };
  // Warn (plate milestones)
  const warnAccent: AccentStyle = {
    border: "rgba(180,83,9,0.30)",
    bg: "rgba(180,83,9,0.07)",
    color: "var(--warn)",
  };
  // Neutral
  const neutralAccent: AccentStyle = {
    border: "var(--line)",
    bg: "rgba(11,15,26,0.04)",
    color: "var(--ink-soft)",
  };

  if (type === "first_session" || type.startsWith("weight_")) return successAccent;
  if (type === "first_pr" || type.startsWith("strength_") || type.startsWith("session_"))
    return blueAccent;
  if (type.startsWith("plate_")) return warnAccent;
  return neutralAccent;
}

type Props = {
  milestone: MilestoneRecord;
  compact?: boolean;
};

export function MilestoneCard({ milestone, compact = false }: Props) {
  const Icon = getMilestoneIcon(milestone.type);
  const accent = getMilestoneAccent(milestone.type);

  if (compact) {
    return (
      <div
        className="flex items-start gap-3 snap-start min-w-[200px] max-w-[240px] rounded-[18px] px-3 py-3"
        style={{ border: "1px solid var(--line)", background: "var(--paper)" }}
      >
        <span
          className="w-8 h-8 rounded-full border flex items-center justify-center shrink-0"
          style={{ borderColor: accent.border, background: accent.bg, color: accent.color }}
        >
          <Icon className="w-4 h-4" />
        </span>
        <div className="min-w-0">
          <p className="font-body text-xs font-medium leading-tight truncate" style={{ color: "var(--ink)" }}>
            {milestone.title}
          </p>
          <p className="font-body text-xs mt-0.5 leading-tight line-clamp-2" style={{ color: "var(--ink-mute)" }}>
            {milestone.description}
          </p>
          <p className="font-body text-[10px] mt-1" style={{ color: "var(--ink-mute)", opacity: 0.6 }}>
            {format(new Date(milestone.achievedAt), "MMM d, yyyy")}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-start gap-4 py-4" style={{ borderBottom: "1px solid var(--line)" }}>
      <span
        className="w-10 h-10 rounded-full border flex items-center justify-center shrink-0 mt-0.5"
        style={{ borderColor: accent.border, background: accent.bg, color: accent.color }}
      >
        <Icon className="w-5 h-5" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <p className="font-body text-sm font-medium leading-tight" style={{ color: "var(--ink)" }}>
            {milestone.title}
          </p>
          <p className="font-body text-xs shrink-0" style={{ color: "var(--ink-mute)" }}>
            {format(new Date(milestone.achievedAt), "MMM d")}
          </p>
        </div>
        <p className="font-body text-sm mt-0.5 leading-tight" style={{ color: "var(--ink-mute)" }}>
          {milestone.description}
        </p>
        {milestone.metricValue != null && (
          <p className="font-body text-xs mt-1" style={{ color: "var(--ink-mute)", opacity: 0.7 }}>
            {milestone.metricValue} {milestone.metricUnit}
            {milestone.exerciseName && ` · ${milestone.exerciseName}`}
          </p>
        )}
      </div>
    </div>
  );
}
