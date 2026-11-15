import Link from "next/link";
import { Plus } from "lucide-react";

/**
 * What Today shows when there is no goal card: start one, or log a workout.
 * With a goal card there is no other way to log from here, so this is the only place the link lives.
 */
export function StartLink({ canStart }: { canStart: boolean }) {
  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-1">
      {canStart && (
        <Link href="/goals/new" className="press inline-flex items-center gap-1.5 text-[14px] font-medium text-ink-soft hover:text-ink">
          <Plus className="h-4 w-4" /> Start a goal
        </Link>
      )}
      <Link href="/workouts/new" className="press inline-flex items-center gap-1.5 text-[14px] font-medium text-ink-soft hover:text-ink">
        <Plus className="h-4 w-4" /> Log a workout
      </Link>
    </div>
  );
}
