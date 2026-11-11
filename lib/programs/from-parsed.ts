/**
 * A program read from a coach's own material (photos, or a spreadsheet)
 * saved to their library, in the same shape the screenshot import's editor
 * saves. Exercise names are matched to the library; anything new is
 * created privately for the workspace.
 */

import { upsertProgram } from "@/lib/db/programs";
import { resolveExercise } from "./resolve-exercise";

export type ParsedExercise = {
  name: string;
  sets: number;
  repMin: number;
  repMax: number;
  unit?: "reps" | "secs";
  loadNote?: string;
  tempo?: string;
  restSeconds?: number | null;
  notes?: string;
};
export type ParsedProgram = {
  programName?: string;
  description?: string;
  durationWeeks?: number;
  days: Array<{ name: string; dayOfWeek: number; sections: Array<{ name: string; exercises: ParsedExercise[] }> }>;
};

/** The model's JSON, without fences, checked for the one thing we can't do without: workouts with exercises. */
export function readParsedProgram(raw: string): ParsedProgram | null {
  try {
    const parsed = JSON.parse(raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "").trim()) as ParsedProgram;
    if (!Array.isArray(parsed?.days)) return null;
    parsed.days = parsed.days.filter((d) => Array.isArray(d?.sections) && d.sections.some((s) => Array.isArray(s?.exercises) && s.exercises.length > 0));
    return parsed.days.length > 0 ? parsed : null;
  } catch {
    return null;
  }
}

const clampInt = (n: unknown, lo: number, hi: number, fallback: number) => {
  const v = Math.round(Number(n));
  return Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : fallback;
};

export async function saveParsedProgram(workspaceId: string, parsed: ParsedProgram, opts: { name: string; goals: string[] }) {
  const names = Array.from(new Set(parsed.days.flatMap((d) => d.sections.flatMap((s) => s.exercises.map((e) => String(e.name ?? "").trim()))).filter(Boolean)));
  const ids = new Map<string, string>();
  for (const name of names) ids.set(name, (await resolveExercise(name.slice(0, 120), workspaceId)).id);

  return upsertProgram(workspaceId, {
    name: opts.name.slice(0, 120),
    description: parsed.description?.slice(0, 2000) || null,
    goalTags: { goals: opts.goals, conditions: [] },
    blocks: [
      {
        name: "Block 1",
        order: 1,
        weeks: clampInt(parsed.durationWeeks, 1, 52, 1),
        workouts: parsed.days.slice(0, 14).map((d, i) => ({
          name: String(d.name || `Day ${i + 1}`).slice(0, 120),
          dayOfWeek: clampInt(d.dayOfWeek, 1, 7, (i % 7) + 1),
          order: i + 1,
          exercises: d.sections
            .flatMap((section) => section.exercises.map((e) => ({ ...e, section: section.name })))
            .filter((e) => ids.has(String(e.name ?? "").trim()))
            .map((e, j) => {
              const unit = e.unit === "secs" ? "secs" : "reps";
              const lo = clampInt(e.repMin, 0, 600, 8);
              const hi = Math.max(lo, clampInt(e.repMax, 0, 600, lo));
              return {
                exerciseId: ids.get(String(e.name).trim())!,
                order: j + 1,
                notes: e.notes?.slice(0, 1000) || null,
                section: e.section?.slice(0, 60) || null,
                prescribedSets: Array.from({ length: clampInt(e.sets, 1, 12, 3) }, (_, k) => ({
                  setNumber: k + 1,
                  weight: null,
                  unit,
                  repMin: lo,
                  repMax: hi,
                  rpe: null,
                  restSeconds: e.restSeconds && e.restSeconds > 0 ? clampInt(e.restSeconds, 1, 900, 60) : null,
                  notes: [e.loadNote, e.tempo].filter(Boolean).join(" | ").slice(0, 300),
                })),
              };
            }),
        })),
      },
    ],
  });
}
