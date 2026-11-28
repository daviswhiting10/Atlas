"use client";

import { useState } from "react";
import { addSuggestion, coreGaps } from "@/lib/programs/plan-rules";
import type { SheetGrid } from "@/lib/programs/sheet-plan";

/**
 * Before saving an imported plan: each strength workout with no core work, with one suggestion that fits the plan's
 * equipment. Nothing changes unless Add is tapped; then it goes into the grid that goes back to save.
 */
export function CoreCheck({ grid, onGrid }: { grid: unknown; onGrid: (g: unknown) => void }) {
  const [added, setAdded] = useState<string[]>([]);
  const gaps = coreGaps(grid as SheetGrid);
  if (gaps.length === 0 && added.length === 0) return null;
  return (
    <div className="rounded-xl border border-line px-3.5 py-3 text-[13px]" aria-label="Core work">
      <ul className="space-y-1 text-ink-soft">
        {gaps.map((g) => (
          <li key={g.day} className="flex min-h-11 items-center justify-between gap-3">
            <span>
              <span className="block font-medium text-ink">No core work on {g.dayName}</span>
              {g.name}, {g.dose}
            </span>
            <button
              type="button"
              onClick={() => {
                onGrid(addSuggestion(grid as SheetGrid, g.day, g.slug));
                setAdded((a) => [...a, `${g.name} added to ${g.dayName}`]);
              }}
              aria-label={`Add ${g.name} to ${g.dayName}`}
              className="press min-h-11 shrink-0 rounded-lg border border-line px-3 text-[13px] font-medium text-ink"
            >
              Add
            </button>
          </li>
        ))}
        {added.map((a) => (
          <li key={a} className="text-ink-mute">
            {a}
          </li>
        ))}
      </ul>
    </div>
  );
}
