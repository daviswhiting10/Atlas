"use client";

import { Button } from "@/components/ui/button";
import { Trash2, Plus } from "lucide-react";

export type SetDraft = {
  setNumber: number;
  weight: number | null;
  isBodyweight: boolean;
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

function newSet(setNumber: number): SetDraft {
  return { setNumber, weight: null, isBodyweight: false, repMin: 8, repMax: 12, rpe: null, restSeconds: null, notes: "" };
}

function num(v: string): number | null {
  const n = parseFloat(v);
  return isNaN(n) ? null : n;
}

export function SetsTable({ sets, onChange, readOnly = false }: Props) {
  function update(idx: number, field: keyof SetDraft, value: SetDraft[keyof SetDraft]) {
    const next = sets.map((s, i) => (i === idx ? { ...s, [field]: value } : s));
    onChange(next);
  }

  function addSet() {
    onChange([...sets, newSet(sets.length + 1)]);
  }

  function removeSet(idx: number) {
    const next = sets
      .filter((_, i) => i !== idx)
      .map((s, i) => ({ ...s, setNumber: i + 1 }));
    onChange(next);
  }

  const cellCls = "border-b px-1.5 py-1";
  const inputCls = "w-full bg-transparent text-xs text-center focus:outline-none focus:ring-1 focus:ring-primary/40 rounded px-1 py-0.5 disabled:opacity-50";

  return (
    <div className="mt-2">
      <table className="w-full text-xs border rounded overflow-hidden">
        <thead>
          <tr className="bg-muted text-muted-foreground">
            <th className="px-1.5 py-1 text-center font-medium w-36">Weight</th>
            <th className="px-1.5 py-1 text-center font-medium">Reps</th>
            {!readOnly && <th className="w-6" />}
          </tr>
        </thead>
        <tbody>
          {sets.map((s, idx) => (
            <tr key={idx} className="hover:bg-muted/30">
              <td className={cellCls}>
                <div className="flex items-center gap-1 min-w-0">
                  {s.isBodyweight ? (
                    <span className="text-xs font-medium text-muted-foreground flex-1 text-center">BW</span>
                  ) : (
                    <input
                      type="number"
                      className={inputCls}
                      value={s.weight ?? ""}
                      placeholder="—"
                      disabled={readOnly}
                      onChange={(e) => update(idx, "weight", num(e.target.value))}
                    />
                  )}
                  {!readOnly && (
                    <button
                      type="button"
                      title={s.isBodyweight ? "Enter weight" : "Bodyweight / N/A"}
                      className="text-[10px] shrink-0 px-1 py-0.5 rounded border border-border text-muted-foreground hover:text-foreground hover:border-foreground leading-none"
                      onClick={() => {
                        const next = sets.map((row, i) =>
                          i === idx ? { ...row, isBodyweight: !row.isBodyweight, weight: null } : row
                        );
                        onChange(next);
                      }}
                    >
                      {s.isBodyweight ? "lb" : "N/A"}
                    </button>
                  )}
                </div>
              </td>
              <td className={cellCls}>
                <div className="flex items-center gap-0.5">
                  <input
                    type="number"
                    className={inputCls}
                    value={s.repMin}
                    min={1}
                    disabled={readOnly}
                    onChange={(e) => update(idx, "repMin", parseInt(e.target.value) || 1)}
                  />
                  <span className="text-muted-foreground">–</span>
                  <input
                    type="number"
                    className={inputCls}
                    value={s.repMax}
                    min={s.repMin}
                    disabled={readOnly}
                    onChange={(e) => update(idx, "repMax", Math.max(s.repMin, parseInt(e.target.value) || s.repMin))}
                  />
                </div>
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
          ))}
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
