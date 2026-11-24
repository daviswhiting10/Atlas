"use client";

import { useEffect, useRef, useState } from "react";
import { applyMatch, type ExerciseMatch } from "@/lib/programs/dedupe";
import type { SheetGrid } from "@/lib/programs/sheet-plan";

/**
 * Before saving: imported names that look like an exercise already in the library ("Hip thrust (lighter, 2 sec pause)"
 * is Hip Thrust). Each is ticked to use the existing exercise, so its history stays in one place, with the cue moved to
 * the note; untick to keep the name as imported (a new exercise).
 */
export function ExerciseMatches({ matches, grid, onGrid }: { matches: ExerciseMatch[]; grid: unknown; onGrid: (g: unknown) => void }) {
  const [on, setOn] = useState<Record<string, boolean>>(() => Object.fromEntries(matches.map((m) => [m.name, true])));
  const gridRef = useRef(grid as SheetGrid);
  gridRef.current = grid as SheetGrid;
  const applied = useRef(false);

  // Ticked from the start: applied once to the grid as it was read.
  useEffect(() => {
    if (applied.current || matches.length === 0) return;
    applied.current = true;
    onGrid(matches.reduce((g, m) => applyMatch(g, m, true), gridRef.current));
  }, [matches, onGrid]);

  if (matches.length === 0) return null;
  const toggle = (m: ExerciseMatch) => {
    const next = !on[m.name];
    setOn((o) => ({ ...o, [m.name]: next }));
    onGrid(applyMatch(gridRef.current, m, next));
  };
  return (
    <div className="rounded-xl border border-line px-3.5 py-3 text-[13px]" aria-label="Exercises already in your library">
      <p className="font-semibold text-ink">Already in your library</p>
      <p className="mt-0.5 text-ink-mute">Ticked: the existing exercise is used and its history stays together. The extra words go in the note.</p>
      <ul className="mt-2 space-y-1.5">
        {matches.map((m) => (
          <li key={m.name}>
            <label className="flex min-h-11 cursor-pointer items-start gap-2.5 py-1">
              <input type="checkbox" checked={!!on[m.name]} onChange={() => toggle(m)} className="mt-0.5 h-4 w-4 shrink-0 accent-current" />
              <span className="text-ink-soft">
                <span className="text-ink">{m.name}</span> → use <span className="font-medium text-ink">{m.match}</span>
                {m.cue ? <span className="text-ink-mute"> · note: {m.cue}</span> : null}
              </span>
            </label>
          </li>
        ))}
      </ul>
    </div>
  );
}
