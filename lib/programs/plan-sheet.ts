/**
 * Which tab of a workbook (or which pages of a PDF) hold the plan. A coach's file often opens with "How to use", a
 * cover or a client intake, and the plan is on a later tab. Every tab is scored by workout-table signals and the
 * best one is imported; the narrative text of the others is kept as a note on the plan. Pure: no I/O.
 *
 * Signals (any layout, any language of the coach's own words aside):
 *  - a header row with workout columns: Block, Exercise, Sets, Reps, Rest, Load, Tempo, RPE, Weight, Notes
 *  - day markers: "Day 1", "DAY 2 · UPPER", "Workout A", "Session 3"
 *  - week columns: "Wk 1", "Week 2"
 *  - prescriptions: "3x10", "4 x 8-12", "3 (Wk 3-4: 4)"
 * Long sentences count against a tab: that is a how-to, not a plan.
 */

export type Tab = { name: string; rows: string[][] };

const HEADER = /^(block|group|exercises?|movements?|sets?|reps?|rest|load|weight|tempo|rpe|rir|notes?|cues?|sets\s*[x×]\s*reps)$/i;
const DAY = /^(day|workout|session)\s*([0-9]{1,2}|[a-g])\b/i;
const WEEK = /^(wk|week)\s*[0-9]{1,2}\b/i;
const RX = /^\d{1,2}\s*([x×]\s*\d{1,4}(\s*[-–]\s*\d{1,4})?|\(\s*wk)/i;

/** How much this grid of cells looks like a workout table. 0 = nothing at all. */
export function scoreRows(rows: string[][]): number {
  let score = 0;
  for (const row of rows) {
    const cells = row.map((c) => (c ?? "").trim()).filter(Boolean);
    const headers = cells.filter((c) => HEADER.test(c)).length;
    if (headers >= 2) score += 10;
    for (const c of cells) {
      if (DAY.test(c)) score += 5;
      else if (WEEK.test(c)) score += 3;
      else if (RX.test(c)) score += 2;
      else if (c.length > 80) score -= 1;
    }
  }
  return Math.max(0, score);
}

/** Below this, a tab doesn't look like a plan at all. */
export const PLAN_SCORE = 12;

/** The tab to import and the others, best first. `plan` is null when no tab looks like a plan. */
export function pickPlanTab(tabs: Tab[]): { plan: Tab | null; others: Tab[]; scores: Array<{ name: string; score: number }> } {
  const scores = tabs.map((t) => ({ name: t.name, score: scoreRows(t.rows) }));
  let best = -1;
  scores.forEach((s, i) => {
    if (s.score >= PLAN_SCORE && (best < 0 || s.score > scores[best].score)) best = i;
  });
  return { plan: best >= 0 ? tabs[best] : null, others: tabs.filter((_, i) => i !== best), scores };
}

/** The sentences of a tab (or page) worth keeping as a note: text cells, one line per row. Numbers and grids left out. */
export function narrativeText(rows: string[][]): string {
  return rows
    .map((r) => r.map((c) => (c ?? "").trim()).filter((c) => c.length >= 12 && /[a-z]{3,}/i.test(c) && /\s/.test(c)).join(" "))
    .filter(Boolean)
    .join("\n");
}

export const MAX_NOTE_CHARS = 2000;

/** The plan's note from the tabs that weren't imported: "How to use: …". Null when they hold no sentences. */
export function noteFromTabs(others: Tab[]): string | null {
  const parts = others.map((t) => ({ name: t.name, text: narrativeText(t.rows) })).filter((p) => p.text);
  if (parts.length === 0) return null;
  const note = parts.map((p) => `${p.name}:\n${p.text}`).join("\n\n");
  return note.length > MAX_NOTE_CHARS ? `${note.slice(0, MAX_NOTE_CHARS - 1).trimEnd()}…` : note;
}

/** A PDF page's text as rows, so pages are scored by the same signals: lines split on runs of spaces or tabs. */
export function rowsFromText(text: string): string[][] {
  return text
    .split(/\r?\n/)
    .map((l) => l.split(/\t| {2,}| · (?=\S)/).map((c) => c.trim()))
    .filter((r) => r.some(Boolean));
}

/**
 * Which PDF pages to read (1-based), at most `max`, in page order: the pages that look like the plan. With no text
 * (a scanned PDF) or no page that looks like a plan, the first `max` pages, as before. `notePages` are the other
 * pages with sentences on them.
 */
export function pickPlanPages(pageTexts: string[], max: number): { pages: number[]; notePages: number[] } {
  const scored = pageTexts.map((t, i) => ({ page: i + 1, score: scoreRows(rowsFromText(t)), words: /[a-z]{3,}/i.test(t) }));
  const plan = scored.filter((p) => p.score >= PLAN_SCORE);
  if (plan.length === 0) return { pages: scored.slice(0, max).map((p) => p.page), notePages: [] };
  // The best pages if there are too many, then back into page order.
  const pages = [...plan].sort((a, b) => b.score - a.score).slice(0, max).map((p) => p.page).sort((a, b) => a - b);
  const notePages = scored.filter((p) => !pages.includes(p.page) && p.words && p.score < PLAN_SCORE).map((p) => p.page);
  return { pages, notePages };
}
