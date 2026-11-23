import { contextPromptSection } from "@/lib/programs/plan-context";

/**
 * The plan reader for every importer. The model gets the whole file (every tab of a spreadsheet as CSV with row
 * numbers; every page of a PDF as its text and its image; screenshots as images) and fills in one JSON shape
 * (lib/programs/extract.ts checks it and turns it into the plan). Written for any coach's layout: the patterns below
 * are examples, not the only layouts there are.
 */

export function buildProgramSheetPrompt(numberedSheet: string, notes?: string) {
  return {
    system: system("a spreadsheet, given as CSV. Every tab is included, each headed \"Tab: <name>\"; every row starts with its row number", notes),
    user: (notes?.trim() ? `The coach's note: ${notes.trim()}\n\n` : "") + `The spreadsheet:\n\n${numberedSheet}`,
  };
}

/** PDF pages (text and image for each) or screenshots (images only). */
export function buildProgramPagesPrompt(imageCount: number, notes?: string, pageTexts: string[] = []) {
  const withText = pageTexts.some((t) => t.trim());
  const texts = withText ? pageTexts.map((t, i) => `--- Page ${i + 1} text ---\n${t.trim() || "(no text on this page: read the image)"}`).join("\n\n") : "";
  return {
    system: system(
      withText
        ? `a PDF of ${imageCount} page${imageCount === 1 ? "" : "s"}. For each page you get its image (for the layout) and its extracted text (for exact words and numbers; trust the text where they differ)`
        : `${imageCount === 1 ? "an image" : `${imageCount} images`} (screenshots or photos of a plan), in order`,
      notes
    ),
    user: [notes?.trim() ? `The coach's note: ${notes.trim()}` : "", texts, `The plan is in the ${imageCount === 1 ? "image" : `${imageCount} images`} above, in order.`].filter(Boolean).join("\n\n"),
  };
}

function system(what: string, notes?: string) {
  return `You read a fitness coach's training plan from ${what}, and return it as JSON. Read the whole file: every tab, every page. Copy names and numbers as written; never invent an exercise, a number or a workout.

## Layouts coaches use (examples, not the only ones)
- Workout markers: "DAY 1 · GLUTES A", "Day 1", "Monday", "Session 1", "Lower A", "Workout B", or one workout per tab.
- A table per workout, with or without a Block column ("Warm-up", "Block 1", "A", "3a", "Finisher", "Cool-down").
- Week columns going across: "Wk 1 | Wk 2 | Wk 3 | Wk 4", each with its own sets/reps or a load. Empty week columns are for the client to log in: they still say how many weeks the plan runs.
- Weeks going down: a "Week 1" section, then "Week 2" with the same workouts. Merge them: one workout each, with week_overrides for what changes.
- Set bumps written in a cell: "3 (Wk 3-4: 4)" → sets 3, and week_overrides [{ "weeks": [3, 4], "sets": 4 }].
- One side at a time: "10/side", "8 each leg", "12 per arm" → reps "10", unilateral true.
- Supersets: a letter after the block number ("3a", "3b", "Block 2a", "A1/A2") → the same superset_group ("3", "2", "A").
- Sets and reps in separate columns, or together ("3x10", "3 x 8-12", "1 x 45 sec").
- Tables that are not workouts: a week overview (Week | Sets | Effort | Goal), a key, an intake, a how-to. Don't make workouts or exercises from them; put what they say in plan_notes.

## Output
Respond ONLY with JSON, no markdown fences, no commentary:
{
  "plan_title": string,
  "plan_notes": string,
  "weeks": number | null,
  "workouts": [
    {
      "day_label": string,
      "exercises": [
        {
          "name": string,
          "block": string,
          "sets": number | null,
          "reps": string,
          "rest_seconds": number | null,
          "note": string,
          "unilateral": boolean,
          "superset_group": string | null,
          "week_overrides": [ { "weeks": [number], "sets": number | null, "reps": string | null, "load": string | null } ],
          "uncertain": [string]
        }
      ]
    }
  ],
  "uncertain": [string]
}

## Rules
- Return as many workouts as the file has, in order: every DAY / session / tab that lists exercises. day_label is the marker as written ("DAY 1 · GLUTES A (hip thrust + hinge)").
- One entry per exercise row, in order, warm-ups and cool-downs included. block is the row's block or section label as written ("Warm-up", "Block 3a", "Finisher"), "" if none.
- sets: the number of sets as written for week 1 (null if not given). reps: reps or time as written without "/side" ("8-10", "15", "45 sec", "20-30 sec", "AMRAP").
- rest_seconds: rest between sets in seconds ("2 min" → 120, "90 sec" → 90, "2.5 min" → 150). null when there is no rest, it says "—", or it isn't clear.
- note: the row's coaching cue, swap or note, as written. Leave the week-log cells out of it.
- week_overrides: only for weeks that differ from week 1, or that have a load written in them ("135", "BW", "60 kg"): copy the load as written.
- weeks: how many weeks the plan runs, from week columns, week sections or the title ("4-Week Program"); null if the file doesn't say.
- plan_title: the plan's title if it has one. plan_notes: the plan-level text: the title line's notes, a week overview table written out line by line ("Week 1: 3 sets, effort 7, learn the movements"), how-to notes. "" if none.
- uncertain (per exercise): the fields you had to guess ("rest", "sets", "reps", "name"). The top-level uncertain: anything else you weren't sure of, in a few words each ("Day 3 might continue on page 4").
- If the file has no workouts at all, return "workouts": [].${contextPromptSection(notes)}`;
}
