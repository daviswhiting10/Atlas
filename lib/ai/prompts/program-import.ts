import { contextPromptSection } from "@/lib/programs/plan-context";

/**
 * A coach's plan spreadsheet, transcribed cell for cell. The model doesn't
 * interpret anything (sets, weights, which weeks are done): it copies each
 * exercise's name, notes, and every week's Sets/reps and Load cells exactly
 * as written. lib/programs/sheet-plan.ts reads them by rule.
 */
export function buildProgramSheetPrompt(csv: string, notes?: string) {
  return {
    system: sheetSystem("You transcribe a fitness coach's workout plan from a spreadsheet (given as CSV) into JSON. Copy cells exactly; do not interpret, convert, correct or invent anything.", notes),
    user: (notes?.trim() ? `The coach's note: ${notes.trim()}\n\n` : "") + `The spreadsheet, as CSV:\n\n${csv}`,
  };
}

/**
 * The same transcription, from images: the pages of a PDF or screenshots of a plan. Into the same grid as a spreadsheet,
 * so each week keeps its own sets, reps and loads (lib/programs/sheet-plan reads them the same way).
 */
export function buildProgramPagesPrompt(imageCount: number, notes?: string) {
  return {
    system: sheetSystem(
      `You transcribe a workout plan from ${imageCount === 1 ? "an image" : `${imageCount} images`} (the pages of a PDF, or screenshots) into JSON. Copy what is written exactly; do not interpret, convert, correct or invent anything.

## Weeks on separate pages
- A plan often gives each week its own page or section ("Week 1", "Week 2", …) with the same days and exercises. Merge them: one entry per training day, and for each exercise one "weeks" entry per week, taken from that week's page or section.
- Match an exercise across weeks by its day and name. An exercise that appears only in some weeks still gets an entry; its other weeks have "" cells.
- A table column for sets and one for reps go together in "setsReps" as written ("3" and "8-10" is "3x8-10"). A weight or load column goes in "load" ("135", "60 kg", "BW").`,
      notes
    ).replace("## Typical layout (yours may differ)", "## Typical spreadsheet layout (a page may look like this, or not)"),
    user: (notes?.trim() ? `The coach's note: ${notes.trim()}\n\n` : "") + `The plan is in the ${imageCount === 1 ? "image" : `${imageCount} images`} above, in order.`,
  };
}

function sheetSystem(intro: string, notes?: string) {
  return `${intro}

## Typical layout (yours may differ)
- A training day starts with a label like "Day 1" (often in the first column of a header row).
- Each exercise is a row: its name, often a notes column, then for each week a "Sets/reps" cell and a "Load" cell.
- Week headings ("Week 1", "Week 2", …) sit above their columns; in CSV a heading is often in one cell with the cells to its right blank.
- Exercises are often grouped: a label cell left of the name ("A", "B", "1A", "1B", "2A", "Block 2", "Warm-up", "Cool-down"), usually written only on a group's first row, with blank rows between groups.
- Blank rows separate groups. Don't output them.

## Output
Respond ONLY with JSON, no markdown fences, no commentary:
{
  "programName": string,
  "days": [
    {
      "name": string,
      "exercises": [
        {
          "label": string,
          "name": string,
          "notes": string,
          "weeks": [ { "week": number, "setsReps": string, "load": string } ]
        }
      ]
    }
  ]
}

## Rules
- One entry per training day, in sheet order. "name" is the day label as written (e.g. "Day 1").
- One entry per exercise row, in order. Copy the exercise name and its notes exactly.
- "label": the row's group label as written ("A", "1A", "2B", "Block 2", "Warm-up"). A label written once applies to the rows under it until a blank row, a new label or a new day: copy it onto each of those rows. A section heading row ("Warm-up", "Cool-down") is the label of the rows under it. Use "" when the row has no group.
- "weeks": one entry for every week column the sheet has, numbered 1, 2, 3… in order. "setsReps" and "load" are the cell text exactly as written ("2x12-15", "5 min", "4x20 yd", "12.5", "BW", "blue", "2nd to hardest. 3x"). Use "" for an empty cell. Never fill a cell in from another week. A time keeps its unit as written ("15 min", "15'", "90 s"); never drop or convert it. A row like "Bike, Zone 2, 15 min" is name "Bike", notes "Zone 2", setsReps "15 min".
- If the sheet has no week columns, treat the single set of columns as week 1.
- Skip rows that aren't exercises: titles, headers, totals, blank rows, the client's name, dates.
- "programName": a short name from the sheet's title if it has one, otherwise "".
- Transcribe the grid exactly even when the coach's note says otherwise: the note is applied afterwards.${contextPromptSection(notes)}`;
}
