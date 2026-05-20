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

const ACCENT_MAP: Record<string, string> = {
  first_session:     "bg-emerald-50 text-emerald-600 border-emerald-200",
  session_7_streak:  "bg-orange-50  text-orange-600  border-orange-200",
  session_25:        "bg-violet-50  text-violet-600  border-violet-200",
  session_50:        "bg-violet-50  text-violet-600  border-violet-200",
  session_100:       "bg-violet-50  text-violet-600  border-violet-200",
  first_pr:          "bg-blue-50    text-blue-600    border-blue-200",
  first_exercise_logged: "bg-zinc-50 text-zinc-600   border-zinc-200",
  weight_5lb:        "bg-emerald-50 text-emerald-600 border-emerald-200",
  weight_10lb:       "bg-emerald-50 text-emerald-600 border-emerald-200",
  weight_25lb:       "bg-emerald-50 text-emerald-600 border-emerald-200",
};

function getMilestoneAccent(type: string): string {
  if (ACCENT_MAP[type]) return ACCENT_MAP[type];
  if (type.startsWith("strength_")) return "bg-blue-50 text-blue-600 border-blue-200";
  if (type.startsWith("plate_")) return "bg-amber-50 text-amber-600 border-amber-200";
  return "bg-zinc-50 text-zinc-600 border-zinc-200";
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
      <div className="flex items-start gap-3 snap-start min-w-[200px] max-w-[240px] rounded-xl border bg-card px-3 py-3">
        <span className={cn("w-8 h-8 rounded-full border flex items-center justify-center shrink-0", accent)}>
          <Icon className="w-4 h-4" />
        </span>
        <div className="min-w-0">
          <p className="text-xs font-semibold leading-tight truncate">{milestone.title}</p>
          <p className="text-xs text-muted-foreground mt-0.5 leading-tight line-clamp-2">
            {milestone.description}
          </p>
          <p className="text-[10px] text-muted-foreground/60 mt-1">
            {format(new Date(milestone.achievedAt), "MMM d, yyyy")}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-start gap-4 py-4 border-b last:border-0">
      <span className={cn("w-10 h-10 rounded-full border flex items-center justify-center shrink-0 mt-0.5", accent)}>
        <Icon className="w-5 h-5" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <p className="text-sm font-semibold leading-tight">{milestone.title}</p>
          <p className="text-xs text-muted-foreground shrink-0">
            {format(new Date(milestone.achievedAt), "MMM d")}
          </p>
        </div>
        <p className="text-sm text-muted-foreground mt-0.5 leading-tight">
          {milestone.description}
        </p>
        {milestone.metricValue != null && (
          <p className="text-xs text-muted-foreground/70 mt-1">
            {milestone.metricValue} {milestone.metricUnit}
            {milestone.exerciseName && ` · ${milestone.exerciseName}`}
          </p>
        )}
      </div>
    </div>
  );
}
