/**
 * Every workout has the same shape: a Warm-up, main Blocks (Block 1, 2, 3…,
 * a superset inside a block lettered 1A, 1B…), and a Cool-down.
 *
 * Exercises keep their place in `section` (WorkoutExercise and
 * AssignedWorkoutExercise), written as:
 *   "warmup" | "block:<n>" | "cooldown"
 * Older values are read the same way: "block_a" and "Block A" are a block,
 * "Warmup" is the warm-up, a generator role ("squat", "core") or nothing at
 * all is an exercise done on its own (a block of one).
 *
 * Blocks are numbered in the order they appear, so the labels a coach's sheet
 * uses (A/B/C, 1A/1B, Block 2) all come out as Block 1, 2, 3. A letter is the
 * exercise's place inside its block.
 *
 * Pure: no I/O.
 */

export const WARMUP = "warmup";
export const COOLDOWN = "cooldown";
export const blockSection = (n: number) => `block:${n}`;

/** Where one section value puts an exercise. `group` is a block identity: same group, same block. */
export type Slot = { kind: "warmup" } | { kind: "cooldown" } | { kind: "group"; group: string } | { kind: "single" };

const WARMUP_WORDS = /^(warm[\s_-]*ups?|prep|preparation|activation|primer|movement prep|mobility warm[\s_-]*up)$/i;
const COOLDOWN_WORDS = /^(cool[\s_-]*downs?|stretch(ing)?|recovery|down[\s_-]*regulation)$/i;

/** One section value (stored, or a sheet's label) → its slot. */
export function readSection(raw: string | null | undefined): Slot {
  const s = (raw ?? "").trim().replace(/[.:)]+$/, "").trim();
  if (!s) return { kind: "single" };
  if (WARMUP_WORDS.test(s) || /^warm[\s_-]*up\b/i.test(s)) return { kind: "warmup" };
  if (COOLDOWN_WORDS.test(s) || /^cool[\s_-]*down\b/i.test(s)) return { kind: "cooldown" };
  // Canonical and older stored forms: "block:2", "block_a", "Block B", "Main A", "Superset 2", "Circuit B".
  const named = s.match(/^(?:block|main|superset|circuit|group|tri[\s-]*set|giant[\s-]*set)[\s:_-]*([a-z]|\d{1,2})$/i);
  if (named) return { kind: "group", group: named[1].toUpperCase() };
  // A sheet's own labels: "1", "1A", "2b", "A", "B2", "A1".
  const numberFirst = s.match(/^(\d{1,2})\s*[a-z]?\d?$/i);
  if (numberFirst) return { kind: "group", group: numberFirst[1] };
  const letterFirst = s.match(/^([a-z])\s*\d{0,2}$/i);
  if (letterFirst) return { kind: "group", group: letterFirst[1].toUpperCase() };
  // A generator role ("squat", "accessory", "finisher"), "Main", or anything else: on its own.
  return { kind: "single" };
}

export type StructuredItem<T> = { item: T; index: number; /** "1A", or "2" for a block of one. */ label: string | null };
export type StructuredBlock<T> = { n: number; items: StructuredItem<T>[] };
export type WorkoutStructure<T> = {
  warmup: StructuredItem<T>[];
  blocks: StructuredBlock<T>[];
  cooldown: StructuredItem<T>[];
};

/**
 * A workout's exercises in their parts. Items keep their original index (the
 * logger addresses exercises by it). A block is a run of exercises with the
 * same group; an exercise with no group is a block of its own.
 */
export function structure<T>(items: T[], sectionOf: (item: T) => string | null | undefined): WorkoutStructure<T> {
  const out: WorkoutStructure<T> = { warmup: [], blocks: [], cooldown: [] };
  let current: { group: string | null; block: StructuredBlock<T> } | null = null;
  items.forEach((item, index) => {
    const slot = readSection(sectionOf(item));
    if (slot.kind === "warmup") return void out.warmup.push({ item, index, label: null });
    if (slot.kind === "cooldown") return void out.cooldown.push({ item, index, label: null });
    const group = slot.kind === "group" ? slot.group : null;
    if (!current || group == null || current.group !== group) {
      current = { group, block: { n: out.blocks.length + 1, items: [] } };
      out.blocks.push(current.block);
    }
    current.block.items.push({ item, index, label: null });
  });
  for (const b of out.blocks) {
    b.items.forEach((it, i) => (it.label = b.items.length === 1 ? String(b.n) : `${b.n}${String.fromCharCode(65 + Math.min(i, 25))}`));
  }
  return out;
}

/** The section to store for each item, in the canonical form ("warmup" | "block:<n>" | "cooldown"). */
export function canonicalSections<T>(items: T[], sectionOf: (item: T) => string | null | undefined): string[] {
  const s = structure(items, sectionOf);
  const out = new Array<string>(items.length);
  for (const it of s.warmup) out[it.index] = WARMUP;
  for (const it of s.cooldown) out[it.index] = COOLDOWN;
  for (const b of s.blocks) for (const it of b.items) out[it.index] = blockSection(b.n);
  return out;
}

/** The parts in the order they're done, each with a heading. Warm-up and Cool-down are always there, even empty. */
export function parts<T>(s: WorkoutStructure<T>): Array<{ key: string; title: string; items: StructuredItem<T>[] }> {
  return [
    { key: WARMUP, title: "Warm-up", items: s.warmup },
    ...s.blocks.map((b) => ({ key: blockSection(b.n), title: `Block ${b.n}`, items: b.items })),
    { key: COOLDOWN, title: "Cool-down", items: s.cooldown },
  ];
}

/**
 * A spreadsheet day's labels → sections. The sheet's label column (A/B/C,
 * 1A/2B, "Warm-up") decides; with no label, an opening exercise whose own
 * note starts "Warm-up" is the warm-up, and a closing one whose note starts
 * "Cool-down" or "Stretch" is the cool-down.
 */
export function sectionsFromSheet(rows: Array<{ label?: string | null; notes?: string | null }>): string[] {
  const raw = rows.map((r) => (r.label ?? "").trim() || null);
  const noted = (r: { notes?: string | null }, re: RegExp) => re.test((r.notes ?? "").trim());
  // Leading warm-ups by note (only before any labelled block starts).
  for (let i = 0; i < rows.length; i++) {
    if (raw[i] && readSection(raw[i]).kind !== "warmup") {
      // A labelled group's first row can still be a warm-up by its note ("Ski erg: Warm-up, easy pace").
      if (i === 0 && noted(rows[i], /^warm[\s_-]*up\b/i)) raw[i] = WARMUP;
      break;
    }
    if (noted(rows[i], /^warm[\s_-]*up\b/i)) raw[i] = WARMUP;
    else if (!raw[i]) break;
  }
  // Trailing cool-downs by note.
  for (let i = rows.length - 1; i >= 0; i--) {
    if (raw[i] && readSection(raw[i]).kind !== "cooldown") break;
    if (noted(rows[i], /^(cool[\s_-]*down|stretch)/i)) raw[i] = COOLDOWN;
    else if (!raw[i]) break;
  }
  return canonicalSections(raw, (x) => x);
}
