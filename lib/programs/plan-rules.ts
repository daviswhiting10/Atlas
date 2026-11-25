/**
 * The plan design rules (lib/plan/rules) applied to a plan read from a file, before Save:
 *  - a lone number becomes a range by widening it down (10 → 8–10, 45 s → 30–45 s), flagged "range added";
 *    a range written in the file is kept exactly; 5 reps or fewer stays fixed, with the note "fixed: 3×5".
 *  - a strength workout with no core exercise is flagged ("No core work on Day 2") with one suggestion from the
 *    catalog that fits the plan's equipment. It is added only when accepted (addSuggestion); nothing else is rewritten.
 * The grid itself keeps what the file says: the ranges are applied when the prescription is written (save-sheet-plan),
 * so history imported from the sheet logs the reps as written.
 * Pure: no I/O.
 */

import { CATALOG_BY_SLUG, SLOTS, type Equipment, type Slot } from "@/lib/plan/catalog";
import { LONG_SECONDS, fixedNote, isCoreName, kindFromName, planViolations, widenDown, type CheckedDay } from "@/lib/plan/rules";
import { sectionsFromSheet } from "@/lib/workouts/structure";
import { formatTime, parseSetsReps, type GridExercise, type Rx, type SheetGrid } from "./sheet-plan";

/** Distances and calories are counted as reps but aren't reps: kept as written. */
const DISTANCE = /\b(yd|yds|yards?|m|meters?|metres?|ft|feet|km|mi|miles?|cals?|calories)\b/i;

export type SavedRange = { repMin: number; repMax: number; /** The set's note: "fixed: 3×5" for a single number kept on purpose. */ note: string | null; /** Widened from a lone number. */ added: boolean };

/** The range an imported prescription is saved with. */
export function savedRange(rx: Rx, name: string): SavedRange {
  const asWritten: SavedRange = { repMin: rx.repMin, repMax: rx.repMax, note: null, added: false };
  if (rx.repMin !== rx.repMax || kindFromName(name) !== "strength" || DISTANCE.test(rx.note ?? "")) return asWritten;
  const wide = widenDown(rx.repMax, rx.unit);
  if (wide) return { ...wide, note: null, added: true };
  if (rx.unit === "secs" && rx.repMax > LONG_SECONDS) return asWritten; // a long duration: exempt, like cardio
  return { ...asWritten, note: fixedNote(rx.sets, rx.unit === "secs" ? formatTime(rx.repMax) : String(rx.repMax)) };
}

const rxOf = (e: GridExercise, setsReps: string | undefined) => parseSetsReps(setsReps, `${e.name} ${e.notes ?? ""}`);
const shown = (min: number, max: number, unit: Rx["unit"]) => (unit === "secs" ? `${min}–${formatTime(max)}` : `${min}–${max}`);

/** The preview's "range added" lines, one per exercise: "Day 1 · Goblet Squat: range added, 10 → 8–10". */
export function rangeAddedLines(grid: SheetGrid): string[] {
  return grid.days.flatMap((d, i) =>
    d.exercises.flatMap((e) => {
      for (const w of e.weeks) {
        const rx = rxOf(e, w.setsReps);
        const r = rx && savedRange(rx, e.name);
        if (rx && r?.added) return [`${d.name || `Day ${i + 1}`} · ${e.name}: range added, ${rx.unit === "secs" ? formatTime(rx.repMax) : rx.repMax} → ${shown(r.repMin, r.repMax, rx.unit)}`];
      }
      return [];
    }),
  );
}

/** The grid as the rules read it (each day named by its index): each exercise at its first prescription, with the range it would be saved at. */
function checkedDays(grid: SheetGrid): CheckedDay[] {
  return grid.days.slice(0, 7).map((d, i) => {
    const sections = sectionsFromSheet(d.exercises);
    return {
      name: String(i),
      exercises: d.exercises.flatMap((e, j) => {
        const rx = e.weeks.map((w) => rxOf(e, w.setsReps)).find(Boolean);
        if (!rx) return [];
        const r = savedRange(rx, e.name);
        return [{ name: e.name, kind: kindFromName(e.name), core: isCoreName(e.name), unit: rx.unit, repMin: r.repMin, repMax: r.repMax, note: r.note, section: sections[j] }];
      }),
    };
  });
}

/** The equipment a plan uses, from its exercise names: a barbell, machine or cable means a gym. */
export function planEquipment(grid: SheetGrid): Equipment {
  const names = grid.days.flatMap((d) => d.exercises.map((e) => e.name)).join(" ");
  if (/\b(barbell|bb|machine|cable|smith|leg press|pull ?down|pec deck|hack squat|leg curl|leg extension|trap bar|ez ?bar|landmine)\b/i.test(names)) return "gym";
  if (/\b(dumbbells?|db|kettlebells?|kb|goblet)\b/i.test(names)) return "dumbbells";
  return "bodyweight";
}

export type CoreGap = { day: number; dayName: string; slug: string; name: string; /** "3 × 30–45 s" */ dose: string };

const CORE_SLOTS: Slot[] = ["core", "core2", "core3"];
/** What an added core exercise is prescribed, as a written range so it is kept exactly. */
const doseFor = (slug: string) => (CATALOG_BY_SLUG[slug].unit === "secs" ? { setsReps: "3x30-45 s", dose: "3 × 30–45 s" } : { setsReps: "3x10-12", dose: "3 × 10–12" });

/** Each strength workout with no core exercise, with one catalog suggestion that fits the equipment (rotating plank, then the next). */
export function coreGaps(grid: SheetGrid): CoreGap[] {
  const equipment = planEquipment(grid);
  const missing = new Set(planViolations(checkedDays(grid)).flatMap((v) => (v.kind === "no_core" ? [v.day] : [])));
  const gaps: CoreGap[] = [];
  grid.days.slice(0, 7).forEach((d, i) => {
    if (!missing.has(String(i))) return;
    const dayName = d.name || `Day ${i + 1}`;
    const slug = SLOTS[CORE_SLOTS[gaps.length % CORE_SLOTS.length]][equipment]!;
    gaps.push({ day: i, dayName, slug, name: CATALOG_BY_SLUG[slug].name, dose: doseFor(slug).dose });
  });
  return gaps;
}

/**
 * The accepted suggestion: the core exercise added to that day for every week the day has, before its cool-down.
 * Marked `added`, so it is never imported as history (the sheet doesn't say it was done).
 */
export function addSuggestion(grid: SheetGrid, day: number, slug: string): SheetGrid {
  const d = grid.days[day];
  const c = CATALOG_BY_SLUG[slug];
  if (!d || !c) return grid;
  const weeks = Array.from(new Set(d.exercises.flatMap((e) => e.weeks.filter((w) => w.setsReps).map((w) => w.week)))).sort((a, b) => a - b);
  const row: GridExercise = { name: c.name, added: true, weeks: weeks.map((week) => ({ week, setsReps: doseFor(slug).setsReps, load: "" })) };
  const sections = sectionsFromSheet(d.exercises);
  let at = d.exercises.length;
  while (at > 0 && sections[at - 1] === "cooldown") at -= 1;
  const exercises = [...d.exercises.slice(0, at), row, ...d.exercises.slice(at)];
  return { ...grid, days: grid.days.map((x, i) => (i === day ? { ...x, exercises } : x)) };
}
