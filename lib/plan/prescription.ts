/**
 * What a coach prescribed for an exercise, set by set: the weight, RPE, rest and a note on each set.
 * The athlete app shows these as written. Pure: no I/O.
 */

export type PrescribedSet = {
  weight?: number | null;
  repMin?: number;
  repMax?: number;
  unit?: "reps" | "secs";
  rpe?: number | null;
  restSeconds?: number | null;
  notes?: string | null;
};

const num = (n: number) => (Number.isInteger(n) ? String(n) : (Math.round(n * 10) / 10).toString());

/** "2:00" for 120 seconds. */
export const clock = (seconds: number): string => `${Math.floor(seconds / 60)}:${String(Math.round(seconds % 60)).padStart(2, "0")}`;

/** One number, or a low–high range: "8" or "7–9". Null when there are none. */
function span(values: number[]): string | null {
  if (values.length === 0) return null;
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  return lo === hi ? num(lo) : `${num(lo)}–${num(hi)}`;
}

/** The exercise at a glance: the weight across its sets ("95–115 lb"), the RPE ("7–9") and the rest ("2:00"). */
export function prescriptionLabels(sets: PrescribedSet[]): { weight: string | null; rpe: string | null; rest: string | null } {
  const weight = span(sets.flatMap((s) => (typeof s.weight === "number" && s.weight > 0 ? [s.weight] : [])));
  const rest = span(sets.flatMap((s) => (typeof s.restSeconds === "number" && s.restSeconds > 0 ? [s.restSeconds] : [])));
  return {
    weight: weight ? `${weight} lb` : null,
    rpe: span(sets.flatMap((s) => (typeof s.rpe === "number" && s.rpe > 0 ? [s.rpe] : []))),
    rest: rest ? (rest.includes("–") ? rest.split("–").map((x) => clock(Number(x))).join("–") : clock(Number(rest))) : null,
  };
}

/** What a set carries beyond its weight and reps: the target RPE, the rest after it and a note. Null when it has none. */
export function setPlan(s: PrescribedSet | undefined): { rpe: number | null; rest: number | null; note: string | null } | null {
  if (!s) return null;
  const rpe = typeof s.rpe === "number" && s.rpe > 0 ? s.rpe : null;
  const rest = typeof s.restSeconds === "number" && s.restSeconds > 0 ? s.restSeconds : null;
  const note = s.notes?.trim() || null;
  return rpe == null && rest == null && note == null ? null : { rpe, rest, note };
}
