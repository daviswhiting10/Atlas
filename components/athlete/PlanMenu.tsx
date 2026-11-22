"use client";

import Link from "next/link";
import { MoreHorizontal } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

/**
 * The Plan tab's ⋯: Change goals, and Delete plan once there is an athlete delete action.
 * DELETE PLAN HOOK: pass `onDelete` when W1's deleteMyPlan lands (handoff-W1-athlete-delete-plan.md);
 * until then the item isn't shown. With nothing to show, there is no ⋯ at all.
 */
export function PlanMenu({ changeGoals, onDelete }: { changeGoals: boolean; onDelete?: () => void }) {
  if (!changeGoals && !onDelete) return null;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger aria-label="Plan options" className="press flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-line bg-paper text-ink">
        <MoreHorizontal className="h-5 w-5" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[180px]">
        {changeGoals && <DropdownMenuItem render={<Link href="/you?goals=1" />}>Change goals</DropdownMenuItem>}
        {onDelete && (
          <DropdownMenuItem onClick={onDelete} className="text-destructive">
            Delete plan
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
