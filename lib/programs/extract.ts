/**
 * The plan reader's contract with the model, for every importer (spreadsheets, PDFs, screenshots):
 *
 *   in:  every tab of a sheet as CSV with its row numbers, or every page of a PDF as its text plus its image
 *   out: one JSON shape (Extracted) the model fills in, checked and capped here
 *
 * Then the extraction becomes the grid the rest of the import already reads (lib/programs/sheet-plan): one entry per
 * week, so set bumps ("3 (Wk 3-4: 4)") and loads written per week land on the right weeks. Pure: no I/O.
 */

import Papa from "papaparse";
import type { SheetGrid } from "./sheet-plan";

export const MAX_NOTE_CHARS = 2000;

export type WeekOverride = { weeks: number[]; sets?: number | null; reps?: string | null; load?: string | null };

export type ExtractedExercise = {
  name: string;
  /** The block or section as written ("Warm-up", "Block 1", "3a", "Finisher", "Cool-down"), "" if none. */
  block: string;
  sets: number | null;
  /** Reps or time as written, without any "/side": "8-10", "12", "45 sec", "AMRAP". */
  reps: string;
  rest_seconds: number | null;
  note: string;
  unilateral: boolean;
  /** Exercises done back to back share a group ("3" for 3a and 3b). */
  superset_group: string | null;
  week_overrides: WeekOverride[];
  /** Fields the model had to guess ("rest", "sets"). */
  uncertain: string[];
};

export type Extracted = {
  plan_title: string;
  plan_notes: string;
  /** How many weeks the plan runs, when the file says (week columns, "4-week program"). */
  weeks: number | null;
  workouts: Array<{ day_label: string; exercises: ExtractedExercise[] }>;
  /** Anything else the model wasn't sure about. */
  uncertain: string[];
};

// ── In: the sheet as text with row numbers ───────────────────────────────────

/**
 * A sheet's CSV (one tab, or several each headed "Tab: <name>") with every row's number in front, as the coach
 * sees it ("12,Warm-up,Glute bridge,2,15"). Empty rows are left out; their numbers are skipped, not reused.
 */
export function numberSheetText(csv: string, maxChars = 60_000): string {
  const out: string[] = [];
  const blocks = csv.split(/^(?=Tab: )/m);
  for (const block of blocks) {
    const heading = block.match(/^Tab: ([^\n]*)\n/);
    const body = heading ? block.slice(heading[0].length) : block;
    if (heading) out.push(`Tab: ${heading[1].trim()}`);
    const rows = Papa.parse<string[]>(body.replace(/\n+$/, ""), { skipEmptyLines: false }).data;
    rows.forEach((row, i) => {
      const cells = row.map((c) => (c ?? "").trim());
      while (cells.length && !cells[cells.length - 1]) cells.pop();
      if (cells.length === 0) return;
      out.push(`${i + 1},${Papa.unparse([cells], { newline: "\n" })}`);
    });
    if (heading) out.push("");
  }
  return out.join("\n").trim().slice(0, maxChars);
}

// ── Out: the model's JSON, checked ───────────────────────────────────────────

const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : typeof v === "number" ? String(v) : "");
const int = (v: unknown, lo: number, hi: number): number | null => {
  const n = typeof v === "string" ? Number(v.trim()) : v;
  return typeof n === "number" && Number.isFinite(n) && n >= lo && n <= hi ? Math.round(n) : null;
};
const strings = (v: unknown, n: number, max: number) => (Array.isArray(v) ? v.map((x) => str(x, max)).filter(Boolean).slice(0, n) : []);

/** The model's reply as an Extracted, or null when it isn't one. Values are capped; nothing is invented. */
export function parseExtraction(reply: string): Extracted | null {
  let j: Record<string, unknown>;
  try {
    j = JSON.parse(reply.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "").trim());
  } catch {
    return null;
  }
  if (!j || !Array.isArray(j.workouts)) return null;
  const workouts = (j.workouts as unknown[])
    .slice(0, 14)
    .filter((w): w is Record<string, unknown> => !!w && typeof w === "object" && Array.isArray((w as Record<string, unknown>).exercises))
    .map((w) => ({
      day_label: str(w.day_label, 120),
      exercises: (w.exercises as unknown[])
        .slice(0, 60)
        .filter((e): e is Record<string, unknown> => !!e && typeof e === "object" && !!str((e as Record<string, unknown>).name, 120))
        .map((e) => ({
          name: str(e.name, 120),
          block: str(e.block, 40),
          sets: int(e.sets, 1, 20),
          reps: str(e.reps, 60),
          rest_seconds: int(e.rest_seconds, 0, 900),
          note: str(e.note, 500),
          unilateral: e.unilateral === true,
          superset_group: str(e.superset_group, 10) || null,
          week_overrides: (Array.isArray(e.week_overrides) ? e.week_overrides : [])
            .slice(0, 52)
            .filter((o): o is Record<string, unknown> => !!o && typeof o === "object")
            .map((o) => ({
              weeks: (Array.isArray(o.weeks) ? o.weeks : [o.week]).map((n) => int(n, 1, 52)).filter((n): n is number => n != null),
              sets: int(o.sets, 1, 20),
              reps: str(o.reps, 60) || null,
              load: str(o.load, 120) || null,
            }))
            .filter((o) => o.weeks.length > 0),
          uncertain: strings(e.uncertain, 6, 40),
        })),
    }))
    .filter((w) => w.exercises.length > 0);
  return {
    plan_title: str(j.plan_title, 120),
    plan_notes: str(j.plan_notes, MAX_NOTE_CHARS),
    weeks: int(j.weeks, 1, 52),
    workouts,
    uncertain: strings(j.uncertain, 20, 200),
  };
}

