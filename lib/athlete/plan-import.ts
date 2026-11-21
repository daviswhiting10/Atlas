/** The short "check it before saving" view of a plan the reader found (pure). */
import type { ImportedProgram } from "@/lib/programs/screenshot-program";
import { describeDay, type ImportSummary } from "@/lib/programs/sheet-summary";

export type ImportPreview = { title: string; meta: string; lines: string[] };

export function previewFromProgram(p: ImportedProgram, readAs: string): ImportPreview {
  const exercises = p.days.reduce((n, d) => n + d.sections.reduce((m, s) => m + s.exercises.length, 0), 0);
  return {
    title: p.name || "Imported plan",
    meta: `${readAs} · ${exercises} exercise${exercises === 1 ? "" : "s"}`,
    lines: p.days.map((d) => {
      const n = d.sections.reduce((m, s) => m + s.exercises.length, 0);
      return `${d.name}: ${n} exercise${n === 1 ? "" : "s"}`;
    }),
  };
}

export function previewFromSheet(summary: ImportSummary, name: string): ImportPreview {
  return {
    title: name,
    meta: `Read as ${summary.readAs} · ${summary.exercises} exercises`,
    lines: summary.days.map((d) => `${d.name}: ${describeDay(d)}`),
  };
}
