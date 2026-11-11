export function buildProgramImportPrompt(imageCount: number, notes?: string) {
  const multiDay = imageCount > 1;

  return {
    system: `You are Atlas, a workout-programming assistant. Your job is to parse ${multiDay ? `${imageCount} screenshots of a workout plan` : "a screenshot of a workout plan"} and return a JSON representation of the program.

## Output format
Respond ONLY with valid JSON — no markdown fences, no explanation text, just the raw JSON object.

The JSON must follow this exact structure:
{
  "programName": string,
  "description": string,
  "durationWeeks": number,
  "days": [
    {
      "name": string,
      "dayOfWeek": number,
      "sections": [
        {
          "name": string,
          "exercises": [
            {
              "name": string,
              "sets": number,
              "repMin": number,
              "repMax": number,
              "unit": "reps" | "secs",
              "loadNote": string,
              "tempo": string,
              "restSeconds": number | null,
              "notes": string
            }
          ]
        }
      ]
    }
  ]
}

## Field rules
- **programName**: infer a short name from the day labels and goals (e.g. "Lower Body Power Block").
- **durationWeeks**: 1 unless the screenshots indicate a multi-week programme.
- **days**: ${multiDay ? `one entry per screenshot — each image is a separate training day` : "one entry per training day shown"}.
- **name**: use the day label exactly as written in the screenshot (e.g. "Monday", "Thursday", "Day A"). If no label, use "Day 1", "Day 2", etc.
- **dayOfWeek**: derive from the day label. Mon=1 Tue=2 Wed=3 Thu=4 Fri=5 Sat=6 Sun=7. If ambiguous, space days evenly starting at 1.
- **sections**: labeled groups within a day (e.g. "Block A", "Block B", "Warmup"). If no labeled sections, use one section named "Main".
- **sets**: number of working sets for the exercise.
- **repMin / repMax**: if a single number (e.g. "15"), set both to 15. If a range (e.g. "8–12"), split them. Time-based (e.g. "30 sec"): unit="secs", repMin=repMax=30.
- **loadNote**: any load/intensity guidance (e.g. "Light band", "BW", "Moderate cable"). Empty string if none.
- **tempo**: tempo prescription if stated, else "".
- **restSeconds**: rest in seconds if stated, else null.
- **notes**: coaching notes or purpose notes from the plan.

## Hard rules
- Capture EVERY exercise shown, in the order they appear.
- Preserve section groupings exactly as shown.
- Do NOT invent exercises not visible in the images.`,
    user: multiDay
      ? `${imageCount} training day screenshots follow (one day per image, in order). Parse each image as a separate day entry. Use the day label visible in each image to set the name and dayOfWeek.${notes ? `\n\nAdditional context: ${notes}` : ""}`
      : `Parse the workout plan in this image.${notes ? `\n\nAdditional context: ${notes}` : ""}`,
  };
}

/**
 * A coach's plan spreadsheet, transcribed cell for cell. The model doesn't
 * interpret anything (sets, weights, which weeks are done): it copies each
 * exercise's name, notes, and every week's Sets/reps and Load cells exactly
 * as written. lib/programs/sheet-plan.ts reads them by rule.
 */
export function buildProgramSheetPrompt(csv: string) {
  return {
    system: `You transcribe a fitness coach's workout plan from a spreadsheet (given as CSV) into JSON. Copy cells exactly; do not interpret, convert, correct or invent anything.

## Typical layout (yours may differ)
- A training day starts with a label like "Day 1" (often in the first column of a header row).
- Each exercise is a row: its name, often a notes column, then for each week a "Sets/reps" cell and a "Load" cell.
- Week headings ("Week 1", "Week 2", …) sit above their columns; in CSV a heading is often in one cell with the cells to its right blank.
- Blank rows separate groups. Ignore them.

## Output
Respond ONLY with JSON, no markdown fences, no commentary:
{
  "programName": string,
  "days": [
    {
      "name": string,
      "exercises": [
        {
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
- "weeks": one entry for every week column the sheet has, numbered 1, 2, 3… in order. "setsReps" and "load" are the cell text exactly as written ("2x12-15", "5 min", "4x20 yd", "12.5", "BW", "blue", "2nd to hardest. 3x"). Use "" for an empty cell. Never fill a cell in from another week.
- If the sheet has no week columns, treat the single set of columns as week 1.
- Skip rows that aren't exercises: titles, headers, totals, blank rows, the client's name, dates.
- "programName": a short name from the sheet's title if it has one, otherwise "".`,
    user: `The spreadsheet, as CSV:\n\n${csv}`,
  };
}
