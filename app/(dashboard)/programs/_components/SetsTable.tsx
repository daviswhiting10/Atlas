"use client";

import { Button } from "@/components/ui/button";
import { Trash2, Plus } from "lucide-react";

export type SetDraft = {
  setNumber: number;
  weight: number | null;
  isBodyweight: boolean;
  unit?: "reps" | "secs"; // undefined = "reps" (legacy)
  repMin: number;
  repMax: number;
  rpe: number | null;
  restSeconds: number | null;
  notes: string;
};

type Props = {
  sets: SetDraft[];
  onChange: (sets: SetDraft[]) => void;
  readOnly?: boolean;
};

function newSet(setNumber: number, isSecs = false): SetDraft {
  return {
    setNumber,
    weight: null,
    isBodyweight: false,
    unit: isSecs ? "secs" : "reps",
    repMin: isSecs ? 30 : 8,
    repMax: isSecs ? 30 : 12,
    rpe: null,
    restSeconds: null,
    notes: "",
  };
}

function num(v: string): number | null {
  const n = parseFloat(v);
  return isNaN(n) ? null : n;
}

export function SetsTable({ sets, onChange, readOnly = false }: Props) {
  const allSecs = sets.length > 0 && sets[0].unit === "secs";

  function updateRow(idx: number, patch: Partial<SetDraft>) {
    const next = sets.map((s, i) => (i === idx ? { ...s, ...patch } : s));
    onChange(next);
  }

  function toggleAllUnit() {
    const newUnit: "reps" | "secs" = allSecs ? "reps" : "secs";
    const next = sets.map((s) => ({
      ...s,
      unit: newUnit,
      // Switching to secs: collapse to a single value (use repMax)
      ...(newUnit === "secs" && { repMin: s.repMax }),
      // Switching to reps: open up a range (repMin stays = repMax, trainer can widen)
    }));
    onChange(next);
  }

  function addSet() {
    onChange([...sets, newSet(sets.length + 1, allSecs)]);
  }

  function removeSet(idx: number) {
    const next = sets
      .filter((_, i) => i !== idx)
      .map((s, i) => ({ ...s, setNumber: i + 1 }));
    onChange(next);
  }

  const cellCls = "border-b px-1.5 py-1";
  const inputCls =
    "w-full bg-transparent text-xs text-center focus:outline-none focus:ring-1 focus:ring-primary/40 rounded px-1 py-0.5 disabled:opacity-50";

  return (
    <div className="mt-2">
      <table className="w-full text-xs border rounded overflow-hidden">
        <thead>
          <tr className="bg-muted text-muted-foreground">
            <th className="px-1.5 py-1 text-center font-medium w-36">Weight</th>
            <th className="px-1.5 py-1 text-center font-medium">
              {!readOnly ? (
                <button
                  type="button"
                  onClick={toggleAllUnit}
                  title={allSecs ? "Switch to reps" : "Switch to seconds (holds)"}
                  className={
                    allSecs
                      ? "px-2 py-0.5 rounded text-[11px] font-semibold bg-violet-100 text-violet-700 border border-violet-300 hover:bg-violet-200 transition-colors"
                      : "px-2 py-0.5 rounded text-[11px] font-medium text-muted-foreground border border-transparent hover:border-border hover:text-foreground transition-colors"
                  }
                >
                  {allSecs ? "Sec ⇄" : "Reps ⇄"}
                </button>
              ) : allSecs ? (
                "Sec"
              ) : (
                "Reps"
              )}
            </th>
            {!readOnly && <th className="w-6" />}
          </tr>
        </thead>
        <tbody>
          {sets.map((s, idx) => {
            const isSecs = s.unit === "secs";
            return (
              <tr key={idx} className="hover:bg-muted/30">
                {/* Weight cell */}
                <td className={cellCls}>
                  <div className="flex items-center gap-1 min-w-0">
                    {s.isBodyweight ? (
                      <span className="text-xs font-medium text-muted-foreground flex-1 text-center">
                        N/A
                      </span>
                    ) : (
                      <input
                        type="number"
                        className={inputCls}
                        value={s.weight ?? ""}
                        placeholder="—"
                        disabled={readOnly}
                        onChange={(e) => updateRow(idx, { weight: num(e.target.value) })}
                      />
                    )}
                    {!readOnly && (
                      <button
                        type="button"
                        title={s.isBodyweight ? "Enter weight" : "Bodyweight / N/A"}
                        className="text-[10px] shrink-0 px-1 py-0.5 rounded border border-border text-muted-foreground hover:text-foreground hover:border-foreground leading-none"
                        onClick={() =>
                          updateRow(idx, {
                            isBodyweight: !s.isBodyweight,
                            weight: null,
                          })
                        }
                      >
                        {s.isBodyweight ? "lb" : "N/A"}
                      </button>
                    )}
                  </div>
                </td>

                {/* Reps / Secs cell */}
                <td className={cellCls}>
                  {isSecs ? (
                    /* Seconds mode: single input */
                    <div className="flex items-center gap-0.5 justify-center">
                      <input
                        type="number"
                        className={inputCls}
                        value={s.repMax}
                        min={0}
                        placeholder="30"
                        disabled={readOnly}
                        onChange={(e) => {
                          const v = parseInt(e.target.value) || 0;
                          updateRow(idx, { repMin: v, repMax: v });
                        }}
                      />
                      <span className="text-[10px] text-muted-foreground shrink-0">s</span>
                    </div>
                  ) : (
                    /* Reps mode: min–max range */
                    <div className="flex items-center gap-0.5">
                      <input
                        type="number"
                        className={inputCls}
                        value={s.repMin}
                        min={0}
                        disabled={readOnly}
                        onChange={(e) =>
                          updateRow(idx, { repMin: parseInt(e.target.value) || 0 })
                        }
                      />
                      <span className="text-muted-foreground">–</span>
                      <input
                        type="number"
                        className={inputCls}
                        value={s.repMax}
                        min={0}
                        disabled={readOnly}
                        onChange={(e) =>
                          updateRow(idx, {
                            repMax: Math.max(s.repMin, parseInt(e.target.value) || 0),
                          })
                        }
                      />
                    </div>
                  )}
                </td>

                {!readOnly && (
                  <td className={cellCls}>
                    <button
                      type="button"
                      onClick={() => removeSet(idx)}
                      className="text-muted-foreground hover:text-destructive"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
      {!readOnly && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="mt-1 h-6 text-xs text-muted-foreground"
          onClick={addSet}
        >
          <Plus className="w-3 h-3 mr-1" />
          Add set
        </Button>
      )}
    </div>
  );
}