// ── Into the grid ────────────────────────────────────────────────────────────

const SIDE = /\s*(\/|per|each)\s*(side|leg|arm)\b\.?/i;

/** The reps text for the grid's "sets x reps" cell, and anything that can't go in it (kept as a note). */
function repsCell(reps: string): { reps: string; note: string | null; unilateral: boolean } {
  const unilateral = SIDE.test(reps);
  const clean = reps.replace(SIDE, "").trim();
  if (/^\d/.test(clean)) return { reps: clean, note: null, unilateral };
  // "AMRAP", "max": no number to plan with. One rep is the floor; the words go in the note.
  return { reps: "1", note: clean || null, unilateral };
}

/**
 * The extraction as the import grid: each workout a day; each exercise one entry per week with that week's sets x reps
 * (bumps applied) and any load written for it; block labels the grid's structure reads ("Warm-up", "1", "3A", "3B").
 */
export function extractionToGrid(ex: Extracted): SheetGrid {
  const lastOverride = Math.max(0, ...ex.workouts.flatMap((w) => w.exercises.flatMap((e) => e.week_overrides.flatMap((o) => o.weeks))));
  const weeks = Math.min(52, Math.max(1, ex.weeks ?? lastOverride ?? 1, lastOverride));
  const uncertain = [...ex.uncertain];

  const days = ex.workouts.map((w, wi) => {
    const dayName = w.day_label || `Workout ${wi + 1}`;
    let block = 0;
    let prevGroup: string | null = null;
    const inGroup = new Map<string, number>();
    const exercises = w.exercises.map((e) => {
      const b = e.block.toLowerCase();
      let label: string;
      if (/warm/.test(b)) label = "Warm-up";
      else if (/cool|stretch|mobility after/.test(b)) label = "Cool-down";
      else if (e.superset_group) {
        if (e.superset_group !== prevGroup) {
          block += 1;
          inGroup.set(e.superset_group, 0);
        }
        const k = inGroup.get(e.superset_group) ?? 0;
        inGroup.set(e.superset_group, k + 1);
        label = `${block}${String.fromCharCode(65 + Math.min(k, 25))}`;
      } else {
        block += 1;
        label = String(block);
      }
      prevGroup = e.superset_group;

      const base = repsCell(e.reps);
      const unilateral = e.unilateral || base.unilateral;
      const notes = [e.note, unilateral ? "Each side." : null, base.note].filter(Boolean).join(" ");
      for (const u of e.uncertain) uncertain.push(`${dayName} · ${e.name}: ${u}`);
      if (!e.reps) uncertain.push(`${dayName} · ${e.name}: reps`);

      const cells = Array.from({ length: weeks }, (_, i) => {
        const week = i + 1;
        const o = e.week_overrides.filter((x) => x.weeks.includes(week)).pop();
        const sets = o?.sets ?? e.sets ?? 1;
        const reps = o?.reps ? repsCell(o.reps).reps : base.reps;
        return { week, setsReps: e.reps || o?.reps ? `${sets}x${reps}` : "", load: o?.load ?? "" };
      });
      return { name: e.name, notes: notes || undefined, label, rest: e.rest_seconds, weeks: cells };
    });
    return { name: dayName, exercises };
  });

  return {
    programName: ex.plan_title || undefined,
    ...(ex.plan_notes ? { note: ex.plan_notes } : {}),
    ...(uncertain.length ? { uncertain: uncertain.slice(0, 30) } : {}),
    days,
  };
}

/** What the coach checks before saving: how many workouts, how many exercises in each, and what the model guessed. */
export function foundInFile(grid: SheetGrid): { workouts: Array<{ name: string; exercises: number }>; uncertain: string[] } {
  return { workouts: grid.days.map((d) => ({ name: d.name, exercises: d.exercises.length })), uncertain: grid.uncertain ?? [] };
}
